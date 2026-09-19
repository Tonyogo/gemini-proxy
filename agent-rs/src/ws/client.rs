use crate::config::Config;
use crate::protocol::message::{format_json_message, parse_control_message, ControlMessage};
use crate::pty::PtySession;
use crate::rpc::handle_file_rpc;
use crate::task::TaskManager;
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

use super::heartbeat::{HANDSHAKE_TIMEOUT, HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT};

pub struct TerminalAgentClient {
    config: Config,
    task_manager: TaskManager,
    shutdown: Arc<AtomicBool>,
}

impl TerminalAgentClient {
    pub fn new(config: Config, task_manager: TaskManager, shutdown: Arc<AtomicBool>) -> Self {
        Self {
            config,
            task_manager,
            shutdown,
        }
    }

    pub async fn run_loop(&self) {
        let mut reconnect_attempts: u32 = 0;

        while !self.shutdown.load(Ordering::Relaxed) {
            let ws_url = match self.config.resolve_ws_url() {
                Ok(url) => url,
                Err(e) => {
                    error!("[Agent] Failed to build WebSocket URL: {}", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };

            info!("[Agent] Connecting to {} (attempt {})...", self.config.server, reconnect_attempts + 1);

            let connect_future = connect_async(&ws_url);
            let connect_result = tokio::time::timeout(HANDSHAKE_TIMEOUT, connect_future).await;

            match connect_result {
                Ok(Ok((ws_stream, _response))) => {
                    info!("[Agent] Connected successfully to target hub");
                    reconnect_attempts = 0;

                    if let Err(e) = self.handle_connection(ws_stream).await {
                        warn!("[Agent] Connection closed or error: {}", e);
                    }
                }
                Ok(Err(e)) => {
                    warn!("[Agent] WebSocket handshake failed: {}", e);
                    reconnect_attempts += 1;
                }
                Err(_) => {
                    warn!("[Agent] WebSocket handshake timed out after 4s");
                    reconnect_attempts += 1;
                }
            }

            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            // Exponential backoff: min(1000 * 1.5^attempts, 15000) ms
            let base_delay_ms = (1000.0 * 1.5_f64.powi(reconnect_attempts.min(10) as i32)) as u64;
            let delay_ms = base_delay_ms.min(15000);
            info!("[Agent] Reconnecting in {:.2}s...", delay_ms as f64 / 1000.0);
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }

        info!("[Agent] Client loop exited gracefully");
    }

    async fn handle_connection<S>(&self, ws_stream: S) -> Result<(), String>
    where
        S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
            + SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error>
            + Unpin
            + Send
            + 'static,
    {
        let (mut ws_write, mut ws_read) = ws_stream.split();

        // Spawn PTY session
        let shell = self.config.get_shell();
        let pty = Arc::new(PtySession::spawn(&shell, 80, 24).map_err(|e| format!("Failed to spawn PTY: {}", e))?);

        let (out_tx, mut out_rx) = mpsc::channel::<Message>(128);

        // Task to send outgoing messages to WebSocket
        let out_tx_clone = out_tx.clone();
        let pty_ref = pty.clone();
        let shutdown_ref = self.shutdown.clone();

        // PTY reader task -> ws
        let pty_read_task = tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            while !shutdown_ref.load(Ordering::Relaxed) {
                match pty_ref.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let msg = Message::Binary(buf[..n].to_vec());
                        if out_tx_clone.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        debug!("[PTY] Read error: {}", e);
                        break;
                    }
                }
            }
        });

        // WS sink task
        let ws_writer_task = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if ws_write.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Send initial reset and resize control messages to sync state with backend
        if let Ok(reset_frame) = format_json_message(&serde_json::json!({ "type": "reset" })) {
            let _ = out_tx.send(Message::Text(reset_frame)).await;
        }
        if let Ok(resize_frame) = format_json_message(&serde_json::json!({ "type": "resize", "cols": 80, "rows": 24 })) {
            let _ = out_tx.send(Message::Text(resize_frame)).await;
        }

        // Heartbeat state
        let mut heartbeat_interval = tokio::time::interval(HEARTBEAT_INTERVAL);
        heartbeat_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut waiting_for_pong = false;
        let mut pong_deadline = tokio::time::Instant::now() + Duration::from_secs(3600);

        let mut connection_error = Ok(());

        loop {
            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            tokio::select! {
                _ = heartbeat_interval.tick() => {
                    let ping_frame = format_json_message(&serde_json::json!({ "type": "ping" })).unwrap();
                    if out_tx.send(Message::Text(ping_frame)).await.is_err() {
                        connection_error = Err("Failed to queue heartbeat ping".to_string());
                        break;
                    }
                    waiting_for_pong = true;
                    pong_deadline = tokio::time::Instant::now() + HEARTBEAT_TIMEOUT;
                }

                _ = tokio::time::sleep_until(pong_deadline), if waiting_for_pong => {
                    warn!("[Agent] Heartbeat timeout ({}s) on {}. Terminating dead connection...", HEARTBEAT_TIMEOUT.as_secs(), self.config.server);
                    connection_error = Err("Heartbeat timeout".to_string());
                    break;
                }

                msg_opt = ws_read.next() => {
                    match msg_opt {
                        Some(Ok(Message::Text(text))) => {
                            waiting_for_pong = false; // Reset pong deadline on any activity

                            if let Some(ctrl) = parse_control_message(&text) {
                                match ctrl {
                                    ControlMessage::Ping => {
                                        let pong_frame = format_json_message(&serde_json::json!({ "type": "pong" })).unwrap();
                                        let _ = out_tx.send(Message::Text(pong_frame)).await;
                                    }
                                    ControlMessage::Pong => {
                                        waiting_for_pong = false;
                                    }
                                    ControlMessage::Resize { cols, rows } => {
                                        pty.resize(cols, rows);
                                    }
                                    ControlMessage::FileRpc(req) => {
                                        let res = handle_file_rpc(req).await;
                                        if let Ok(res_str) = format_json_message(&res) {
                                            let _ = out_tx.send(Message::Text(res_str)).await;
                                        }
                                    }
                                    ControlMessage::CmdExec(req) => {
                                        let res = self.task_manager.handle_cmd_exec(req).await;
                                        if let Ok(res_str) = format_json_message(&res) {
                                            let _ = out_tx.send(Message::Text(res_str)).await;
                                        }
                                    }
                                    ControlMessage::Unknown(val) => {
                                        debug!("[Agent] Received unhandled control frame: {:?}", val);
                                    }
                                }
                            } else {
                                // Raw text from user keyboard to PTY stdin
                                let _ = pty.write_all(text.as_bytes()).await;
                            }
                        }
                        Some(Ok(Message::Binary(bin))) => {
                            waiting_for_pong = false;
                            // Raw binary bytes from user keyboard to PTY stdin
                            let _ = pty.write_all(&bin).await;
                        }
                        Some(Ok(Message::Ping(p))) => {
                            waiting_for_pong = false;
                            let _ = out_tx.send(Message::Pong(p)).await;
                        }
                        Some(Ok(Message::Pong(_))) => {
                            waiting_for_pong = false;
                        }
                        Some(Ok(Message::Close(_))) => {
                            info!("[Agent] Upstream sent close frame");
                            break;
                        }
                        Some(Ok(Message::Frame(_))) => {}
                        Some(Err(e)) => {
                            connection_error = Err(format!("WebSocket read error: {}", e));
                            break;
                        }
                        None => {
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup
        pty.kill();
        pty_read_task.abort();
        ws_writer_task.abort();

        connection_error
    }
}
