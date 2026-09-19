use super::file_rpc::FileRpcRequest;
use super::cmd_exec::CmdExecRequest;
use serde_json::Value;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ControlMessage {
    Ping,
    Pong,
    Resize { cols: u16, rows: u16 },
    FileRpc(FileRpcRequest),
    CmdExec(CmdExecRequest),
    Unknown(Value),
}

pub fn parse_control_message(text: &str) -> Option<ControlMessage> {
    let trimmed = text.trim();
    let json_slice = if let Some(stripped) = trimmed.strip_prefix("JSON:") {
        stripped
    } else if trimmed.starts_with('{') && trimmed.ends_with('}') {
        trimmed
    } else {
        return None;
    };

    let parsed: Value = serde_json::from_str(json_slice).ok()?;
    let msg_type = parsed.get("type").and_then(|t| t.as_str())?;

    match msg_type {
        "ping" => Some(ControlMessage::Ping),
        "pong" => Some(ControlMessage::Pong),
        "resize" => {
            let cols = parsed.get("cols").and_then(|c| c.as_u64()).unwrap_or(80) as u16;
            let rows = parsed.get("rows").and_then(|r| r.as_u64()).unwrap_or(24) as u16;
            Some(ControlMessage::Resize { cols, rows })
        }
        "file_rpc" => {
            let req: FileRpcRequest = serde_json::from_value(parsed).ok()?;
            Some(ControlMessage::FileRpc(req))
        }
        "cmd_exec" => {
            let req: CmdExecRequest = serde_json::from_value(parsed).ok()?;
            Some(ControlMessage::CmdExec(req))
        }
        _ => Some(ControlMessage::Unknown(parsed)),
    }
}

#[allow(dead_code)]
pub fn format_json_message<T: serde::Serialize>(msg: &T) -> Result<String, serde_json::Error> {
    let json = serde_json::to_string(msg)?;
    Ok(format!("JSON:{}", json))
}
