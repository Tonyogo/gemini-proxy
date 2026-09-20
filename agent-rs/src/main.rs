mod cli;
mod client;
mod config;
mod config_store;
mod protocol;
mod pty;
mod rpc;
mod task;
mod ws;

use clap::Parser;
use cli::{Cli, Commands};
use config::Config;
use config_store::ConfigStore;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use task::TaskManager;
use tracing::info;
use tracing_subscriber::FmtSubscriber;
use ws::TerminalAgentClient;

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cli = Cli::parse();
    let stored_config = ConfigStore::load();

    let resolved_server = ConfigStore::resolve_server(
        cli.server.as_deref(),
        std::env::var("TERMINAL_SERVER").ok().as_deref(),
        stored_config.server.as_deref(),
    );

    let resolved_key = ConfigStore::resolve_key(
        cli.key.as_deref(),
        std::env::var("ADMIN_SECRET_KEY").ok().as_deref(),
        stored_config.key.as_deref(),
    );

    match cli.command {
        Commands::Login { server, key } => {
            let code = client::run_login(server, key).await;
            std::process::exit(code);
        }
        Commands::Logout => {
            let code = client::run_logout();
            std::process::exit(code);
        }
        Commands::Config { action } => {
            let code = client::run_config(action, cli.json);
            std::process::exit(code);
        }
        Commands::Hosts => {
            let code = client::run_hosts(&resolved_server, &resolved_key, cli.json).await;
            std::process::exit(code);
        }
        Commands::Exec(args) => {
            let code = client::run_exec(&resolved_server, &resolved_key, args, cli.json).await;
            std::process::exit(code);
        }
        Commands::Ps { host } => {
            let code = client::run_ps(&resolved_server, &resolved_key, &host, cli.json).await;
            std::process::exit(code);
        }
        Commands::Logs { host, task_id } => {
            let code = client::run_logs(&resolved_server, &resolved_key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Kill { host, task_id } => {
            let code = client::run_kill(&resolved_server, &resolved_key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Agent(agent_args) => {
            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

            let subscriber = FmtSubscriber::builder()
                .with_env_filter(env_filter)
                .with_target(false)
                .without_time()
                .finish();

            let _ = tracing::subscriber::set_global_default(subscriber);

            let agent_config = Config {
                server: resolved_server,
                key: resolved_key,
                id: agent_args.id,
                name: agent_args.name,
                shell: agent_args.shell,
            };

            let host_id = agent_config.get_host_id();
            let host_name = agent_config.get_host_name();
            let hostname = agent_config.get_hostname();
            let local_ip = agent_config.get_local_ip();
            let platform = std::env::consts::OS;

            println!("---------------------------------------------------------");
            println!(" Gemini Proxy Terminal Reverse Agent (gt agent)");
            println!(" Host ID   : {}", host_id);
            println!(" Host Name : {} ({})", host_name, hostname);
            println!(" IP / OS   : {} / {}", local_ip, platform);
            println!(" Target Hub: {}", agent_config.server);
            println!("---------------------------------------------------------");

            let task_manager = TaskManager::new();
            let shutdown = Arc::new(AtomicBool::new(false));

            let shutdown_signal = shutdown.clone();
            tokio::spawn(async move {
                let mut sigint = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt()).unwrap();
                let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();

                tokio::select! {
                    _ = sigint.recv() => {
                        info!("[Agent] Received SIGINT. Shutting down...");
                    }
                    _ = sigterm.recv() => {
                        info!("[Agent] Received SIGTERM. Shutting down...");
                    }
                }
                shutdown_signal.store(true, Ordering::SeqCst);
            });

            let client = TerminalAgentClient::new(agent_config, task_manager, shutdown);
            client.run_loop().await;

            println!("[Agent] Goodbye!");
        }
    }
}
