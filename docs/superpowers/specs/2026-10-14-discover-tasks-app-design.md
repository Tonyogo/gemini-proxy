# 在线事项应用（Tasks）设计规范（Design Spec）

- **日期**：2026-10-14
- **状态**：待评审（Pending Review）
- **范围**：Gemini 代理控制台发现页内置在线事项应用及后端持久化存储

---

## 1. 概述与设计目标

### 1.1 背景与目标
在当前的 Gemini 代理控制台管理端中，“发现（Discover）”页面已支持内置应用（系统日志、接口演练、双栏对照）与自定义 Web 应用集成，并具备配置的云端同步机制。
为了让开发者和运维人员在调试、管理 API 代理时能够就地记录开发任务、接口联调备忘及跟进事项，拟在发现页新增一个原生的**在线事项（Tasks）**内置应用。

### 1.2 核心特性
1. **深度内置与发现页无缝接入**：作为内置应用（`builtin: tasks`）展示在发现页，支持直接点击拉起全屏工作区，支持顶栏面包屑与快速返回。
2. **双视图自由切换**：支持“看板视图（Kanban Board）”与“清单视图（List View）”一键切换，并记住用户偏好。
3. **流畅的交互体验**：看板列间原生拖拽修改��态、列内排序、一键完成动效；采用乐观更新（Optimistic UI），本地无感即时响应。
4. **独立持久化与云端解耦存储**：事项数据通过独立端点（`/api/admin/tasks`）持久化至 `config/tasks.json`，原子化文件写入，与主网关核心运行时配置隔离。

---

## 2. 架构与数据模型

### 2.1 数据模型（`src/types/tasks.ts` & `frontend/src/types/tasks.ts`）

```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'p0' | 'p1' | 'p2' | 'none';

export interface TaskItem {
  id: string;              // 唯一标识，如 task_1728900000_abc12
  title: string;           // 事项标题（必填，最多 200 字符）
  description?: string;     // 详细说明或备注（可选，支持 Markdown，最多 10,000 字符）
  status: TaskStatus;      // 状态：todo (待办), in_progress (进行中), completed (已完成)
  priority: TaskPriority;  // 优先级：p0 (紧急), p1 (重要), p2 (常规), none (无)
  tags?: string[];         // 标签分类（如 ['API', '前端', 'BUG']）
  dueDate?: string;        // 截止日期（可选，ISO 字符串或 YYYY-MM-DD）
  order: number;           // 排序序号（用于看板或列表内的升序排序）
  createdAt: number;       // 创建毫秒时间戳
  updatedAt: number;       // 更新毫秒时间戳
  completedAt?: number;    // 完成毫秒时间戳
}
```

### 2.2 后端存储与原子写入机制
* **存储路径**：`config/tasks.json`（若使用自定义运行时目录，则以工程根目录下的 `config/tasks.json` 为准）。
* **原子写入（Atomic File Write）**：
  写入时先生成临时文件 `config/tasks.json.tmp.<pid>`，写入并 `fsync` 成功后再执行原子替换重命名 `fs.rename`，彻底防止进程意外终止导致 JSON 文件截断或损坏。
* **文件容灾机制**：
  若文件遭遇外部写入损坏导致 `JSON.parse` 抛错，自动将原文件重命名为 `config/tasks.corrupt.<timestamp>.json` 留档，并在内存中初始化为空列表 `[]`，同时在后端输出 `warn` 级别日志。

---

## 3. 后端 API 接口定义

所有接口均位于 `/api/admin/tasks` 下，由 `adminAuthMiddleware` 拦截鉴权，必须携带 `x-admin-key` 请求头。

### 3.1 获取所有事项
* **请求**：`GET /api/admin/tasks`
* **响应**：
  ```json
  {
    "success": true,
    "tasks": [
      {
        "id": "task_1728900000_abc12",
        "title": "测试双栏对照功能",
        "status": "todo",
        "priority": "p1",
        "order": 0,
        "createdAt": 1728900000000,
        "updatedAt": 1728900000000
      }
    ]
  }
  ```

### 3.2 批量保存 / 全量同步事项
* **请求**：`PUT /api/admin/tasks`
* **请求体**：
  ```json
  {
    "tasks": [ ...TaskItem[] ]
  }
  ```
* **入参校验**：
  - `tasks` 必须为数组。
  - 每个对象校验 `id` (string)、`title` (非空 string, `<= 200`)、`status` (合法枚举)、`priority` (合法枚举)。
* **响应**：
  ```json
  {
    "success": true,
    "count": 1
  }
  ```

### 3.3 新增单项事项
* **请求**：`POST /api/admin/tasks`
* **请求体**：`Partial<TaskItem>`
* **响应**：
  ```json
  {
    "success": true,
    "task": { ...TaskItem }
  }
  ```

### 3.4 删除单项事项
* **请求**：`DELETE /api/admin/tasks/:id`
* **响应**：
  ```json
  {
    "success": true
  }
  ```

---

## 4. 前端组件与界面设计

### 4.1 发现页与主导航集成
1. **类型扩展**：
   - 在 `frontend/src/types/discoverApps.ts` 中，`BuiltinToolId` 增加 `'tasks'`。
   - 在 `frontend/src/App.tsx` 中，`DiscoverSubView` 增加 `'tasks'`。
2. **默认内置应用定义**：
   - 在 `frontend/src/utils/discoverAppsStorage.ts` 及 `config/default.ts` 的 `DEFAULT_BUILTIN_APPS` 中追加：
     ```typescript
     {
       id: 'tasks',
       type: 'builtin',
       name: '在线事项',
       description: '轻量高效的待办清单与状态看板，云端实时同步',
       icon: 'CheckSquare',
       color: 'from-emerald-500 to-teal-600',
       badge: 'KANBAN & LIST',
       enabled: true,
       order: 3,
     }
     ```
3. **顶栏与路由**：
   - 点击“在线事项”卡片，`App.tsx` 将 `discoverSubView` 设置为 `'tasks'`。
   - 顶栏显示 `[返回发现]` 按钮及面包屑 `发现 / 在线事项`。

### 4.2 事项视图组件（`TasksView.tsx`）
包含以下主要功能区：
1. **顶部控制栏（Header Actions）**：
   - **双视图切换**：Tab 切换按钮 `[ ☷ 看板 ]` 与 `[ ≡ 清单 ]`，默认根据 `localStorage.getItem('tasks_view_mode')` 读取（默认看板）。
   - **搜索与过滤**：
     - 搜索输入框（根据标题与描述实时过滤）。
     - 优先级筛选下拉（全部 / P0 / P1 / P2）。
   - **云端同步状态指示灯**：
     - `已同步`（绿色微标）、`同步中...`（旋转指示器）、`同步错误`（重试按钮）。
   - **创建事项按钮**：点��弹出创建/编辑弹窗。

2. **看板视图（Kanban Board View）**：
   - 包含 3 列：**待办（Todo）**、**进行中（In Progress）**、**已完成（Completed）**。
   - 每列支持原生 HTML5 拖拽（`dragstart`, `dragover`, `drop`），跨列拖入即时更新状态；
   - 事项卡片展示：
     - 优先级徽标（P0 紧急/红色、P1 重要/橙色、P2 常规/蓝色、无/灰色）。
     - 事项标题与简短描述预览。
     - 截止日期（逾期以红色警示高亮）。
     - 快速勾选完成按钮、编辑按钮、删除按钮。

3. **清单视图（List View）**：
   - 以高密度列表排布各任务，支持按状态分组展开/收起。
   - 快速勾选框：点击瞬间标记完成，展示划线删除效果。
   - 支持多选与快捷删除。

4. **事项编辑/创建抽屉或弹窗（`TaskEditModal.tsx`）**：
   - 标题输入（必填，自动聚焦）。
   - 状态选择（待办 / 进行中 / 已完成）。
   - 优先级单选胶囊（P0 / P1 / P2 / 无）。
   - 详细说明（支持 Markdown 编辑预览）。
   - 截止日期选择器。

---

## 5. 错误处理与安全性

1. **鉴权防护**：严格复用 `adminAuthMiddleware`，未经认证直接拦截 401。
2. **入参防御**：
   - 标题长度严格截断或拒绝（最大 200 字符）。
   - 描述文本进行 Markdown 渲染时，采用成熟安全的解析器或内置纯文本/转义规则，严防 XSS 注入。
3. **乐观更新防抖同步**：
   - 用户的拖拽、重排序、状态切换在前端瞬时生效；
   - 本地状态通过 500ms 防抖自动汇总发送 `PUT /api/admin/tasks`；
   - 若同步遇到网络异常，弹出轻量 Toast 提示，并在内存与本地保留未保存状态，提供重试选项。

---

## 6. 测试与验证计划

1. **后端单元与接口测试（Jest + Supertest）**：
   - `tests/taskService.test.ts`：
     - 验证读写 `tasks.json` 的原子写入逻辑。
     - 验证数据损坏时的自动备份与容灾恢复。
   - `tests/taskRoutes.test.ts`：
     - 验证无 Key 请求拦截（401）。
     - 验证 `GET /api/admin/tasks` 返回正确结构。
     - 验证 `PUT /api/admin/tasks` 批量更新与非法枚举字段校验（400）。
2. **前端与集成测试**：
   - 执行 `npm run build`，确保前后端 TypeScript 编译零报错。
   - 验证发现页内置卡片正常渲染及点击跳转进入 `TasksView`。
   - 验证看板拖拽跨列移动及状态同步。
   - 验证清单视图勾选完成与快捷新增。
