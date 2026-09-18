use std::time::Duration;

pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_millis(4000);
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(3);
