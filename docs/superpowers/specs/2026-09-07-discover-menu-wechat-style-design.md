# 发现菜单收纳与仿微信发现页设计文档 (Discover Menu & WeChat Style Discover Hub Design)

**日期**: 2026-09-07  
**分支**: `main`  
**目标**: 将系统导航中的【终端】、【API 调试器】和【翻译工作台】统一收纳至全新的顶级导航【发现 (Discover)】中；在移动端将【发现】设计为类似微信原生“发现”页的高质感分组条目列表，点击条目进入子工具后顶栏提供便捷的“返回发现”按钮；在桌面端提供现代化的工具聚合大屏展厅（Discover Hub），点击卡片全屏进入工作台。

---

## 1. 背景与用户痛点

1. **移动端底部导航过于拥挤**：
   原系统底部导航平铺了 6 个菜单（概览、账号、日志、终端、调试、翻译），在 iPhone 等手机屏幕上每个按钮极窄（甚至不足 55px），容易误触且文字被迫截断，缺乏视觉呼吸感。
2. **工具类页面分散缺乏聚合感**：
   终端、API 调试器与翻译工作台均为辅助开发者和管理员的高级工具/工作台，平铺在主菜单分散了日常监控与账号运维的核心注意力。
3. **微信心智契合度高**：
   国内移动端用户高度习惯“发现”作为扩展功能入口的层级交互：在发现列表中一目了然看全扩展工具，点入使用，用完返回，层次分明，体验极佳。

---

## 2. 详细交互与视觉设计规范

### 2.1 顶级导航收敛 (Navigation Restructuring)

1. **主导航项收敛为 4 个**：
   - `dashboard`: 控制台概览 (`⌘1`, `LayoutDashboard`)
   - `accounts`: 账号管理 (`⌘2`, `Users`)
   - `logs`: 请求日志 (`⌘3`, `FileText`)
   - `discover`: 发现 (`⌘4`, `Compass`)
2. **移除原本的顶级 Tab 按钮**：
   - 移除桌面侧边栏与移动端底部导航中直接的 `terminal`, `playground`, `translate` 独立导航项。
   - 保留原键盘快捷键（或者将 `⌘4` 赋予“发现”，工具内支持快捷键直达）。
3. **子路由/子视图状态 (`discoverSubView`)**：
   - 状态定义：`type DiscoverSubView = 'hub' | 'terminal' | 'playground' | 'translate'`
   - 默认激活值：`'hub'`
   - 切换机制：
     - 用户在发现页点击工具卡片/列表项时，`setDiscoverSubView('terminal' | 'playground' | 'translate')`。
     - 若切换到其他主 Tab（如概览、日志），再次点击“发现”时，可恢复上次未完成的工作台或返回 hub。

### 2.2 移动端仿微信“发现”页设计 (WeChat-style Mobile Discover)

针对移动端 `< md` 视口：

1. **分组与条目结构**：
   - **第一分组（系统级）**：
     - **在线终端 (Web Terminal)**
       - 图标：深翠绿/青碧渐变背景色块（`bg-gradient-to-br from-emerald-500 to-teal-600`，内嵌白色 `Terminal` 图标）
       - 标题：`t('discover.terminalTitle', '在线终端')`
       - 副标：`t('discover.terminalDesc', '宿主环境诊断与实时指令交互终端')`
       - 右侧：`ChevronRight` 灰色小箭头
   - **第二分组（开发与实验工作台）**：
     - **API 调试器 (Playground)**
       - 图标：活力橙/琥珀金渐变色块（`bg-gradient-to-br from-orange-500 to-amber-600`，内嵌白色 `Play` / `Zap` 图标）
       - 标题：`t('discover.playgroundTitle', 'API 调试器')`
       - 副标：`t('discover.playgroundDesc', 'Claude 与 Gemini 原始报文及流式响应调试器')`
       - 分割线：细线 `border-b border-black/[0.04] dark:border-white/[0.04] ml-14`
     - **翻译工作台 (Translate)**
       - 图标：优雅靛蓝/紫罗兰渐变色块（`bg-gradient-to-br from-indigo-500 to-purple-600`，内嵌白色 `Languages` 图标）
       - 标题：`t('discover.translateTitle', '翻译工作台')`
       - 副标：`t('discover.translateDesc', 'AI 辅助智能翻译与多语言对比工作台')`
2. **样式细节**：
   - 外层列表使用 `space-y-3 px-3 py-4`。
   - 每个分组卡片：`bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm`。
   - 列表项点击态：`active:bg-black/[0.04] dark:active:bg-white/[0.04] transition-colors cursor-pointer`。
   - 图标盒子：`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm`。
3. **移动端子页面返回导航**：
   - 当 `activeTab === 'discover'` 且 `discoverSubView !== 'hub'` 时：
     - 移动端顶栏左侧原本的 Gemini 品牌 Logo 变为：
       ```tsx
       <button
         onClick={() => setDiscoverSubView('hub')}
         className="flex items-center space-x-1 py-1 px-1.5 -ml-1 rounded-lg text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-500/10 active:scale-95 transition-all"
       >
         <ChevronLeft className="w-4 h-4" />
         <span>{t('discover.back', '发现')}</span>
       </button>
       ```
     - 顶部标题显示为具体子工具名称（如“在线终端”）。
     - 用户点击左上角即可丝滑返回微信风格发现列表。

### 2.3 桌面端发现中心大屏展厅 (Desktop Discover Hub)

针对桌面端 `≥ md` 视口：

1. **标题区**：
   - 主标：`t('discover.title', '发现中心')` 与 `Compass` 动态渐变图标。
   - 副标：`t('discover.subtitle', '探索系统运行、接口调试与语言模型协同工具')`。
2. **大屏卡片展厅**：
   - 采用 3 列自适应响应式网格：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl`。
   - 采用 APM 级精致玻璃卡片 (`ui-card p-6 flex flex-col justify-between hover:border-indigo-500/40 hover:shadow-lg transition-all group`)。
   - 每张卡片包含：
     - 大尺寸品牌渐变图标容器 (`w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4`)；
     - 工具标题与标签徽章（如 `PRO` / `STREAM` / `BILINGUAL`）；
     - 详细功能说明文案；
     - 底部【立即启动 / Launch】操作按钮与快捷入口箭头。
3. **工作台全屏展开**：
   - 点击卡片后，主工作区平滑切换到该工作台；
   - 顶部面包屑显示：`Gemini Proxy > 发现 > [具体工具名]`，点击“发现”面包屑随时返回大屏展厅。

---

## 3. 架构与状态数据流

```
                        ┌─────────────────────────────────┐
                        │      App.tsx (Main Shell)       │
                        │  activeTab: 'dashboard' | ...   │
                        │  discoverSubView: 'hub' | ...   │
                        └────────────────┬────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
       [activeTab !== 'discover']                     [activeTab === 'discover']
                 │                                               │
        Dashboard / Accounts / Logs                              │
                                         ┌───────────────────────┴───────────────────────┐
                                         │                                               │
                             [discoverSubView === 'hub']                   [discoverSubView !== 'hub']
                                         │                                               │
                       ┌─────────────────┴─────────────────┐           ┌─────────────────┼─────────────────┐
                       │                                   │           │                 │                 │
              [Desktop: ≥ md]                       [Mobile: < md]  Terminal         Playground        Translate
             DiscoverHubView.tsx                  DiscoverHubView.tsx   (WebTerminal)   (Monaco Editor)  (Prompt View)
          (3-Column Grid Cards)               (WeChat Style Cell List)         │                 │                 │
                                                                               └─────────────────┼─────────────────┘
                                                                                                 │
                                                                                         [Top Bar Back Button]
                                                                                       (setDiscoverSubView('hub'))
```

---

## 4. 国际化 (i18n) 词条设计

### `frontend/src/i18n/locales/zh.ts`
```typescript
nav: {
  // ...
  discover: "发现",
},
discover: {
  title: "发现中心",
  subtitle: "探索系统运行、接口调试与语言模型协同工具",
  terminalTitle: "在线终端",
  terminalDesc: "宿主环境诊断与实时指令交互终端",
  playgroundTitle: "API 调试器",
  playgroundDesc: "Claude 与 Gemini 原始报文及流式响应调试器",
  translateTitle: "翻译工作台",
  translateDesc: "AI 辅助智能翻译与多语言对比工作台",
  back: "发现",
  launch: "立即启动",
  openWorkbench: "打开工作台",
  systemCategory: "系统工具",
  devCategory: "开发与测试",
}
```

### `frontend/src/i18n/locales/en.ts`
```typescript
nav: {
  // ...
  discover: "Discover",
},
discover: {
  title: "Discover Hub",
  subtitle: "Explore system diagnostics, API debugging, and translation workbenches",
  terminalTitle: "Web Terminal",
  terminalDesc: "Host environment diagnostics & interactive shell terminal",
  playgroundTitle: "API Playground",
  playgroundDesc: "Raw Claude & Gemini JSON payload & SSE stream debugger",
  translateTitle: "Translate Workbench",
  translateDesc: "AI-assisted translation & multi-model prompt workbench",
  back: "Discover",
  launch: "Launch",
  openWorkbench: "Open Workbench",
  systemCategory: "System Diagnostics",
  devCategory: "Developer Tools",
}
```

---

## 5. 测试与验证策略

1. **测试驱动断言 (`tests/discoverNavigation.test.ts`)**：
   - 验证导航项数量收拢为 4 个（`dashboard`, `accounts`, `logs`, `discover`）；
   - 验证 `App.tsx` 包含 `discoverSubView` 状态管理并在点击“发现”及其子工具时正确流转；
   - 验证在移动端视图和桌面端视图中均正确提供子工具入口；
   - 验证移动端子页面具备返回“发现”列表的触发逻辑。
2. **编译与全量测试验证**：
   - `npm run build:frontend` (Vite 严格检查无语法及类型错误)
   - `npm run build:backend` (TypeScript 编译无错误)
   - `npm test` (全量测试套件通过率 100%)
