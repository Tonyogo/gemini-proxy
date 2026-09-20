mod cli;
mod config;
mod protocol;
mod pty;
mod rpc;
mod task;
mod ws;

use clap::Parser;
use config::Config;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use task::TaskManager;
use tracing::info;
use tracing_subscriber::FmtSubscriber;
use ws::TerminalAgentClient;

#[tokio::main]
async fn main() {
    // Install default rustls crypto provider (ring) to support wss/https connections
    let _ = rustls::crypto::ring::default_provider().install_default();

    // Initialize tracing logger with RUST_LOG support (default INFO)
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let subscriber = FmtSubscriber::builder()
        .with_env_filter(env_filter)
        .with_target(false)
        .without_time()
        .finish();

    let _ = tracing::subscriber::set_global_default(subscriber);

    let config = Config::parse();

    let host_id = config.get_host_id();
    let host_name = config.get_host_name();
    let hostname = config.get_hostname();
    let local_ip = config.get_local_ip();
    let platform = std::env::consts::OS;

    println!("---------------------------------------------------------");
    println!(" Gemini Proxy Terminal Reverse Agent (Rust Edition)");
    println!(" Host ID   : {}", host_id);
    println!(" Host Name : {} ({})", host_name, hostname);
    println!(" IP / OS   : {} / {}", local_ip, platform);
    println!(" Target Hub: {}", config.server);
    println!("---------------------------------------------------------");

    let task_manager = TaskManager::new();
    let shutdown = Arc::new(AtomicBool::new(false));

    // Listen for SIGINT and SIGTERM for graceful exit
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

    let client = TerminalAgentClient::new(config, task_manager, shutdown);
    client.run_loop().await;

    println!("[Agent] Goodbye!");
}
