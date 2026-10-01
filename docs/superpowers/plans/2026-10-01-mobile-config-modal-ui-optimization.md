# 移动端配置页面 (ConfigModal) 响应式显示整体优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决移动端（手机窄屏 <640px / 360px~430px）下系统配置弹窗（`ConfigModal.tsx`）中节点卡片头部挤压溢出、模式切换器叠位、出口通道排版过高和字段输入网格对齐错乱的问题。

**Architecture:** 
- 卡片头部响应式流式重构：在移动端将单行臃肿的工具条拆分为“状态与操作首行”+“通栏分段控制器次行”，触控面积更大且彻底消除重叠。
- 基础字段紧凑网格排版：在小屏下将“备注名 (8列)”与“权重 (4列)”合并为单行，缩减 40% 的无效纵向滚动高度。
- 出口通道卡片紧凑化：精简移动端 Radio Card 的内边距与字体层级，下拉框与刷新按钮添加 `min-w-0` 与弹性分配，避免撑破视口横向滚动。

**Tech Stack:** React 18, TailwindCSS, Lucide Icons, TypeScript, Vite.

**Spec:** `docs/superpowers/specs/2026-10-01-direct-mode-agent-egress-design.md`

## Global Constraints

- 仅重构前端展现层与响应式样式，不改变任何现有数据逻辑、API 调用格式或配置提交 Payload。
- 保持 PC 端（`sm:` 阈值以上）原有交互与紧凑排版完全一致，不做负向改动。
- 保证双语国际化文案在移动端的自适应截断与换行无死角，支持中文与英文。
- 必须通过 `npm run build:frontend` 以及全量后端回归测试 `npm test`。

## Review Focus

1. **窄屏横向无溢出 (No Horizontal Scroll)**：在 360px 宽度下，卡片内部任何按钮、下拉框或输入框不得撑出横向滚动条。
2. **模式切换器点击热区 (Touch Target Size)**：移动端的分段控制栏按钮高度不低于 32px，触控体验优秀，避免手指误触。
3. **Agent 节点选择器弹性收缩**：当主机名或 IP 较长时，下拉框必须在移动端正常省略截断（`truncate` / `min-w-0`），右侧刷新按钮永不被挤出屏幕。
4. **直连与代理模式动态切换时的动画稳定性**：在移动端切换 Proxy 和 Direct 模式时，高度自然过渡，不��现元素抖动或跳动。
5. **PC 端零破坏回归**：在 `>=640px` 视口下，模式切换按钮恢复内嵌于卡片头部左侧，字段排列恢复 `4:5:3`。

---

### Task 1: 节点头部 (Node Card Header) 移动端专属布局重构

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:750-850`

**Interfaces:**
- Produces:
  - 移动端首行：左侧为状态圆点与节点名，右侧为百分比 Badge + 启停开关 + 删除按钮
  - 移动端次行：全宽双列通栏分段控制器（`grid grid-cols-2 w-full mt-2`）
  - PC 端（`sm:`）：模式切换器仍然内嵌在首行节点名右侧

- [ ] **Step 1: 定位并重构卡片头部结构**

修改 `frontend/src/components/ConfigModal.tsx` 中上游服务器卡片头部结构（原 754-850 行）：
```tsx
<div className="pb-2.5 mb-2.5 border-b border-slate-700/40">
  {/* First Row: Status, Node Name, Percentage, Controls */}
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center space-x-2 min-w-0 flex-1">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${server.enabled ? color : 'bg-slate-600'}`} />
      <span className="text-xs font-semibold text-slate-200 truncate">
        {server.name || `Node ${idx + 1}`}
      </span>
      <span
        className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-medium shrink-0 ${
          server.enabled
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            : 'bg-slate-800 text-slate-400 border border-slate-700'
        }`}
      >
        {server.enabled ? `${pct}%` : t('config.nodeDisabled', '已禁用')}
      </span>

      {/* Desktop-only Server Type Switcher */}
      <div className="hidden sm:inline-flex rounded p-0.5 bg-slate-900 border border-slate-700/80 ml-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            const updated = [...upstreamServers];
            updated[idx] = { ...updated[idx], type: 'proxy', agentId: undefined };
            setUpstreamServers(updated);
          }}
          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
            (server.type || 'proxy') === 'proxy'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('config.serverTypeProxy', '代理模式 (Proxy)')}
        </button>
        <button
          type="button"
          onClick={() => {
            const updated = [...upstreamServers];
            let nextUrl = updated[idx].url;
            if (!nextUrl || nextUrl.includes('proxy') || nextUrl === '') {
              nextUrl = 'https://generativelanguage.googleapis.com';
            }
            updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
            setUpstreamServers(updated);
            setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
          }}
          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
            server.type === 'direct'
              ? 'bg-cyan-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('config.serverTypeDirect', '直连模式 (Direct)')}
        </button>
      </div>
    </div>

    {/* Right Controls: Enable Toggle & Delete Button */}
    <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
      <label className="flex items-center cursor-pointer space-x-1.5">
        <input
          type="checkbox"
          checked={server.enabled}
          onChange={(e) => {
            const updated = [...upstreamServers];
            updated[idx] = { ...updated[idx], enabled: e.target.checked };
            setUpstreamServers(updated);
            setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
          }}
          className="sr-only"
        />
        <div className={`w-7 h-4 rounded-full transition-colors relative ${server.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${server.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
        </div>
        <span className="hidden sm:inline text-[11px] text-slate-400">
          {server.enabled ? t('config.nodeEnabled', '已启用') : t('config.nodeDisabled', '已禁用')}
        </span>
      </label>

      <button
        type="button"
        disabled={upstreamServers.length <= 1}
        onClick={() => {
          if (upstreamServers.length <= 1) return;
          const updated = upstreamServers.filter((_, i) => i !== idx);
          setUpstreamServers(updated);
          setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
        }}
        className={`p-1.5 sm:p-1 text-slate-400 hover:text-red-400 transition-colors ${
          upstreamServers.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
        }`}
        title={upstreamServers.length <= 1 ? t('config.atLeastOneServer', '至少需要保留一个上游网关节点') : 'Delete'}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>

  {/* Mobile-only Full-Width Segmented Mode Switcher */}
  <div className="grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg mt-2 sm:hidden gap-1">
    <button
      type="button"
      onClick={() => {
        const updated = [...upstreamServers];
        updated[idx] = { ...updated[idx], type: 'proxy', agentId: undefined };
        setUpstreamServers(updated);
      }}
      className={`py-1.5 px-2 text-xs rounded-md font-medium text-center transition-all ${
        (server.type || 'proxy') === 'proxy'
          ? 'bg-purple-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {t('config.serverTypeProxy', '代理模式 (Proxy)')}
    </button>
    <button
      type="button"
      onClick={() => {
        const updated = [...upstreamServers];
        let nextUrl = updated[idx].url;
        if (!nextUrl || nextUrl.includes('proxy') || nextUrl === '') {
          nextUrl = 'https://generativelanguage.googleapis.com';
        }
        updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
        setUpstreamServers(updated);
        setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
      }}
      className={`py-1.5 px-2 text-xs rounded-md font-medium text-center transition-all ${
        server.type === 'direct'
          ? 'bg-cyan-600 text-white shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {t('config.serverTypeDirect', '直连模式 (Direct)')}
    </button>
  </div>
</div>
```

- [ ] **Step 2: 运行前端构建验证无语法或编译错误**

Run: `npm run build:frontend`
Expected: PASS

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "style(ui): refactor node card header for mobile responsive layout"
```

---

### Task 2: 节点基础输入字段（备注名/URL/权重）移动端紧凑网格优化

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:850-950`

**Interfaces:**
- Produces:
  - 移动端：第一行「备注名 (col-span-8)」与「权重 (col-span-4)」并排；第二行「网关 URL (col-span-12)」通栏
  - PC 端：保持 `sm:col-span-4` (备注名), `sm:col-span-5` (URL), `sm:col-span-3` (权重) 一行展示

- [ ] **Step 1: 修改网格栅格类名**

将包含��点名、URL 和权重的网格容器类从：
`<div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">`
调整为：
`<div className="grid grid-cols-12 gap-2 sm:gap-2.5 text-xs">`

并将各字段列宽适配为：
- **节点备注名**：`col-span-8 sm:col-span-4 space-y-1`
- **权重**：`col-span-4 sm:col-span-3 space-y-1 sm:order-last`（移动端紧跟备注名右侧，PC 端位于末尾）
- **网关 URL**：`col-span-12 sm:col-span-5 space-y-1`
- **允许模型**：`col-span-12 space-y-1`

- [ ] **Step 2: 运行前端构建验证**

Run: `npm run build:frontend`
Expected: PASS

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "style(ui): optimize upstream node input fields grid for mobile compact viewing"
```

---

### Task 3: 直连模式网络出口通道与 Agent 下拉选择器移动端优化

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:950-1070`

**Interfaces:**
- Produces:
  - Radio Card 在移动端更轻快（减少 padding，微调描述文字大小 `text-[10.5px]`）
  - 下拉框行添加 `min-w-0` 与 `truncate`，防止长节点名造成横向溢���
  - 刷新按钮设定为固定尺寸触控块（`w-9 h-9 shrink-0 flex items-center justify-center`）

- [ ] **Step 1: 优化出口通道单选卡片与下拉选择器**

针对直连模式出口通道模块进行微调：
1. 单选卡片容器保持 `grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs`，在移动端单列堆叠时使用 `p-2 sm:p-2.5`，文字行距更紧凑。
2. 下拉框与刷新按钮容器：
```tsx
{server.agentId && (
  <div className="pt-2 border-t border-cyan-500/10 flex items-center space-x-2">
    <div className="flex-1 min-w-0">
      <select
        value={server.agentId}
        onChange={(e) => {
          const updated = [...upstreamServers];
          updated[idx] = { ...updated[idx], agentId: e.target.value };
          setUpstreamServers(updated);
        }}
        className="w-full ui-input p-2 text-xs font-mono bg-slate-950/80 border-cyan-500/30 text-cyan-200 cursor-pointer truncate"
      >
        {availableHosts.length === 0 ? (
          <option value={server.agentId}>
            {server.agentId} ({t('config.noAgentsAvailable', '暂无在线 Agent')})
          </option>
        ) : (
          availableHosts.map((h) => {
            const identifier = h.name || h.id;
            const statusDot = h.status === 'online' ? '● 在线' : '○ 离线';
            return (
              <option key={h.id} value={identifier}>
                {statusDot} | {identifier} ({h.ip || 'no-ip'})
              </option>
            );
          })
        )}
      </select>
    </div>
    <button
      type="button"
      onClick={fetchAvailableHosts}
      disabled={loadingHosts}
      title="刷新在线 Agent 列表"
      className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-cyan-400 hover:text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded cursor-pointer transition-colors"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loadingHosts ? 'animate-spin' : ''}`} />
    </button>
  </div>
)}
```

- [ ] **Step 2: 运行前端构建测试**

Run: `npm run build:frontend`
Expected: PASS

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "style(ui): refine egress channel radio cards and agent selector for mobile"
```

---

### Task 4: 全局构建与回归验证

**Files:**
- Test: `npm run build:frontend`
- Test: `npm test`

- [ ] **Step 1: 运行前端构建**

Run: `npm run build:frontend`
Expected: PASS (Vite 编译无任何警告或错误)

- [ ] **Step 2: 运行全量后端测试套件验证无回归**

Run: `npm test`
Expected: ALL PASS (178/178 test suites passing)

- [ ] **Step 3: 检查 Git 工作树**

Run: `git status`
Expected: Clean working tree
