use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default, Debug, Clone, PartialEq)]
pub struct ConfigStore {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

impl ConfigStore {
    pub fn get_config_dir() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".gt"))
    }

    pub fn get_config_file_path() -> Option<PathBuf> {
        Self::get_config_dir().map(|d| d.join("config.json"))
    }

    pub fn load() -> Self {
        let path = match Self::get_config_file_path() {
            Some(p) => p,
            None => return Self::default(),
        };

        if !path.exists() {
            return Self::default();
        }

        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> io::Result<()> {
        let dir = Self::get_config_dir()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Could not determine home directory"))?;

        if !dir.exists() {
            fs::create_dir_all(&dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
            }
        }

        let file_path = dir.join("config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let mut file = File::create(&file_path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&file_path, fs::Permissions::from_mode(0o600));
        }

        file.write_all(json.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    pub fn clear() -> io::Result<()> {
        if let Some(path) = Self::get_config_file_path() {
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        Ok(())
    }

    pub fn resolve_server(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String {
        if let Some(s) = cli {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = env_val {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = stored {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        "http://localhost:3000".to_string()
    }

    pub fn resolve_key(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String {
        if let Some(s) = cli {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = env_val {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = stored {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        String::new()
    }

    pub fn mask_key(key: &str) -> String {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        if trimmed.len() <= 10 {
            return "***".to_string();
        }
        format!("{}***{}", &trimmed[..6], &trimmed[trimmed.len() - 4..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key() {
        assert_eq!(ConfigStore::mask_key(""), "");
        assert_eq!(ConfigStore::mask_key("short"), "***");
        assert_eq!(ConfigStore::mask_key("AIzaSy1234567890"), "AIzaSy***7890");
    }

    #[test]
    fn test_resolve_server_precedence() {
        // CLI wins over everything
        assert_eq!(
            ConfigStore::resolve_server(Some("http://cli:3000"), Some("http://env:3000"), Some("http://file:3000")),
            "http://cli:3000"
        );
        // ENV wins over File
        assert_eq!(
            ConfigStore::resolve_server(None, Some("http://env:3000"), Some("http://file:3000")),
            "http://env:3000"
        );
        // File wins over Default
        assert_eq!(
            ConfigStore::resolve_server(None, None, Some("http://file:3000")),
            "http://file:3000"
        );
        // Default fallback
        assert_eq!(
            ConfigStore::resolve_server(None, None, None),
            "http://localhost:3000"
        );
    }

    #[test]
    fn test_resolve_key_precedence() {
        assert_eq!(
            ConfigStore::resolve_key(Some("cli-key"), Some("env-key"), Some("file-key")),
            "cli-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, Some("env-key"), Some("file-key")),
            "env-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, None, Some("file-key")),
            "file-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, None, None),
            ""
        );
    }
}
