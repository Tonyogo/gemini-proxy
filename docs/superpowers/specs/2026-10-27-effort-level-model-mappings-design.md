# 顶栏 Effort 档位切换与分档位模型映射配置设计规范

## 1. 概述与背景 (Intent & Why)

在实际使用 Gemini Proxy 代理 Claude Code / Codex / Gemini 客户端请求时，用户常常需要根据任务复杂度在不同推理强度或不同模型组合之间快速切换（例如：日常轻量问答使用 Flash/标准模型，常规编码使用标准 Pro 组合，复杂架构/深度调试开启 `-high` 深度思考或高阶模型池）。

目前切换模型映射规则必须进入「系统配置 -> 模型映射」逐条修改或替换 JSON，操作路径长且无法保留多套预设配置。

本次设计参考 Codex 的 **Effort（推理强度档位）** 交互体验，在控制台顶部标题栏（Header）标题旁增加 **Effort 档位切换器（`Low` / `Medium` / `High`）**，并在后端与设置弹窗中支持三套独立的模型映射配置（`effortModelMappings`），实现顶栏一键热切换全局生效的模型路由映射方案。

---

## 2. 目标、非目标与负目标 (Goals, Non-Goals, Anti-Goals)

### 2.1 目标 (Goals)
1. **顶栏 Codex 风格 Effort 切换徽章与下拉菜单**：
   - 在顶部 Header 左侧标题面包屑旁展示当前激活的 Effort 档位胶囊徽章（`Low` / `Medium` / `High`）。
   - 点击展开精致的下拉面板，展示三个档位的名称、视觉信号强度指示、映射规则数量及当前激活状态，点击任一档位即可热切换并立即生效。
   - 下拉面板底部提供「配置档位映射...」快捷按钮，点击直接打开 `ConfigModal` 并跳转至「模型映射」标签页。
2. **分档位模型映射存储与零侵入向后兼容**：
   - 新增 `effortLevel: 'low' | 'medium' | 'high'`（默认 `'medium'`）与 `effortModelMappings: Record<EffortLevel, ModelMappingsConfig>`。
   - 当前激活档位的映射规则自动同步至 `config.modelMappings`，确保现有 Claude / Gemini 代理路由、Dashboard 统计、`/api/admin/models` 及所有现有测试用例 100% 零破坏兼容。
   - 升级兼容：当 `runtime.json` 尚未配置 `effortModelMappings` 时，自动使用现有的 `MODEL_MAPPINGS` 深拷贝初始化 `low`、`medium`、`high` 三档，不丢失任何已有配置。
3. **设置弹窗（`ConfigModal`）分档位模型映射管理**：
   - 在「模型映射（Mappings）」标签页顶部增加 `Low / Medium / High` 档位切换栏，可分别查看与编辑每个档位的映射规则（支持 KV 可视化列表与原始 JSON 双向实时同步）。
   - 支持在弹窗内切换当前全局生效档位（Active 标识），并提供「从其他档位复制规则」的快捷操作，方便快速基于现有档位派生新档位配置。
   - 完整纳入 `ConfigModal` 的脏检查（Dirty Check）、放弃修改（Revert）与恢复出厂默认（Reset to Env）生命周期。

### 2.2 非目标 (Non-Goals)
- 不改变单个模型映射规则内部的语法结构（仍保持支持单模型字符串、多目标数组 `string[]`、以及带 `strategy` 的对象 `{ target, targets, strategy }`）。
- 不改变底层 `claudeTranslator.getModelMappingInfo` 的单次查找算法，因为它直接读取已同步的 `config.modelMappings`。

### 2.3 负目标 (Anti-Goals)
- **拒绝多端状态不一致**：不采用仅保存在浏览器 `localStorage` 的纯前端方案，所有档位配置与当前激活档位必须持久化在服务端 `runtime.json` 中，多设备/多标签页访问保持一致。
- **拒绝顶栏拥挤**：在移动端小屏幕下，顶栏 Effort 徽章自动采用紧凑样式（仅图标 + `Low/Med/High` 短标签），避免挤压面包屑标题与右侧操作按钮。

---

## 3. 数据结构与后端架构设计 (Backend & Config Architecture)

### 3.1 类型定义 (`src/types/index.ts`)
新增 Effort 档位相关类型定义：
```ts
export type EffortLevel = 'low' | 'medium' | 'high';

export type EffortModelMappings = Record<EffortLevel, ModelMappingsConfig>;
```

### 3.2 配置管理与联动逻辑 (`config/default.ts`)
1. **常量与校验辅助函数**：
   - `VALID_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high']`
   - `normalizeEffortLevel(raw: any, fallback: EffortLevel = 'medium'): EffortLevel`
   - `normalizeEffortModelMappings(raw: any, fallbackMappings: ModelMappingsConfig): EffortModelMappings`：确保 `low`、`medium`、`high` 三个键始终存在且为合法对象；若某档位未定义，则使用 `fallbackMappings` 的深拷贝填充。
2. **默认初始化**：
   - `effortLevel`：优先读取 `runtimeOverrides.effortLevel`，其次读取环境变量 `EFFORT_LEVEL`，默认 `'medium'`。
   - `effortModelMappings`：优先读取 `runtimeOverrides.effortModelMappings`；若未配置，则以 `baseMappings`（`runtimeOverrides.modelMappings ?? parsedModelMappings`）深拷贝初始化 `low`、`medium`、`high` 三档。
   - `modelMappings`：始终与 `effortModelMappings[effortLevel]` 保持一致。
3. **`updateConfig` 双向同步规则**：
   - **场景 A（切换档位 +/或 提交多档位映射）**：
     - 若传入了 `partialConfig.effortModelMappings`，先归一化合并到三档映射表。
     - 若传入了 `partialConfig.effortLevel`，校验并更新当前激活档位 `nextEffortLevel`。
     - 若同时传入或仅传入了 `effortLevel` / `effortModelMappings`，自动将 `partialConfig.modelMappings` 设为 ` clone(nextEffortModelMappings[nextEffortLevel])`，保证 `config.modelMappings` 立即切换为激活档位的规则。
   - **场景 B（旧接口仅传入 `partialConfig.modelMappings`，未传 `effortModelMappings`）**：
     - 将传入的 `partialConfig.modelMappings` 同步写入当前激活档位 `effortModelMappings[currentEffortLevel]`，保持两者一致。
   - **场景 C（`resetToEnv: true` 恢复出厂设置）**：
     - 重置 `effortLevel = normalizeEffortLevel(process.env.EFFORT_LEVEL, 'medium')`，并用环境变量 `MODEL_MAPPINGS` 重新初始化 `effortModelMappings` 的三个档位及 `modelMappings`。

### 3.3 Admin 接口扩展 (`src/admin/controllers/adminController.ts`)
- `GET /api/admin/status` 与 `POST /api/admin/config` 的 `config` 响应体中增加：
  - `effortLevel: config.effortLevel`
  - `effortModelMappings: config.effortModelMappings`
- `GET /api/admin/models` 响应体中增加 `effortLevel: config.effortLevel` 与 `effortModelMappings: config.effortModelMappings`（同时保留原有的 `mappings: config.modelMappings`）。

---

## 4. 前端交互与组件设计 (Frontend & UI Architecture)

### 4.1 顶栏 Effort 切换器 (`frontend/src/components/EffortSelector.tsx` & `App.tsx`)

```
+-----------------------------------------------------------------------------------+
| [SidebarToggle] | Gemini Proxy > 仪表盘  [⚡ Medium ▾]        [GitHub] [刷新] [在线] |
+------------------------------------------+----------------------------------------+
                                           |
                                           v (点击展开下拉卡片)
                                  +------------------------------------+
                                  | REASONING EFFORT / 模型映射档位     |
                                  |------------------------------------|
                                  | [▂  ] Low      轻量极速   2 规则    |
                                  | [▂▂ ] Medium   标准均衡   4 规则 ✓  |
                                  | [▂▂▂] High     深度推理   4 规则    |
                                  |------------------------------------|
                                  | ⚙️ 配置各档位映射规则...            |
                                  +------------------------------------+
```

- **挂载位置**：`App.tsx` 顶部 `<header>` 面包屑标题右侧（处于非内嵌网页详情态时展示）。
- **状态同步**：
  - `App.tsx` 在 `/api/admin/status` 验证登录及刷新时，读取并保存 `effortLevel` 和 `effortModelMappings`。
  - 在 `EffortSelector` 中选择新档位时，乐观更新本地 `effortLevel` 状态，并调用 `POST /api/admin/config` 发送 `{ effortLevel: nextLevel }`。成功后递增 `refreshTrigger` 使当前视图感知最新配置。
  - 在 `ConfigModal` 保存或重置后，回调同步更新顶栏的 `effortLevel` 与 `effortModelMappings`。
- **档位视觉编码**：
  - `low`：翡翠绿（Emerald）配色，1 格信号强度条，标签 `Low`（中文提示：轻量档位）。
  - `medium`：靛蓝（Indigo）配色，2 格信号强度条，标签 `Medium`（中文提示：标准档位）。
  - `high`：琥珀金（Amber）配色，3 格信号强度条 + 闪电微标，标签 `High`（中文提示：高阶档位）。

### 4.2 设置弹窗分档位映射编辑器 (`frontend/src/components/ConfigModal.tsx`)

在 `ConfigModal` 的 `activeTab === 'mappings'` 区域顶部增加 **Effort 档位工作台切换栏**：

```
+-----------------------------------------------------------------------+
| 模型映射规则                                       [切换 JSON / 可视化] |
|-----------------------------------------------------------------------|
| 档位选择: [ ▂ Low (2) ]  [ ▂▂ Medium (4) ●当前 ]  [ ▂▂▂ High (4) ]     |
| 当前编辑: Medium 档位    [✓ 已设为当前生效档位]   [从其他档位复制 ▾]    |
|-----------------------------------------------------------------------|
| 🔍 过滤模型规则...                                                     |
| #1  [claude-sonnet-4-5]  →  [gemini-2.5-pro-high]  [默认] [⚡HIGH] [🗑] |
+-----------------------------------------------------------------------+
```

- **双状态解耦**：
  - `activeEffortLevel`：当前全局生效的档位（保存后作为系统的 `effortLevel`）。
  - `editingEffortTab`：用户在弹窗内当前正在查看/编辑的档位（默认初始化为 `activeEffortLevel`）。
  - `effortMappingsState: Record<EffortLevel, MappingEntry[]>` 与 `effortRawJsonState: Record<EffortLevel, string>`：分别维护三档的 KV 条目列表与 JSON 字符串，切换 `editingEffortTab` 时无缝切换编辑内容，互不干扰。
- **快捷操作**：
  - **设为当前生效档位**：当 `editingEffortTab !== activeEffortLevel` 时，显示「设为当前生效档位」按钮，点击即可将 `activeEffortLevel` 切换为当前档位（当然直接点击顶栏的档位选项也可切换）。
  - **从其他档位复制**：提供快捷按钮（如在编辑 `High` 时可一键「从 Medium 复制规则」），方便快速克隆基准规则后再批量点亮 `HIGH` 按钮。
- **脏检查（Dirty Check）**：
  - `initialConfigRef` 记录初始的 `effortLevel` 与序列化后的 `effortModelMappings`。
  - 只要 `activeEffortLevel` 改变，或任意一个档位（`low` / `medium` / `high`）的映射规则发生变更，`tabDirtyMap.mappings` 即标记为 `true`，底部浮动保存栏高亮提示未保存修改。
- **打开指定 Tab 支持**：
  - `ConfigModal` 支持可选属性 `initialTab?: TabType`。当用户从顶栏 Effort 下拉菜单点击「配置档位映射...」时，直接以 `mappings` 标签页打开 `ConfigModal`。

### 4.3 国际化文案 (`frontend/src/i18n/translations.ts`)
- 新增中英文翻译键值：
  - `effort.label`, `effort.low`, `effort.medium`, `effort.high`
  - `effort.lowDesc`, `effort.mediumDesc`, `effort.highDesc`
  - `effort.rulesCount`, `effort.configureMappings`, `effort.activeBadge`, `effort.setActive`, `effort.copyFrom`

---

## 5. 错误处理与边界情况 (Error Handling & Edge Cases)

1. **非法档位参数容错**：若请求传入未知的 `effortLevel`（非 `low` / `medium` / `high`），后端 `normalizeEffortLevel` 自动回退至当前档位或 `'medium'`，不会导致崩溃或清空映射。
2. **JSON 格式校验**：在 `ConfigModal` 保存时，依次校验 `low`、`medium`、`high` 三个档位的 JSON 合法性；若某个档位在 JSON 模式下输入了语法错误的 JSON，弹窗准确提示对应的档位名称与错误信息，阻止脏数据提交。
3. **网络异常处理**：顶栏 `EffortSelector` 切换失败时，自动回滚本地乐观更新的 `effortLevel` 状态，确保界面展示与服务端实际状态一致。

---

## 6. 测试验证计划 (Testing Strategy)

1. **后端配置与联动单元测试 (`tests/effortConfig.test.ts`)**：
   - 验证默认初始化时 `effortLevel` 为 `'medium'`，且 `effortModelMappings` 的三档均正确继承初始 `modelMappings`。
   - 验证通过 `POST /api/admin/config` 更新 `effortModelMappings` 与切换 `effortLevel` 时，`config.modelMappings` 与 `claudeTranslator.getCleanModelName()` 实时返回对应档位的目标模型。
   - 验证旧接口仅传 `modelMappings` 时自动同步更新当前激活档位的映射。
   - 验证 `resetToEnv: true` 时重置 `effortLevel` 和三档映射。
2. **前端组件与构建验证**：
   - 运行 `npm run build` 验证前后端 TypeScript 严格类型检查与 Vite 打包零报错。
   - 运行 `npx jest --runInBand` 确保全量测试套件通过。
