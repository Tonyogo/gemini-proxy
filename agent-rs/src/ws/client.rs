use crate::config::Config;
use crate::protocol::message::{format_json_message, parse_control_message, ControlMessage};
use crate::pty::PtySession;
use crate::rpc::handle_file_rpc;
use crate::task::TaskManager;
use futures_util::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, error, info, warn};

use super::heartbeat::{HANDSHAKE_TIMEOUT, HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT};

pub struct TerminalAgentClient {
    config: Config,
    task_manager: TaskManager,
    shutdown: Arc<AtomicBool>,
    pty_session: Arc<RwLock<Option<Arc<PtySession>>>>,
    ws_tx: Arc<RwLock<Option<mpsc::Sender<Message>>>>,
    current_cols: Arc<AtomicU16>,
    current_rows: Arc<AtomicU16>,
}

impl TerminalAgentClient {
    pub fn new(config: Config, task_manager: TaskManager, shutdown: Arc<AtomicBool>) -> Self {
        Self {
            config,
            task_manager,
            shutdown,
            pty_session: Arc::new(RwLock::new(None)),
            ws_tx: Arc::new(RwLock::new(None)),
            current_cols: Arc::new(AtomicU16::new(80)),
            current_rows: Arc::new(AtomicU16::new(24)),
        }
    }

    pub async fn run_loop(&self) {
        let pty_session_clone = self.pty_session.clone();
        let ws_tx_clone = self.ws_tx.clone();
        let shutdown_clone = self.shutdown.clone();
        let config_clone = self.config.clone();
        let cols_clone = self.current_cols.clone();
        let rows_clone = self.current_rows.clone();

        // Persistent PTY background worker: keeps shell session alive across WS reconnects
        let pty_worker_handle = tokio::spawn(async move {
            while !shutdown_clone.load(Ordering::Relaxed) {
                // Ensure active PTY session
                let pty = {
                    let mut lock = pty_session_clone.write().await;
                    if let Some(p) = lock.as_ref() {
                        p.clone()
                    } else {
                        let shell = config_clone.get_shell();
                        let cols = cols_clone.load(Ordering::Relaxed);
                        let rows = rows_clone.load(Ordering::Relaxed);
                        match PtySession::spawn(&shell, cols, rows) {
                            Ok(p) => {
                                let arc = Arc::new(p);
                                *lock = Some(arc.clone());
                                arc
                            }
                            Err(e) => {
                                error!("[PTY] Failed to spawn shell {}: {}", shell, e);
                                tokio::time::sleep(Duration::from_millis(500)).await;
                                continue;
                            }
                        }
                    }
                };

                let mut buf = [0u8; 4096];
                loop {
                    if shutdown_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    match pty.read(&mut buf).await {
                        Ok(0) => {
                            info!("[PTY] Shell process exited (EOF)");
                            let mut lock = pty_session_clone.write().await;
                            if let Some(cur) = lock.as_ref() {
                                if Arc::ptr_eq(cur, &pty) {
                                    *lock = None;
                                }
                            }
                            break;
                        }
                        Ok(n) => {
                            let msg = Message::Binary(buf[..n].to_vec());
                            let ws_guard = ws_tx_clone.read().await;
                            if let Some(tx) = ws_guard.as_ref() {
                                let _ = tx.send(msg).await;
                            }
                        }
                        Err(e) => {
                            info!("[PTY] Shell process terminated: {}", e);
                            let mut lock = pty_session_clone.write().await;
                            if let Some(cur) = lock.as_ref() {
                                if Arc::ptr_eq(cur, &pty) {
                                    *lock = None;
                                }
                            }
                            break;
                        }
                    }
                }

                if !shutdown_clone.load(Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        });

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
        // Kill active PTY on clean shutdown
        {
            let mut lock = self.pty_session.write().await;
            if let Some(pty) = lock.take() {
                pty.kill();
            }
        }
        pty_worker_handle.abort();
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
        let (out_tx, mut out_rx) = mpsc::channel::<Message>(128);

        // Register active WebSocket writer sender
        {
            let mut guard = self.ws_tx.write().await;
            *guard = Some(out_tx.clone());
        }

        // WS writer task
        let ws_writer_task = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if ws_write.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Send initial resize control message ONLY (NEVER send reset to preserve history buffer!)
        let cols = self.current_cols.load(Ordering::Relaxed);
        let rows = self.current_rows.load(Ordering::Relaxed);
        if let Ok(resize_frame) = format_json_message(&serde_json::json!({ "type": "resize", "cols": cols, "rows": rows })) {
            let _ = out_tx.send(Message::Text(resize_frame)).await;
        }

        // Heartbeat state
        let mut heartbeat_interval = tokio::time::interval(HEARTBEAT_INTERVAL);
        heartbeat_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        heartbeat_interval.tick().await; // Consume immediate t=0 tick
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
                                        self.current_cols.store(cols, Ordering::Relaxed);
                                        self.current_rows.store(rows, Ordering::Relaxed);
                                        let lock = self.pty_session.read().await;
                                        if let Some(pty) = lock.as_ref() {
                                            pty.resize(cols, rows);
                                        }
                                    }
                                    ControlMessage::Reset => {
                                        info!("[Agent] Reset PTY requested by server");
                                        let mut lock = self.pty_session.write().await;
                                        if let Some(old_pty) = lock.take() {
                                            old_pty.kill();
                                        }
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
                                let lock = self.pty_session.read().await;
                                if let Some(pty) = lock.as_ref() {
                                    let _ = pty.write_all(text.as_bytes()).await;
                                }
                            }
                        }
                        Some(Ok(Message::Binary(bin))) => {
                            waiting_for_pong = false;
                            // Raw binary bytes from user keyboard to PTY stdin
                            let lock = self.pty_session.read().await;
                            if let Some(pty) = lock.as_ref() {
                                let _ = pty.write_all(&bin).await;
                            }
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

        // Cleanup active WS channel (PTY session is preserved)
        {
            let mut guard = self.ws_tx.write().await;
            *guard = None;
        }
        ws_writer_task.abort();

        connection_error
    }
}
