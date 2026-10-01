# 上游服务器配置极简视觉与紧凑布局重构设计规范 (Spec Document)

- **作者**: Claude Assistant & yatao
- **日期**: 2026-10-01
- **状态**: Approved / Ready for Implementation
- **分类**: Architectural Spec

---

## 1. 背景与重构目标

### 1.1 背景与痛点
在 `ConfigModal.tsx` 的「上游网关」配置面板中，随着多模式、权重分配、模型过滤和 Agent 出口通道等功能的持续迭代，界面中累积了大量的段落级辅助说明文字、长占位符、多行大单选卡片以及重复的 URL 输入框。
这导致：
- 页面信息密度低，视觉噪音大，缺乏现代控制台（如 Cloudflare / Vercel）的精致干练感；
- 移动端或小视口屏幕下单张卡片垂直高度超过 400px，包含过多无效滚动；
- 直连模式下，目标端点必定是 Google 官方 API，依然占据完整的大输入框和多行出口选择大卡片，不够清晰直观。

### 1.2 目标
采用**极致极简风格（Option A + 方案 1：极致内联收敛）**，对 `ConfigModal.tsx` 上游网关面板进行整体视觉与交互重构：
1. **��除所有冗余长句说明文本**：移除顶部副标题、多行卡片解释、长句占位符，仅保留最核心的直观标签与微提示。
2. **直连模式端点与出口极致内联收敛**：
   - 隐藏冗余的 Google 官方 URL 输入框，改为紧凑的灰色端点指示徽章；
   - 废弃占用大片垂直空间的多行 Radio 卡片，重构为单行胶囊分段切换器（Pill Switcher），选中 Agent 时平滑内联展开主机下拉框与刷新按钮。
3. **压缩卡片垂直高度 50% 以上**：显著减少滑动距离，保证移动端与桌面端都具有极高的一致性、清爽感和操作效率。

---

## 2. 界面与交互重构详细规范

### 2.1 文本与占位符瘦身规范

| 区域 | 原有文本 (噪音) | 重构后 (极简) |
|---|---|---|
| **面板顶部** | `配置多个上游 Gemini 网关并设置流量百分比权重及启停状态...` | **完全移除**，仅保留区块标题与「填入官方默认」操作链接 |
| **实时流量条** | `Total Weight: X` / `已禁用` 辅助描述 | 精简为短徽章：`权重合计: X` / `Total: X` |
| **允许模型占位符** | `留空允许全部，多个以英文逗号分隔，如 gemini-2.5-flash, gemini-2.5-pro` | `全部模型 (逗号分隔过滤)` / `All models (comma separated)` |
| **直连模式出口说明** | 4 行长句���明（*“由服务器本机直接请求...”* / *“通过反向 WebSocket 隧道...”*） | **完全废弃**，由胶囊切换器直接自解释 |
| **密钥池计数辅助** | `已配置 {count} 个密钥` | 紧凑右上角小药丸：`Key × {count}` |

### 2.2 代理模式 (`proxy`) 卡片布局

代理模式侧重于第三方网关或自定义反代服务，结构如下：
1. **卡片头部**：状态指示灯、节点备注名、百分比徽章、`[代理模式* | 直连模式]` 分段切换、启停 Toggle、删除按钮。
2. **输入网格**：
   - 第一行：`[ 节点备注名 (4列) ]` `[ 权重 (3列) ]` `[ 网关 URL (5列) ]`（移动端：备注与权重并排，URL 通栏）。
   - 第二行：`[ 允许模型过滤 (12列) ]`。

### 2.3 直连模式 (`direct`) 极致内联布局

直连模式直达 Google Gemini 官方端点，不展示冗余的 URL 输入框，重构为高度紧凑的信息架构：
1. **卡片头部**：状态指示灯、节点备注名、百分比徽章、`[代理模式 | 直连模式*]` 分段切换、启停 Toggle、删除按钮。
2. **基本字段**：
   - `[ 节点备注名 (8列) ]` `[ 权重 (4列) ]`
3. **单行内联出口通道 (Egress Channel Row)**：
   - 标签：`出口通道`
   - 胶囊分段按钮：
     - `[ 本机直接出站 ]`（默认，`agentId` 为空）
     - `[ 借道 Agent 出口 ]`（高亮时，紧随其后展示内联下拉框与刷新小按钮）
   - 目标端点只读提示：以小字徽章形式显示 `Target: Google Official API`。
4. **允许模型过滤**：紧凑单行输入框。
5. **API Key 密钥池 (可选轮换)**：文本域，右上角展示 `Key × {count}` 计数徽章。

---

## 3. 国际化 (i18n) 词条精简

在 `zh.ts` 与 `en.ts` 中精简并替换以下文案：

```typescript
// 中文 (zh.ts)
config: {
  // 移除长句 upstreamServersDesc
  upstreamServersDesc: "",
  trafficTotalWeight: "权重合计: {total}",
  serverAllowedModelsPlaceholder: "全部模型 (逗号分隔过滤)",
  egressChannelTitle: "出口通道",
  egressLocalShort: "本机出站",
  egressAgentShort: "Agent 节点",
  targetOfficialEndpoint: "目标端点: 官方 Gemini API",
  keyPoolCountBadge: "Key × {count}",
}

// 英文 (en.ts)
config: {
  upstreamServersDesc: "",
  trafficTotalWeight: "Total: {total}",
  serverAllowedModelsPlaceholder: "All models (comma separated)",
  egressChannelTitle: "Egress",
  egressLocalShort: "Local Direct",
  egressAgentShort: "Remote Agent",
  targetOfficialEndpoint: "Endpoint: Official Gemini API",
  keyPoolCountBadge: "Key × {count}",
}
```

---

## 4. 影响范围与验证策��

### 4.1 涉及文件
- `frontend/src/components/ConfigModal.tsx`：移除废弃的长段落说明、实现直连模式下的单行胶囊出口切换器与 URL 输入框隐藏。
- `frontend/src/i18n/locales/zh.ts` & `frontend/src/i18n/locales/en.ts`：精简多语言词条。
- `tests/configModalMobile.test.ts` & `tests/i18nAgentEgress.test.ts`：更新对应的 DOM/文本断言。

### 4.2 验证标准
1. **视觉无溢出与低噪音**：卡片内部彻底没有长段落副文本，高度缩减 40%~50%。
2. **直连模式功能无损**：切换本机/Agent 出站与选择 Agent 节点的功能完全正常，提交数据结构（`agentId`, `url`, `apiKeys` 等）与后端完全一致。
3. **构建与测试**：`npm run build:frontend` 编译无错，全量后端测试套件 `npm test` 100% 通过。
