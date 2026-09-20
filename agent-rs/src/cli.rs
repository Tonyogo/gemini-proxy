use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug, Clone)]
#[command(name = "gt")]
#[command(author = "Gemini Proxy Team")]
#[command(version = "1.0.0")]
#[command(about = "gt (Gemini Terminal) - Unified Docker-Style Terminal CLI and Reverse Agent", long_about = None)]
pub struct Cli {
    /// Remote Gemini Proxy server target URL (optional override)
    #[arg(short, long, global = true, env = "TERMINAL_SERVER")]
    pub server: Option<String>,

    /// Admin secret key for authentication (optional override)
    #[arg(short, long, global = true, env = "ADMIN_SECRET_KEY")]
    pub key: Option<String>,

    /// Output responses in structured JSON format
    #[arg(long, global = true)]
    pub json: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Authenticate and save Proxy server URL and admin secret key
    Login {
        /// Proxy server URL (e.g. http://localhost:3000)
        #[arg(index = 1)]
        server: Option<String>,

        /// Admin secret key
        #[arg(index = 2)]
        key: Option<String>,
    },

    /// Clear saved Proxy server URL and credentials
    Logout,

    /// View or manage persistent configurations (~/.gt/config.json)
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },

    /// List connected terminal agent hosts (like 'docker node ls')
    Hosts,

    /// Execute a command on a remote host (like 'docker exec')
    Exec(ExecArgs),

    /// List active and recent tasks on a host (like 'docker ps')
    Ps {
        /// Target host ID
        host: String,
    },

    /// View execution logs for a task (like 'docker logs')
    Logs {
        /// Target host ID
        host: String,
        /// Task ID
        task_id: String,
    },

    /// Terminate a running task on a host (like 'docker kill')
    Kill {
        /// Target host ID
        host: String,
        /// Task ID
        task_id: String,
    },

    /// Run reverse terminal agent daemon on this machine
    Agent(AgentArgs),
}

#[derive(Subcommand, Debug, Clone)]
pub enum ConfigAction {
    /// Display all configured values
    List,
    /// Get a configuration value (server, key)
    Get { key: String },
    /// Set a configuration value (server, key)
    Set { key: String, value: String },
}

#[derive(Args, Debug, Clone)]
pub struct ExecArgs {
    /// Target host ID
    pub host: String,

    /// Remote working directory (alias: --cwd)
    #[arg(short = 'w', long = "workdir", alias = "cwd")]
    pub workdir: Option<String>,

    /// Run command in background and print task ID (like 'docker exec -d')
    #[arg(short = 'd', long = "detach")]
    pub detach: bool,

    /// Execution timeout in ms (default: 300000 / 5 min)
    #[arg(short = 't', long = "timeout", default_value_t = 300000)]
    pub timeout: u64,

    /// Suppress execution header and footer banners
    #[arg(short = 'q', long = "quiet")]
    pub quiet: bool,

    /// Remote environment variables (KEY=VAL)
    #[arg(short = 'e', long = "env")]
    pub env: Vec<String>,

    /// Polling interval for live log stream in ms
    #[arg(long = "poll-interval", default_value_t = 500)]
    pub poll_interval: u64,

    /// Command and arguments to execute
    #[arg(trailing_var_arg = true, required = true, allow_hyphen_values = true)]
    pub command: Vec<String>,
}

#[derive(Args, Debug, Clone)]
pub struct AgentArgs {
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
