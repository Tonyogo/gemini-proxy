# 终端列表按名称排序与离线过滤设计规范

## 1. 概述

本规范旨在优化 WebTerminal 主机选择器的展示顺序与可用性：
1. **排序优化**：改变原有仅依接入时间存入 Map 的无序现状，实现“在线节点置顶 + 同状态下按主机名称字母 A-Z 升序排列”，保证多主机环境下的整洁与易查找性。
2. **离线过滤**：在主机选择器下拉搜索框中内嵌快捷切换按钮，支持一键切换“隐藏离线节点 / 显示全部节点”，并支持本地存储状态记忆。

## 2. 详细设计

### 2.1 后端排序实现 (`src/admin/services/terminalHostManager.ts`)

- **规则制定**：
  在 `TerminalHostManager.getHosts()` 返回主机列表前，执行排序逻辑：
  1. **在线状态置顶**：`status === 'online'` 排在 `status === 'offline'` 前面；
  2. **字母自然排序**：同状态下使用 `a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })` 进行字母与数字的自然排序。
- **全局一致性**：保证通过 REST 接口 `/api/admin/terminal/hosts` 获取的主机数组天然具备该排序。

---

### 2.2 前端交互与离线过滤设计 (`frontend/src/components/terminal/TerminalHostSelector.tsx`)

1. **状态持久化**：
   - 增加状态 `hideOffline`，默认从 `localStorage.getItem('terminal_hide_offline_hosts') === 'true'` 读取。
   - 用户切换时，同步更新 `localStorage`。
2. **搜索输入框内嵌切换按钮**：
   - 在搜索框右侧内嵌（`absolute right-1.5 top-1/2 -translate-y-1/2`）一个 `Wifi` 图标按钮：
     - 未激活（显示全部节点）：半透明灰色（`text-slate-400 hover:text-slate-200`），Tooltip 为“仅显示在线节点”；
     - 激活（隐藏离线节点）：高亮翠绿微底色（`text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded p-1`），Tooltip 为“显示全部节点 (包含离线)”。
3. **列表过滤与排序**：
   - `filteredHosts` 在 `useMemo` 中依次执行：
     1. 文本搜索过滤（匹配名称、ID、IP、系统类型）；
     2. 若 `hideOffline` 为 `true`，剔除 `status === 'offline'` 的节点；
     3. 应用“在线优先 + 名称 A-Z 自然排序”。
4. **空状态提示优化**：
   - 若过滤后列表为空，且是因为开启了 `hideOffline` 导致的（即存在离线节点），展示“已隐藏 {count} 个离线节点”及一键显示按钮。

---

### 2.3 国际化扩充 (`frontend/src/i18n/locales/`)

在 `zh.ts` 和 `en.ts` 的 `webTerminal.hostSelector` 下补充：
- `showOnlyOnline`: "仅显示在线节点" / "Show online only"
- `showAllHosts`: "显示全部节点 (包含离线)" / "Show all hosts (including offline)"
- `hiddenOfflineCount`: "当前已隐藏 {count} 个离线节点" / "{count} offline hosts hidden"
- `clickToShowAll`: "显示全部" / "Show all"

---

## 3. 测试与验证计划

1. **后端单测** (`tests/terminalHostsApi.test.ts`)：
   - 构造多个不同名称、不同状态的节点，验证 `getHosts()` 返回顺序满足“在线置顶且名称 A-Z 升序”。
2. **前端单测** (`tests/terminalHostSelector.test.ts`)：
   - 验证搜索框内嵌离线过滤切换按钮及相关属性；
   - 验证 `hideOffline` 能正确过滤离线节点并按名称排序。
3. **回归验证**：
   - 运行全量 `npm test` 与 `npm run build`。
