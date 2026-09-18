use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FileRpcRequest {
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    pub action: String,
    pub path: Option<String>,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRpcResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl FileRpcResponse {
    pub fn success(req_id: Option<String>, data: serde_json::Value) -> Self {
        Self {
            msg_type: "file_rpc_res".to_string(),
            req_id,
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(req_id: Option<String>, error: impl Into<String>) -> Self {
        Self {
            msg_type: "file_rpc_res".to_string(),
            req_id,
            success: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: f64,
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileListData {
    #[serde(rename = "currentPath")]
    pub current_path: String,
    #[serde(rename = "parentPath")]
    pub parent_path: Option<String>,
    pub separator: String,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReadData {
    pub path: String,
    pub size: u64,
    #[serde(rename = "isBinary")]
    pub is_binary: bool,
    pub content: String,
}
