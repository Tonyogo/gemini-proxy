use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CmdExecRequest {
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    pub action: String,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    #[serde(rename = "timeoutMs")]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub signal: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmdExecResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub action: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CmdExecResponse {
    pub fn success(req_id: Option<String>, task_id: Option<String>, action: String, data: serde_json::Value) -> Self {
        Self {
            msg_type: "cmd_exec_res".to_string(),
            req_id,
            task_id,
            action,
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(req_id: Option<String>, task_id: Option<String>, action: String, error: impl Into<String>) -> Self {
        Self {
            msg_type: "cmd_exec_res".to_string(),
            req_id,
            task_id,
            action,
            success: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPollData {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub output: String,
    pub offset: usize,
    #[serde(rename = "outputOffset")]
    pub output_offset: usize,
    #[serde(rename = "totalBytes")]
    pub total_bytes: usize,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "startTime")]
    pub start_time: u64,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummaryItem {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "startTime")]
    pub start_time: u64,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskListData {
    pub tasks: Vec<TaskSummaryItem>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStatusData {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "startTime")]
    pub start_time: u64,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    pub stdout: String,
    pub stderr: String,
    pub output: String,
}
