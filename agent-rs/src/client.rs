use crate::cli::ExecArgs;
use chrono::{DateTime, Local};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{self, Write};
use std::time::{Duration, Instant};

#[derive(Deserialize, Serialize, Debug)]
pub struct ManagedHost {
    pub id: Option<String>,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub status: Option<String>,
    pub platform: Option<String>,
    pub ip: Option<String>,
    #[serde(rename = "lastSeen")]
    pub last_seen: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct HostsResponse {
    pub hosts: Option<Vec<ManagedHost>>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ExecStartResponse {
    pub success: bool,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ExecStatusResponse {
    pub success: bool,
    pub status: Option<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub output: Option<String>,
    #[serde(rename = "outputOffset")]
    pub output_offset: Option<usize>,
    pub offset: Option<usize>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct TaskSummary {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "startTime")]
    pub start_time: i64,
    pub command: String,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct PsResponse {
    pub success: bool,
    pub tasks: Option<Vec<TaskSummary>>,
    pub error: Option<String>,
}

fn normalize_server_url(server: &str) -> String {
    let s = server.trim().trim_end_matches('/');
    if s.starts_with("http://") || s.starts_with("https://") {
        s.to_string()
    } else {
        format!("http://{}", s)
    }
}

fn build_client(key: &str) -> (reqwest::Client, HeaderMap) {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if !key.is_empty() {
        if let Ok(val) = HeaderValue::from_str(key) {
            headers.insert("x-admin-key", val);
        }
    }
    let client = reqwest::Client::builder()
        .default_headers(headers.clone())
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    (client, headers)
}

fn format_relative_time(timestamp: Option<i64>) -> String {
    let ts = match timestamp {
        Some(t) => t,
        None => return "Never".to_string(),
    };
    let now = chrono::Utc::now().timestamp_millis();
    let diff = now - ts;
    if diff < 10000 {
        "Just now".to_string()
    } else if diff < 60000 {
        format!("{}s ago", diff / 1000)
    } else if diff < 3600000 {
        format!("{}m ago", diff / 60000)
    } else if diff < 86400000 {
        format!("{}h ago", diff / 3600000)
    } else {
        format!("{}d ago", diff / 86400000)
    }
}

pub async fn run_hosts(server: &str, key: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let base_url = normalize_server_url(server);
    let url = format!("{}/api/terminal/hosts", base_url);

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to query hosts: {}", e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: HostsResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if let Some(err) = resp.error {
        eprintln!("Error: {}", err);
        return 1;
    }

    let hosts = resp.hosts.unwrap_or_default();
    if hosts.is_empty() {
        println!("No connected terminal agent hosts found.");
        return 0;
    }

    println!(
        "{:<20}{:<20}{:<12}{:<12}{:<18}{}",
        "HOST ID", "NAME", "STATUS", "PLATFORM", "IP", "LAST SEEN"
    );
    println!("{}", "-".repeat(90));

    for h in hosts {
        let host_id = h.id.unwrap_or_default();
        let name = h.name.or(h.hostname).unwrap_or_default();
        let status = h.status.unwrap_or_else(|| "offline".to_string());
        let platform = h.platform.unwrap_or_default();
        let ip = h.ip.unwrap_or_default();
        let seen = format_relative_time(h.last_seen);

        println!(
            "{:<20}{:<20}{:<12}{:<12}{:<18}{}",
            host_id, name, status, platform, ip, seen
        );
    }
    0
}

pub async fn run_ps(server: &str, key: &str, host: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let base_url = normalize_server_url(server);
    let url = format!("{}/api/terminal/exec/{}", base_url, host);

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to list tasks on [{}]: {}", host, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: PsResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if !resp.success {
        eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
        return 1;
    }

    let tasks = resp.tasks.unwrap_or_default();
    if tasks.is_empty() {
        println!("No recent tasks recorded on [{}].", host);
        return 0;
    }

    println!(
        "{:<26}{:<12}{:<8}{:<14}{}",
        "TASK ID", "STATUS", "EXIT", "START TIME", "COMMAND"
    );
    println!("{}", "-".repeat(80));

    for t in tasks {
        let exit_str = t.exit_code.map(|c| c.to_string()).unwrap_or_else(|| "-".into());
        let d = DateTime::from_timestamp_millis(t.start_time).unwrap_or_default();
        let local_d: DateTime<Local> = DateTime::from(d);
        let time_str = local_d.format("%H:%M:%S").to_string();

        println!(
            "{:<26}{:<12}{:<8}{:<14}{}",
            t.task_id, t.status, exit_str, time_str, t.command
        );
    }
    0
}

pub async fn run_logs(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let base_url = normalize_server_url(server);
    let url = format!(
        "{}/api/terminal/exec/{}/{}",
        base_url,
        host,
        task_id
    );

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to get logs for [{}]: {}", task_id, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: ExecStatusResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if !resp.success {
        eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
        return 1;
    }

    println!("Task:     {}", task_id);
    println!("Host:     {}", host);
    println!("Status:   {}", resp.status.unwrap_or_default());
    println!(
        "ExitCode: {}",
        resp.exit_code.map(|c| c.to_string()).unwrap_or_else(|| "N/A".into())
    );

    let output_text = resp.output.as_ref().or(resp.stdout.as_ref());
    if let Some(out) = output_text {
        if !out.is_empty() {
            println!("\n--- Output ---");
            print!("{}", out);
            if !out.ends_with('\n') {
                println!();
            }
        }
    }
    0
}

pub async fn run_kill(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let base_url = normalize_server_url(server);
    let url = format!(
        "{}/api/terminal/exec/{}/{}/kill",
        base_url,
        host,
        task_id
    );

    let mut body = HashMap::new();
    body.insert("signal", "SIGTERM");

    let res = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to kill task [{}]: {}", task_id, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: Value = res.json().await.unwrap_or_else(|_| Value::Null);
    if resp.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        println!("Kill signal sent to task [{}] on host [{}].", task_id, host);
        0
    } else {
        eprintln!(
            "Error: {}",
            resp.get("error").and_then(|v| v.as_str()).unwrap_or("Failed to kill task")
        );
        1
    }
}

pub async fn run_exec(server: &str, key: &str, args: ExecArgs, json: bool) -> i32 {
    let host = args.host.trim();
    let full_command = args.command.join(" ");
    if full_command.trim().is_empty() {
        eprintln!("Error: Missing command to execute.");
        return 1;
    }

    let (client, _) = build_client(key);
    let base_url = normalize_server_url(server);
    let start_url = format!("{}/api/terminal/exec/{}", base_url, host);

    let mut env_map = HashMap::new();
    for e in args.env {
        if let Some((k, v)) = e.split_once('=') {
            env_map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }

    #[derive(Serialize)]
    struct StartBody<'a> {
        command: &'a str,
        cwd: Option<&'a str>,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
        env: HashMap<String, String>,
    }

    let body = StartBody {
        command: &full_command,
        cwd: args.workdir.as_deref(),
        timeout_ms: args.timeout,
        env: env_map,
    };

    let start_instant = Instant::now();

    if !args.quiet {
        eprintln!(">>> [{}] $ {}", host, full_command);
    }

    let start_res = match client.post(&start_url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to connect to proxy: {}", e);
            return 1;
        }
    };

    let start_data: ExecStartResponse = match start_res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse start response: {}", e);
            return 1;
        }
    };

    if !start_data.success {
        eprintln!(
            "Error starting task on [{}]: {}",
            host,
            start_data.error.unwrap_or_else(|| "Unknown error".into())
        );
        return 1;
    }

    let task_id = match start_data.task_id {
        Some(id) => id,
        None => {
            eprintln!("Server did not return a taskId.");
            return 1;
        }
    };

    if args.detach {
        if json {
            let mut res_obj = HashMap::new();
            res_obj.insert("success", Value::Bool(true));
            res_obj.insert("taskId", Value::String(task_id));
            println!("{}", serde_json::to_string_pretty(&res_obj).unwrap());
        } else {
            println!("{}", task_id);
        }
        return 0;
    }

    // Ctrl+C cancellation handler
    let cancel_client = client.clone();
    let cancel_url = format!(
        "{}/api/terminal/exec/{}/{}/kill",
        base_url,
        host,
        task_id
    );
    let cancel_host = host.to_string();
    let cancel_task = task_id.clone();

    tokio::spawn(async move {
        if let Ok(()) = tokio::signal::ctrl_c().await {
            eprintln!("\n[Interrupted] Terminating remote task [{}]...", cancel_task);
            let mut b = HashMap::new();
            b.insert("signal", "SIGTERM");
            let _ = cancel_client.post(&cancel_url).json(&b).send().await;
            eprintln!("\n<<< [{}] Terminated by user.", cancel_host);
            std::process::exit(130);
        }
    });

    // Output polling loop
    let mut offset = 0usize;
    let mut consecutive_errors = 0;
    let poll_interval = Duration::from_millis(args.poll_interval);

    loop {
        let poll_url = format!(
            "{}/api/terminal/exec/{}/{}?offset={}",
            base_url,
            host,
            task_id,
            offset
        );

        match client.get(&poll_url).send().await {
            Ok(res) => {
                if let Ok(status_data) = res.json::<ExecStatusResponse>().await {
                    if status_data.success {
                        consecutive_errors = 0;

                        if let Some(ref stdout) = status_data.stdout {
                            if !stdout.is_empty() {
                                print!("{}", stdout);
                                let _ = io::stdout().flush();
                            }
                        }

                        if let Some(ref stderr) = status_data.stderr {
                            if !stderr.is_empty() {
                                eprintln!("{}", stderr);
                                let _ = io::stderr().flush();
                            }
                        }

                        let new_offset = status_data.output_offset.or(status_data.offset).unwrap_or(
                            offset
                                + status_data.stdout.as_ref().map(|s| s.len()).unwrap_or(0)
                                + status_data.stderr.as_ref().map(|s| s.len()).unwrap_or(0),
                        );
                        offset = new_offset;

                        let status = status_data.status.unwrap_or_else(|| "running".into());
                        if status != "running" {
                            let duration = start_instant.elapsed().as_secs_f64();
                            let exit_code = status_data
                                .exit_code
                                .unwrap_or(if status == "completed" { 0 } else { 1 });

                            if !args.quiet {
                                if exit_code == 0 {
                                    eprintln!(
                                        "<<< [{}] Command completed with code 0 (took {:.2}s)",
                                        host, duration
                                    );
                                } else {
                                    eprintln!(
                                        "<<< [{}] Command failed with code {} ({}, took {:.2}s)",
                                        host, exit_code, status, duration
                                    );
                                }
                            }
                            return exit_code;
                        }
                    } else {
                        consecutive_errors += 1;
                    }
                } else {
                    consecutive_errors += 1;
                }
            }
            Err(_) => {
                consecutive_errors += 1;
            }
        }

        if consecutive_errors >= 5 {
            eprintln!(
                "\n<<< [{}] Connection lost while streaming task [{}]. Aborting.",
                host, task_id
            );
            return 1;
        }

        tokio::time::sleep(poll_interval).await;
    }
}
