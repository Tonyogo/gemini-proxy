export const en = {
  nav: {
    dashboard: "Dashboard",
    logs: "Transaction Logs",
    terminal: "Terminal Logs",
    playground: "Playground",
    adminKeyPlaceholder: "Admin Secret Key",
    login: "Login",
    logout: "Logout",
    configTitle: "Configuration"
  },
  dashboard: {
    systemStatus: "System Status",
    uptime: "Uptime",
    memoryUsage: "Memory Usage",
    quickConfig: "Quick Config View",
    logLevel: "Log Level",
    systemRole: "System Role to Instruction",
    timeZone: "Time Zone",
    logRetention: "Log Retention Days",
    upstreamTimeout: "Upstream Timeout (ms)"
  },
  logs: {
    title: "Transaction Logs",
    refresh: "Refresh",
    selectDate: "Select Date",
    selectAllHours: "All Hours",
    loadingLogs: "Loading logs...",
    noLogsFound: "No logs found for selected date/hour.",
    clientReq: "Client Request",
    upstreamReq: "Upstream Request",
    streamChunks: "Upstream Stream Chunks",
    claudeResp: "Claude Response Events",
    preview: "Preview",
    rawJson: "Raw JSON",
    copy: "Copy JSON"
  },
  terminal: {
    title: "Server Terminal Output",
    live: "LIVE",
    disconnected: "DISCONNECTED",
    searchPlaceholder: "Search logs...",
    allLevels: "ALL LEVELS",
    autoScroll: "Auto-scroll",
    clear: "Clear",
    noLogsRecorded: "No terminal logs recorded."
  },
  playground: {
    title: "Raw JSON API Tester",
    preset: "Preset Payload",
    endpoint: "Endpoint",
    copyCurl: "Copy cURL",
    runTest: "Run Request",
    geminiApiKey: "Gemini API Key",
    apiKeyPlaceholder: "Optional x-goog-api-key override...",
    concurrentTest: "Concurrent Test",
    responseOutput: "Response Output",
    typewriterStream: "Typewriter SSE Stream",
    latency: "Latency"
  },
  config: {
    modalTitle: "Server Configuration Settings",
    save: "Save Changes",
    cancel: "Cancel",
    resetDefault: "Reset to .env Defaults"
  }
};

export type Translations = typeof en;
