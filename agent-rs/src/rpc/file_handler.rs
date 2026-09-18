use crate::protocol::file_rpc::{FileEntry, FileListData, FileReadData, FileRpcRequest, FileRpcResponse};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::fs;

const MAX_READ_SIZE: u64 = 5 * 1024 * 1024; // 5 MB

pub async fn handle_file_rpc(req: FileRpcRequest) -> FileRpcResponse {
    let req_id = req.req_id;
    let action = req.action.as_str();

    let target_path = req.path.as_deref().unwrap_or("");
    let resolved_path = resolve_path(target_path);

    match action {
        "list" => match handle_list(&resolved_path).await {
            Ok(data) => FileRpcResponse::success(req_id, serde_json::to_value(data).unwrap()),
            Err(e) => FileRpcResponse::error(req_id, e),
        },
        "read" => match handle_read(&resolved_path).await {
            Ok(data) => FileRpcResponse::success(req_id, serde_json::to_value(data).unwrap()),
            Err(e) => FileRpcResponse::error(req_id, e),
        },
        "write" => {
            let content = req.params
                .as_ref()
                .and_then(|p| p.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("");
            match fs::write(&resolved_path, content).await {
                Ok(_) => FileRpcResponse::success(req_id, serde_json::json!({ "success": true })),
                Err(e) => FileRpcResponse::error(req_id, e.to_string()),
            }
        }
        "mkdir" => {
            let dir_name = req.params
                .as_ref()
                .and_then(|p| p.get("dirName"))
                .and_then(|d| d.as_str())
                .unwrap_or("new-folder");
            let full_path = resolved_path.join(dir_name);
            match fs::create_dir_all(&full_path).await {
                Ok(_) => FileRpcResponse::success(req_id, serde_json::json!({ "success": true })),
                Err(e) => FileRpcResponse::error(req_id, e.to_string()),
            }
        }
        "rename" => {
            let new_path_str = req.params
                .as_ref()
                .and_then(|p| p.get("newPath"))
                .and_then(|np| np.as_str())
                .unwrap_or("");
            if new_path_str.is_empty() {
                return FileRpcResponse::error(req_id, "Missing newPath parameter");
            }
            let new_path = resolve_path(new_path_str);
            match fs::rename(&resolved_path, &new_path).await {
                Ok(_) => FileRpcResponse::success(req_id, serde_json::json!({ "success": true })),
                Err(e) => FileRpcResponse::error(req_id, e.to_string()),
            }
        }
        "delete" => match fs::metadata(&resolved_path).await {
            Ok(meta) => {
                let res = if meta.is_dir() {
                    fs::remove_dir_all(&resolved_path).await
                } else {
                    fs::remove_file(&resolved_path).await
                };
                match res {
                    Ok(_) => FileRpcResponse::success(req_id, serde_json::json!({ "success": true })),
                    Err(e) => FileRpcResponse::error(req_id, e.to_string()),
                }
            }
            Err(e) => FileRpcResponse::error(req_id, e.to_string()),
        },
        "upload_chunk" => {
            let filename = req.params
                .as_ref()
                .and_then(|p| p.get("filename"))
                .and_then(|f| f.as_str())
                .unwrap_or("");
            let b64_data = req.params
                .as_ref()
                .and_then(|p| p.get("data"))
                .and_then(|d| d.as_str())
                .unwrap_or("");
            if filename.is_empty() {
                return FileRpcResponse::error(req_id, "Missing filename for upload_chunk");
            }
            let full_path = resolved_path.join(filename);
            match BASE64.decode(b64_data) {
                Ok(bytes) => match fs::write(&full_path, bytes).await {
                    Ok(_) => FileRpcResponse::success(req_id, serde_json::json!({ "success": true })),
                    Err(e) => FileRpcResponse::error(req_id, e.to_string()),
                },
                Err(e) => FileRpcResponse::error(req_id, format!("Invalid base64 payload: {}", e)),
            }
        }
        "download_chunk" => match fs::read(&resolved_path).await {
            Ok(bytes) => {
                let encoded = BASE64.encode(bytes);
                FileRpcResponse::success(req_id, serde_json::Value::String(encoded))
            }
            Err(e) => FileRpcResponse::error(req_id, e.to_string()),
        },
        unknown => FileRpcResponse::error(req_id, format!("Unknown action: {}", unknown)),
    }
}

fn resolve_path(input: &str) -> PathBuf {
    if input.is_empty() {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
        return std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    }
    let p = Path::new(input);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(p)
    }
}

async fn handle_list(path: &Path) -> Result<FileListData, String> {
    let meta = fs::metadata(path)
        .await
        .map_err(|_| format!("Path not found: {}", path.display()))?;

    if !meta.is_dir() {
        return Err("Target is not a directory".to_string());
    }

    let mut read_dir = fs::read_dir(path)
        .await
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if let Ok(entry_meta) = fs::metadata(&entry_path).await {
            let is_dir = entry_meta.is_dir();
            let size = if is_dir { 0 } else { entry_meta.len() };
            let updated_at = entry_meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs_f64() * 1000.0)
                .unwrap_or(0.0);

            let extension = if is_dir {
                String::new()
            } else {
                entry_path
                    .extension()
                    .map(|ext| ext.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
            };

            files.push(FileEntry {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_directory: is_dir,
                size,
                updated_at,
                extension,
            });
        }
    }

    // Sort: directories first, then natural case-insensitive name comparison
    files.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    let current_path = path.to_string_lossy().to_string();
    let parent_path = path.parent().map(|p| p.to_string_lossy().to_string());

    Ok(FileListData {
        current_path,
        parent_path,
        separator: std::path::MAIN_SEPARATOR.to_string(),
        files,
    })
}

async fn handle_read(path: &Path) -> Result<FileReadData, String> {
    let meta = fs::metadata(path)
        .await
        .map_err(|_| "File not found".to_string())?;

    if meta.is_dir() {
        return Err("Target is a directory".to_string());
    }

    if meta.len() > MAX_READ_SIZE {
        return Err("File exceeds 5MB preview limit".to_string());
    }

    let bytes = fs::read(path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let is_binary = bytes.iter().take(1024).any(|&b| b == 0);
    let content = if is_binary {
        String::new()
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };

    Ok(FileReadData {
        path: path.to_string_lossy().to_string(),
        size: meta.len(),
        is_binary,
        content,
    })
}
