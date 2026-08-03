import { Translations } from './en';

export const zh: Translations = {
  nav: {
    dashboard: "控制台概览",
    logs: "交易日志",
    terminal: "终端日志",
    playground: "API 调试器",
    adminKeyPlaceholder: "管理员密钥",
    login: "登录",
    logout: "退出登录",
    configTitle: "系统配置"
  },
  dashboard: {
    systemStatus: "系统运行状态",
    uptime: "运行时间",
    memoryUsage: "内存使用率",
    quickConfig: "核心配置速览",
    logLevel: "日志级别",
    systemRole: "System 角色转指令",
    timeZone: "系统时区",
    logRetention: "日志保留天数",
    upstreamTimeout: "上游超时时间 (毫秒)"
  },
  logs: {
    title: "交易日志列表",
    refresh: "刷新",
    selectDate: "选择日期",
    selectAllHours: "全部小时",
    loadingLogs: "正在加载日志...",
    noLogsFound: "未找到选中时间段的日志。",
    clientReq: "客户端请求",
    upstreamReq: "Gemini 上游请求",
    streamChunks: "上游 SSE 响应块",
    claudeResp: "Claude 格式响应事件",
    preview: "结构化预览",
    rawJson: "原始 JSON",
    copy: "复制 JSON"
  },
  terminal: {
    title: "服务端终端控制台输出",
    live: "实时推送中",
    disconnected: "已断开连接",
    searchPlaceholder: "搜索日志内容...",
    allLevels: "全部级别",
    autoScroll: "自动滚动",
    clear: "清屏",
    noLogsRecorded: "暂无终端日志记录。"
  },
  playground: {
    title: "原始 JSON API 调试器",
    preset: "预设 Payload",
    endpoint: "接口端点",
    copyCurl: "复制 cURL",
    runTest: "发送请求",
    geminiApiKey: "Gemini API Key",
    apiKeyPlaceholder: "可选覆盖 x-goog-api-key...",
    concurrentTest: "并发测试",
    responseOutput: "响应输出",
    typewriterStream: "流式打字机预览",
    latency: "响应延迟"
  },
  config: {
    modalTitle: "服务端运行时配置修改",
    save: "保存配置修改",
    cancel: "取消",
    resetDefault: "重置为环境变量默认值"
  }
};
