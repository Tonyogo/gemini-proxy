use clap::Parser;
use std::net::IpAddr;
use url::Url;

#[derive(Parser, Debug, Clone)]
#[command(name = "gemini-terminal-agent")]
#[command(author = "Gemini Proxy Team")]
#[command(version = "0.1.0")]
#[command(about = "High-performance Linux reverse terminal agent for Gemini Proxy", long_about = None)]
pub struct Config {
    /// Remote Gemini Proxy server target URL
    #[arg(long, env = "TERMINAL_SERVER", default_value = "http://localhost:3000")]
    pub server: String,

    /// Admin secret key for authentication
    #[arg(long, env = "ADMIN_SECRET_KEY", default_value = "")]
    pub key: String,

    /// Explicit unique Host ID (defaults to <hostname>-<local_ip>)
    #[arg(long, env = "HOST_ID")]
    pub id: Option<String>,

    /// Friendly host name (defaults to hostname)
    #[arg(long, env = "HOST_NAME")]
    pub name: Option<String>,

    /// Shell executable to spawn (defaults to /bin/bash or $SHELL)
    #[arg(long, env = "SHELL")]
    pub shell: Option<String>,
}

impl Config {
    pub fn get_hostname(&self) -> String {
        nix::unistd::gethostname()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "localhost".to_string())
    }

    pub fn get_local_ip(&self) -> String {
        // Find first non-loopback IPv4 address
        if let Ok(interfaces) = nix::ifaddrs::getifaddrs() {
            for ifa in interfaces {
                if let Some(address) = ifa.address {
                    if let Some(sockaddr_in) = address.as_sockaddr_in() {
                        let ip = IpAddr::V4(sockaddr_in.ip());
                        if !ip.is_loopback() {
                            return ip.to_string();
                        }
                    }
                }
            }
        }
        "127.0.0.1".to_string()
    }

    pub fn get_host_id(&self) -> String {
        if let Some(ref id) = self.id {
            return id.clone();
        }
        let mut bytes = [0u8; 6];
        let _ = getrandom::getrandom(&mut bytes);
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }

    pub fn get_host_name(&self) -> String {
        if let Some(ref name) = self.name {
            let sanitized: String = name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
                .collect();
            let trimmed = sanitized.trim_matches('-');
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        let hostname = self.get_hostname();
        let sanitized_hostname: String = hostname
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let trimmed_host = sanitized_hostname.trim_matches('-');
        let safe_host = if trimmed_host.is_empty() { "host" } else { trimmed_host };

        let mut bytes = [0u8; 2];
        let _ = getrandom::getrandom(&mut bytes);
        let hex4: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
        format!("{}-{}", safe_host, hex4)
    }

    pub fn get_shell(&self) -> String {
        if let Some(ref s) = self.shell {
            return s.clone();
        }
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }

    pub fn resolve_ws_url(&self) -> Result<String, String> {
        let server = self.server.trim();
        let mut ws_url = if server.starts_with("https://") {
            server.replacen("https://", "wss://", 1)
        } else if server.starts_with("http://") {
            server.replacen("http://", "ws://", 1)
        } else if server.starts_with("wss://") || server.starts_with("ws://") {
            server.to_string()
        } else {
            format!("ws://{}", server)
        };

        // Trim trailing slashes
        while ws_url.ends_with('/') {
            ws_url.pop();
        }

        let base_ws = format!("{}/api/terminal/agent-ws", ws_url);
        let mut parsed_url = Url::parse(&base_ws).map_err(|e| format!("Invalid URL: {}", e))?;

        let host_id = self.get_host_id();
        let host_name = self.get_host_name();
        let hostname = self.get_hostname();
        let local_ip = self.get_local_ip();
        let platform = std::env::consts::OS;

        parsed_url.query_pairs_mut()
            .append_pair("hostId", &host_id)
            .append_pair("name", &host_name)
            .append_pair("hostname", &hostname)
            .append_pair("ip", &local_ip)
            .append_pair("platform", platform)
            .append_pair("key", &self.key);

        Ok(parsed_url.to_string())
    }
}
