# WebTerminal 主机选择器交互优化与离线节点清理设计规范

## 1. 概述

本设计规范旨在解决 WebTerminal 管理面板中主机节点选择器的两大问题：
1. **下拉列表展示不全与选不到的问题**：当节点数量较多（超过 3 个）时，由于父级容器 `UnifiedTerminalView` 设置了 `overflow-hidden`，普通的相对定位 Popover 会被硬截断，导致列表底部的节点被遮挡无法选中。
2. **长期离线节点残留不消失的问题**：当前 Agent 断开后仅将状态置为 `offline`，缺乏过期自动淘汰机制，也没有手动清理手段，导致测试或临时离线的节点长期堆积在列表中，难以辨别和管理��

## 2. 设计目标

- **浮层免裁剪与自适应定位**：使用 `createPortal` 挂载到根节点，配合按钮位置计算，彻底杜绝外层父容器 `overflow-hidden` 造成的视图截断。
- **流畅的滚动与点击热区**：支持多节点滚动浏览，确保列表最后一项完整展示并拥有良好的点击/触摸反馈。
- **离线时间清晰展现**：为离线主机明确展示最后离线时间（如“离线于 5 分钟前”、“离线于 2 小时前”），提供清晰的状态感知。
- **自动淘汰与手动清理双重保障**：
  - 后端实现离线超过 24 小时（TTL = 86,400,000 ms）的节点自动清理销毁。
  - 前端下拉面板提供一键“清理离线节点”按钮，调用后端专属清理接口。

## 3. 架构与详细设计

### 3.1 前端：`TerminalHostSelector.tsx` 改造

#### 3.1.1 浮层定位与 Portal 挂载
- 将下拉 Popover 从组件内部内联渲染改为通过 `createPortal(..., document.body)` 挂载到顶层 `body`。
- 在展开浮层（`isOpen === true`）时，通过 `buttonRef.current.getBoundingClientRect()` 动态测量计算绝对位置：
  - `top = rect.bottom + 6`；若屏幕底部空间不足以容纳内容且上方空间充足，则向上翻转 `top = rect.top - popoverHeight - 6`。
  - `left = Math.min(rect.left, window.innerWidth - popoverWidth - 12)`，防止在小屏幕靠右侧时横向溢出视口。
- 绑定全局点击监听器（Outside Click）与窗口尺寸/滚动变化监听器，实现平滑的开关与定位更新。

#### 3.1.2 列表滚动容器保障
- 列表容器设置 `max-h-64 sm:max-h-80 overflow-y-auto overscroll-contain`。
- 每一个主机项设置合适的内边距和高度（`min-h-[44px]`），底部保留内边距 `pb-2`，确保最后一项在滚动到底部时完全露出版面且可被点击。

#### 3.1.3 离线时间展示与国际化
- 封装通用的相对时间格式化工具函数 `formatRelativeTime(timestamp: number, lang: 'zh' | 'en'): string`：
  - `< 1 分钟`：显示“刚刚离线” / “Just now”
  - `< 60 分钟`：显示“离线于 X分钟前” / “Offline Xm ago”
  - `< 24 小时`：显示“离线于 X小时前” / “Offline Xh ago”
  - `>= 24 小时`：显示“离线于 X天前” / “Offline Xd ago”
- 条目 `title` 属性包含完整精确时间戳，方便用户悬停查看。

#### 3.1.4 手动清理离线节点按钮
- 在浮层顶部 Header 区域，当检测到存在 `offline` 主机时，展示「清理离线」按钮（Trash2 或 Eraser 图标 + 文案）。
- 点击触发调用 `DELETE /api/admin/terminal/hosts/offline` 接口，成功后重新静默拉取 `fetchHosts()`，并显示成功反馈。

---

### 3.2 后端：`terminalHostManager.ts` & 接口增强

#### 3.2.1 24 小时离线淘汰机制
- 常量定义：`OFFLINE_HOST_TTL_MS = 24 * 60 * 60 * 1000`（24 小时）。
- 清理核心方法：`pruneOfflineHosts(maxAgeMs?: number): string[]`：
  - 遍历 `this.hosts`，找出状态为 `offline` 且 `(now - lastSeen) > maxAgeMs` 的所有主机。
  - 当未传 `maxAgeMs` 或传入 `0` 时，清理所有已离线的主机。
  - 对满足条件的每一个主机：
    - 调用 session 的 `destroy()` 销毁 WebSocket 连接与历史缓冲池。
    - 从 `this.sessions` 中移除。
    - 调用 `clearPendingRpcForHost(hostId)` 取消未完成的 RPC 请求。
    - 从 `this.hosts` 中移除该记录。
  - 返回被移除的 `prunedHostIds` 列表。
- 触发时机：
  - **惰性清理**：在执行 `getHosts()` 返回主机列表前，先执行一次 `pruneOfflineHosts(OFFLINE_HOST_TTL_MS)`。
  - **定期清理**：启动 `setInterval`（每 1 小时检查一次）自动清理超期主机。

#### 3.2.2 清理离线主机 REST API
- 路由路径：`DELETE /api/admin/terminal/hosts/offline`
- 鉴权验证：沿用既有 `adminAuthMiddleware`（校验 `x-admin-key`）。
- 控制器方法：`adminController.pruneOfflineTerminalHosts(req, res)`：
  - 调用 `terminalHostManager.pruneOfflineHosts(0)`（清理全部离线主机）。
  - 返回 JSON 结构：
    ```json
    {
      "success": true,
      "prunedCount": 2,
      "prunedIds": ["host-1", "host-2"]
    }
    ```

---

## 4. 错误处理与边缘情况

1. **当前选中的节点刚好被清理**：
   - 若用户当前选中的 `activeHostId` 离线并被清理，前端 `TerminalHostSelector` 中已有的自动切换逻辑将生效，自动切换为第一个在线节点，或在列表为空时重置为空字符串。
2. **清理过程中节点恰好重新连入**：
   - 只要 Agent 建立连接，状态即变为 `online`；清理逻辑严格过滤 `status === 'offline'`，绝不会误删正在连接或已在线的节点。
3. **小屏移动端与软键盘适配**：
   - 挂载至 `document.body` 之后，浮层层级使用 `z-[99]`，避免受内部层级或溢出隐藏影响，且在窗口高度压缩时自动贴合视口可用高度。

---

## 5. 测试计划与验证矩阵

1. **后端单元与集成测试 (`tests/terminalHostsApi.test.ts`)**：
   - 测试模拟一个离线超过 24 小时的主机和一个刚离线的主机，验证 `getHosts()` 只清理超过 24 小时的离线主机。
   - 测试调用 `DELETE /api/admin/terminal/hosts/offline` 能够将所有离线主机彻底清理，而在线主机保持不受影响。
   - 测试未携带有效 `x-admin-key` 时访问该接口被正确拦截并返回 401。
2. **前端组件测试 (`tests/terminalHostSelector.test.ts`)**：
   - 验证下拉 Popover 正确使用 `createPortal` 挂载至 `document.body`。
   - 验证离线主机能够渲染出离线时间提示。
   - 验证存在离线主机时渲染清理离线按钮。
