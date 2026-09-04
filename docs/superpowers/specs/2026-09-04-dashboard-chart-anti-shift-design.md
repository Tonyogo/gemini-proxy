# 控制台图表防抖精简与暗夜主题白线消除设计文档 (Dashboard Chart Anti-Shift & Dark Border Polish Design)

**日期**: 2026-09-04  
**分支**: `main`  
**目标**: 简化控制台概览图表 Tab 名称；彻底根除模型性能矩阵在 Dark 模式下的刺眼细白线问题；将请求总量图表固定为清晰直观的分模型堆叠彩色柱状图（移除形态切换器）；彻底移除顶栏随着鼠标滑动小时而动态跳动的指标徽章，消除布局抖动（Layout Shift），确保顶栏模型图例稳定呈现。

---

## 1. 现状痛点与优化动因

1. **图表标题冗长复杂**：
   原“请求总量与多模型分布趋势”与“响应延迟走势”标题过长，不够直观精练。
2. **Dark 主题下模型矩阵出现突兀白线**：
   表格内使用 `divide-y divide-[var(--border-subtle)]/50` 与纯白半透明边框，在深色黑底（`#0C0E14`）上因透明度叠加产生生硬的高对比度白色网格感。
3. **图表切换器多余**：
   分模型堆叠柱状图已是最佳的结构呈现方式，右上角的“面积图/柱状图”切换小药丸功能多余，增加视觉噪音。
4. **鼠标滑过小时柱时顶栏布局跳动 (Layout Shift)**：
   顶栏右侧动态插入 `{hoveredIndex !== null && <span>...reqs</span>}` 标签，当鼠标滑过时间点时，该标签突然出现和消失，不断推挤右侧的模型图例胶囊，严重干扰鼠标点击与悬浮交互；且悬浮卡片已详尽展示该时刻数据，顶栏显示属于重复多余。

---

## 2. 详细设计规范

### 2.1 图表 Tab 标题极简重构
将双 Tab 名称精炼为两字精简词汇：
- Tab 1: `[ 📊 请求量 ]`（英文：`[ 📊 Volume ]`）
- Tab 2: `[ ⚡ 响应延迟 ]`（英文：`[ ⚡ Latency ]`）
- 结构规范：`ui-tab-container p-0.5 text-[11px] font-medium shrink-0`

### 2.2 顶栏静态锁定与防抖设计 (Anti-Shift Toolbar)
- **彻底移除**：`volumeChartType` 状态与右上角 `[ 📊 堆叠柱状 | 📈 总体波形 ]` 切换器；
- **固定为纯净的分模型堆叠柱状图**：底层直方柱高度代表总请求，内部按模型专属品牌色分段堆叠，顶段圆角；
- **彻底移除**：顶栏右侧的 `{hoveredIndex !== null && <span ...>...</span>}` 悬浮指示徽章；
- **布局成果**：
  - 顶栏宽度 100% 静态恒定；
  - 鼠标在下方图表无论如何滑动，顶栏的模型图例胶囊纹丝不动，彻底消除跳动问题；
  - 所有悬浮时刻数据（总数、成功/失败数、各模型具体量）均由平滑定位的玻璃拟态微卡片（Hover Tooltip）独立负责渲染。

### 2.3 模型性能矩阵暗夜模式白线根除 (Dark Border Polish)
在 `ModelPerformanceMatrix.tsx` 中：
- 弃用不规范的 `divide-y divide-[var(--border-subtle)]/50`；
- 采用微弱暗阶行间底边框：
  `border-b border-black/[0.04] dark:border-white/[0.04]`（或 `dark:border-slate-800/60`）；
- 表头底部分割线采用：
  `<tr className="border-b border-black/[0.06] dark:border-white/[0.06] ...">`；
- 在 `table` 与包裹容器上设置 `overflow-hidden rounded-xl`，杜绝边缘毛刺；
- 最终效果：Light 模式清爽温润，Dark 模式与卡片底板浑然一体，消除所有突兀亮白线。

---

## 3. 测试与验证策略

1. **测试驱动断言 (`tests/dashboardStreamlinedCharts.test.ts`)**：
   - 验证图表 Tab 标题使用精简词条（`dashboard.chartVolumeTab`、`dashboard.chartLatencyTab`）；
   - 验证移除了 `volumeChartType` 切换器与动态悬浮跳动徽章；
   - 验证 `ModelPerformanceMatrix` 移除了不规范的 `divide-[var(--border-subtle)]/50`；
   - 验证表格边框使用合法的暗阶自适应类名；
2. **全量构建与回归**：
   - `npm run build:frontend` (Vite 严格检查)
   - `npm test` (全量测试套件全部通过)
