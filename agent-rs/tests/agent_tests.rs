#[path = "../src/config.rs"]
mod config;
#[path = "../src/protocol/mod.rs"]
mod protocol;
#[path = "../src/pty/mod.rs"]
mod pty;
#[path = "../src/rpc/mod.rs"]
mod rpc;
#[path = "../src/task/mod.rs"]
mod task;

use config::Config;
use protocol::cmd_exec::CmdExecRequest;
use protocol::file_rpc::FileRpcRequest;
use protocol::message::{parse_control_message, ControlMessage};
use rpc::handle_file_rpc;
use task::TaskManager;

#[test]
fn test_config_resolution() {
    let cfg = Config {
        server: "https://proxy.example.com".to_string(),
        key: "secret123".to_string(),
        id: Some("custom-host-1".to_string()),
        name: Some("custom-name".to_string()),
        shell: Some("/bin/sh".to_string()),
    };

    assert_eq!(cfg.get_host_id(), "custom-host-1");
    assert_eq!(cfg.get_host_name(), "custom-name");
    assert_eq!(cfg.get_shell(), "/bin/sh");

    let ws_url = cfg.resolve_ws_url().expect("Failed to resolve URL");
    assert!(ws_url.starts_with("wss://proxy.example.com/api/terminal/agent-ws?"));
    assert!(ws_url.contains("hostId=custom-host-1"));
    assert!(ws_url.contains("name=custom-name"));
    assert!(ws_url.contains("key=secret123"));
}

#[test]
fn test_control_message_parsing() {
    // Ping & Pong
    match parse_control_message("JSON:{\"type\":\"ping\"}") {
        Some(ControlMessage::Ping) => {}
        _ => panic!("Expected Ping"),
    }
    match parse_control_message("JSON:{\"type\":\"pong\"}") {
        Some(ControlMessage::Pong) => {}
        _ => panic!("Expected Pong"),
    }

    // Resize
    match parse_control_message("JSON:{\"type\":\"resize\",\"cols\":120,\"rows\":40}") {
        Some(ControlMessage::Resize { cols, rows }) => {
            assert_eq!(cols, 120);
            assert_eq!(rows, 40);
        }
        _ => panic!("Expected Resize"),
    }

    // Bare JSON tolerance
    match parse_control_message("{\"type\":\"ping\"}") {
        Some(ControlMessage::Ping) => {}
        _ => panic!("Expected Ping from bare JSON"),
    }

    // Non-control plain text
    assert!(parse_control_message("ls -la\n").is_none());
    assert!(parse_control_message("hello world").is_none());
}

#[tokio::test]
async fn test_file_rpc_lifecycle() {
    let temp_dir = std::env::temp_dir().join(format!("agent_test_dir_{}", std::process::id()));
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;
    tokio::fs::create_dir_all(&temp_dir).await.unwrap();

    let temp_dir_str = temp_dir.to_string_lossy().to_string();

    // 1. Write file
    let write_req = FileRpcRequest {
        req_id: Some("req_w1".to_string()),
        action: "write".to_string(),
        path: Some(temp_dir.join("test.txt").to_string_lossy().to_string()),
        params: Some(serde_json::json!({ "content": "Hello Rust Agent" })),
    };
    let write_res = handle_file_rpc(write_req).await;
    assert!(write_res.success);

    // 2. Read file
    let read_req = FileRpcRequest {
        req_id: Some("req_r1".to_string()),
        action: "read".to_string(),
        path: Some(temp_dir.join("test.txt").to_string_lossy().to_string()),
        params: None,
    };
    let read_res = handle_file_rpc(read_req).await;
    assert!(read_res.success);
    let data = read_res.data.unwrap();
    assert_eq!(data["content"], "Hello Rust Agent");
    assert_eq!(data["isBinary"], false);

    // 3. List directory
    let list_req = FileRpcRequest {
        req_id: Some("req_l1".to_string()),
        action: "list".to_string(),
        path: Some(temp_dir_str.clone()),
        params: None,
    };
    let list_res = handle_file_rpc(list_req).await;
    assert!(list_res.success);
    let list_data = list_res.data.unwrap();
    let files = list_data["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["name"], "test.txt");
    assert_eq!(files[0]["extension"], "txt");

    // 4. Mkdir
    let mkdir_req = FileRpcRequest {
        req_id: Some("req_m1".to_string()),
        action: "mkdir".to_string(),
        path: Some(temp_dir_str.clone()),
        params: Some(serde_json::json!({ "dirName": "subdir" })),
    };
    let mkdir_res = handle_file_rpc(mkdir_req).await;
    assert!(mkdir_res.success);

    // 5. Upload chunk
    let upload_req = FileRpcRequest {
        req_id: Some("req_u1".to_string()),
        action: "upload_chunk".to_string(),
        path: Some(temp_dir_str.clone()),
        params: Some(serde_json::json!({
            "filename": "chunk.bin",
            "data": "SGVsbG8gQ2h1bms=" // "Hello Chunk" in base64
        })),
    };
    let upload_res = handle_file_rpc(upload_req).await;
    assert!(upload_res.success);

    // 6. Download chunk
    let download_req = FileRpcRequest {
        req_id: Some("req_d1".to_string()),
        action: "download_chunk".to_string(),
        path: Some(temp_dir.join("chunk.bin").to_string_lossy().to_string()),
        params: None,
    };
    let download_res = handle_file_rpc(download_req).await;
    assert!(download_res.success);
    assert_eq!(download_res.data.unwrap(), "SGVsbG8gQ2h1bms=");

    // Clean up
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;
}

#[tokio::test]
async fn test_task_manager_execution() {
    let tm = TaskManager::new();

    // Start task: echo test
    let start_req = CmdExecRequest {
        req_id: Some("req_t1".to_string()),
        action: "start".to_string(),
        task_id: Some("task_test_001".to_string()),
        command: Some("echo 'task execution output test'".to_string()),
        cwd: None,
        timeout_ms: Some(5000),
        env: None,
    };

    let start_res = tm.handle_cmd_exec(start_req).await;
    assert!(start_res.success);
    assert_eq!(start_res.task_id.as_deref(), Some("task_test_001"));

    // Wait for task to finish
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Check status
    let status_req = CmdExecRequest {
        req_id: Some("req_t2".to_string()),
        action: "status".to_string(),
        task_id: Some("task_test_001".to_string()),
        command: None,
        cwd: None,
        timeout_ms: None,
        env: None,
    };
    let status_res = tm.handle_cmd_exec(status_req).await;
    assert!(status_res.success);
    let data = status_res.data.unwrap();
    assert_eq!(data["status"], "completed");
    assert_eq!(data["exitCode"], 0);
    assert!(data["stdout"].as_str().unwrap().contains("task execution output test"));
}

#[tokio::test]
async fn test_task_manager_kill() {
    let tm = TaskManager::new();

    let start_req = CmdExecRequest {
        req_id: Some("req_k1".to_string()),
        action: "start".to_string(),
        task_id: Some("task_kill_001".to_string()),
        command: Some("sleep 30".to_string()),
        cwd: None,
        timeout_ms: Some(30000),
        env: None,
    };

    let start_res = tm.handle_cmd_exec(start_req).await;
    assert!(start_res.success);

    // Give it 100ms to spawn
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let kill_req = CmdExecRequest {
        req_id: Some("req_k2".to_string()),
        action: "kill".to_string(),
        task_id: Some("task_kill_001".to_string()),
        command: None,
        cwd: None,
        timeout_ms: None,
        env: None,
    };
    let kill_res = tm.handle_cmd_exec(kill_req).await;
    assert!(kill_res.success);

    let status = tm.get_task_status("task_kill_001").await.unwrap();
    assert_eq!(status.status, "killed");
}

#[tokio::test]
async fn test_pty_session_lifecycle() {
    let pty = pty::PtySession::spawn("/bin/sh", 80, 24).expect("Failed to spawn PTY");

    // Write command to PTY
    pty.write_all(b"echo 'pty_works'\n").await.expect("Failed to write to PTY");

    let mut buf = [0u8; 1024];
    let mut output = String::new();

    // Read until output contains our marker or timeout
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(3) {
        if let Ok(n) = tokio::time::timeout(std::time::Duration::from_millis(500), pty.read(&mut buf)).await {
            if let Ok(count) = n {
                if count > 0 {
                    output.push_str(&String::from_utf8_lossy(&buf[..count]));
                    if output.contains("pty_works") {
                        break;
                    }
                }
            }
        }
    }

    assert!(output.contains("pty_works"), "PTY output did not contain 'pty_works': {}", output);

    // Test resize
    pty.resize(100, 30);

    // Kill PTY
    pty.kill();
}

#[tokio::test]
async fn test_pty_cleans_tmux_environment() {
    std::env::set_var("TMUX", "/tmp/tmux-mock/default,999,0");
    std::env::set_var("TMUX_PANE", "%99");

    let pty = pty::PtySession::spawn("/bin/sh", 80, 24).expect("Failed to spawn PTY");

    pty.write_all(b"val=${TMUX:-empty}; echo TMUX_RES:$val:DONE\n").await.expect("Failed to write to PTY");

    let mut buf = [0u8; 1024];
    let mut output = String::new();

    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(3) {
        if let Ok(n) = tokio::time::timeout(std::time::Duration::from_millis(500), pty.read(&mut buf)).await {
            if let Ok(count) = n {
                if count > 0 {
                    output.push_str(&String::from_utf8_lossy(&buf[..count]));
                    if output.contains("TMUX_RES:empty:DONE") {
                        break;
                    }
                }
            }
        }
    }

    assert!(output.contains("TMUX_RES:empty:DONE"), "TMUX env was not stripped! Output: {}", output);

    pty.kill();
}

