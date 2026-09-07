# 发现中心各子工具顶栏去重与纯净操作条统一设计规范

- **状态**: Approved
- **日期**: 2026-09-07
- **模块**: `frontend/src/components/PlaygroundView.tsx`, `frontend/src/components/WebTerminalView.tsx`, `frontend/src/components/TerminalLogsView.tsx`

---

## 1. 背景与设计目标

### 1.1 现状与痛点
在目前的发现中心（Discover Hub）各子模块中，存在明显的视觉风格不一致与信息冗余问题：
- **外层面包屑已具备导航功能**：`App.tsx` 顶部全局导航栏已经统一展示了完整的面包屑路径（如 `Gemini Proxy > 发现 > API 调试器` / `在线终端` / `运行日志` / `翻译工作台`）。
- **「翻译工作台」最干净**：内部没有重复放置 Logo 或大标题卡片，顶部工作台完全留给核心控制组件（语言选择、风格预设、对比模式开关、执行按钮）。
- **「API 调试器」严重冗余**：卡片内部左侧重复放了大 Logo、`API 调试器`、`v1.0` 徽标、副标题 `Claude 与 Gemini 原始报文及流式响应调试器`，占用了至少 50px 的纵向空间，导致在移动端需要换多行折叠，挤压了 Monaco Editor 和响应预览区的面积。
- **「在线终端」与「运行日志」标题重复**：macOS 风格窗口栏内部仍保留着纯静态标题文字（如 `交互式网页终端`、`运行日志`），导致视觉层级混乱、信息重复。

### 1.2 设计目标
- **完全对齐「翻译工作台」的纯净操作条标准（Clean Control Bar Paradigm）**：将外层全局面包屑作为唯一的模块标识，所有子页面内层头部 100% 转型为专注功能的操作工作台（Workbench）。
- **移除冗余占位**：彻底移除页面内重复的模块 Logo 图标、大标题文字、版本号徽章与长句说明文本。
- **优化垂直空间利用率**：释放更多可视空间给代码编辑器、终端会话与报文日志，显著提升移动端与桌面端的排版高级感与开发交互体验。

---

## 2. 详细重构方案

### 2.1 API 调试器 (`PlaygroundView.tsx`)
1. **移除元素**：
   - 渐变 Logo 图标 `<Terminal className="..." />`；
   - 标题元素 `<h2 className="text-xs font-bold ...">{t('playground.title')}</h2>`；
   - 版本徽标 `v1.0`；
   - 副标题文本 `<p className="text-[10px] text-slate-400 ...">{t('playground.subtitle')}</p>`。
2. **扁平化单层操作工具栏**：
   - **左侧核心组**：`[模型选择器 (Sparkles)]` + `[接口端点选择器 (Globe)]`（包含自定义路径输入框）；
   - **中间辅助组**：`[Stream 切换胶囊]` + `[预设模板 (Presets 下拉)]` + `[复制 cURL (Code)]` + `[并发压测 (Flame)]`；
   - **右侧执行组**：`[系统密钥指示标签 (Key)]` + `[运行测试 发送按钮 (Send)]`。
3. **移动端自适应**：
   - 移除大标题后，移动端由原来的 3~4 行冗长折叠简化为 2 行高度紧凑的功能胶囊阵列，编辑器可视区域增加约 45px。

### 2.2 在线终端 (`WebTerminalView.tsx`)
1. **移除元素**：
   - 窗口顶栏中的纯静态文字 `{t('webTerminal.title')}`。
2. **重构排版**：
   - **左侧**：`[macOS 红黄绿操作圆点]` + `[TerminalHostSelector (主机节点选择器胶囊)]`；
   - **右侧**：`[字号缩放 (Zoom)]` + `[手动重连 (RefreshCw)]` + `[重置会话 (Trash2)]` + `[独立全屏切换 (Maximize2/Minimize2)]`。
   - 彻底避免节点选择器与标题文字相互挤压。

### 2.3 运行日志 (`TerminalLogsView.tsx`)
1. **移除元素**：
   - 静态文本 `{t('terminal.title')}`。
2. **重构排版**：
   - **左侧**：`[macOS 三色圆点]` + `[交互终端 / 运行日志 切换 Tab 胶囊]`；
   - **右侧**：`[日志分级过滤标签 (All/Info/Warn/Error)]` + `[日志清空 (Trash2)]` + `[全屏切换 (Maximize2/Minimize2)]`。

---

## 3. 规范一致性矩阵

| 视图模块 | 全局面包屑（`App.tsx`） | 内部头部形态 | 布局特征 |
| :--- | :--- | :--- | :--- |
| **翻译工作台** | `Gemini Proxy > 发现 > 翻译工作台` | 纯操作条（基准） | 语言选择 + 风格预设 + 对比模式 + 执行按钮 |
| **API 调试器** | `Gemini Proxy > 发现 > API 调试器` | 纯操作条（对齐） | 模型选择 + 接口选择 + Stream + 预设 + 执行按钮 |
| **在线终端** | `Gemini Proxy > 发现 > 在线终端` | 纯交互栏（对齐） | macOS 圆点 + 节点选择器 + 状态灯 + 操作按键 |
| **运行日志** | `Gemini Proxy > 发现 > 运行日志` | 纯过滤栏（对齐） | macOS 圆点 + 视图 Tab + 分级过滤 + 清空/全屏 |

---

## 4. 验证与测试标准

1. **结构完整性测试 (`tests/cleanHeadersUnification.test.ts`)**：
   - 验证 `PlaygroundView.tsx` 中不再渲染冗余标题及 Logo，但所有操作选择器与运行按钮完整存在；
   - 验证 `WebTerminalView.tsx` 与 `TerminalLogsView.tsx` 窗口栏中已移除重复静态标题；
2. **前后端全量回归构建**：
   - 运行 `npm run build`，确保 TypeScript 编译与 Vite 生产打包零报错。
