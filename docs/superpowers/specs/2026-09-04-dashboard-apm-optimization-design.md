# 控制台概览 (DashboardView) 页面专业 APM 监控升级与视觉重构设计文档

**日期**: 2026-09-04  
**分支**: `main`  
**目标**: 将控制台概览页面重构升级为专业级现代 APM 监控仪表盘。重构顶部 4 张核心指标卡为专业指标体系，引入贝塞尔平滑面积渐变图表与形态切换，重塑右侧模型与配置矩阵，全面消除浅色模式下的暗色硬编码，提升全尺寸屏幕自适应质感。

---

## 1. 现状问题与优化目标

### 1.1 现状痛点
1. **指标维度浅泛**：原 4 张 KPI 卡仅有粗略的在线状态、原始秒数 uptime、请求总数、成功/失败绝对数，缺乏吞吐率 QPS、可用率百分比与人性化时长等关键 APM 运维指标。
2. **图表表现单一、生硬**：采用直接点对点直线相连，波动时折角尖锐；缺少面积渐变；请求量缺乏形态切换控制（柱状直方图 vs 平滑面积图）。
3. **浅色主题深色硬编码残留**：大量使用 `text-slate-100`, `text-slate-200`, `bg-black/20`, `border-white/[0.04]` 等类名，导致在 Light 浅色主题下文字与背景对比度异常发暗或突兀。
4. **右侧矩阵视觉密度不足**：模型矩阵进度条轨道深色硬编码，缺少多端自适应微晶质感。

---

## 2. 详细设计规范

### 2.1 顶部 4 张专业 APM 核心指标卡 (Tier 1: APM Metric Cards)
1. **服务健康与在线时长 (System Health & Uptime)**：
   - 主态：动态脉冲呼吸绿点 + `ONLINE` 大字 + `HEALTHY` 微晶胶囊；
   - 副态：将 `uptime` 格式化为 `Uptime: Xd Xh Xm`，并带心跳活跃指示。
2. **总流量与平均吞吐负荷 (Total Traffic & Throughput)**：
   - 主态：千分位总请求数（`totalLogsCount.toLocaleString()`）+ 时间窗口标识；
   - 副态：平均吞吐率 `Avg Throughput: X.XX req/s`。
3. **响应耗时与服务品质 (Response Latency & Quality)**：
   - 主态：平均延迟大字（如 `412ms`）+ 品质徽章（`<1s EXCELLENT` / `<3s NORMAL` / `≥3s SLOW`）；
   - 副态：超时熔断阈值说明 `Max Timeout: Xs`。
4. **服务可用度与错误剖析 (Availability Rate & Errors)**：
   - 主态：精确到两位小数的可用度百分比（如 `99.85%`）+ 错误计数胶囊；
   - 副态：成功与错误双色微型占比圆角进度条 + 具体成功/失败计数。

### 2.2 趋势图表贝塞尔平滑面积图与形态切换 (Tier 2: Charts)
1. **单调平滑贝塞尔曲线算法 (Monotone Cubic Bezier Spline)**：
   - 将点集 `(x_i, y_i)` 计算相邻控制点，输出高质量平滑路径 `M ... C ...`；
   - 填充带透明度衰减的纵向渐变区域（Top 40% -> Bottom 0%），增加现代立体感与质感。
2. **请求量趋势图增加形态切换器**：
   - 标题行右侧集成微型切换胶囊：`[ 📊 柱状直方图 | 📈 平滑面积图 ]`；
   - 用户可根据排查习惯自由切换直方柱或平滑波形。
3. **悬浮微卡片 (Hover Tooltip) 全面玻璃拟态**：
   - 统一采用 `backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-2xl rounded-xl p-3.5`；
   - 浅色/深色主题无缝融合，清晰呈现时间点、总数、成功/失败占比或多模型延迟。

### 2.3 右侧矩阵重塑与浅色主题全面除暗 (Tier 3: Right Matrix)
1. **模型性能矩阵 (`ModelPerformanceMatrix.tsx`)**：
   - 三段式横排：模型名称（Tooltip） + 延迟微晶 + 请求数与百分比加粗；
   - 进度条轨道采用 `bg-[var(--border-subtle)]/40`，填充采用专属色彩丝滑微动效。
2. **系统运行时配置 (`SystemRuntimeMatrix.tsx`)**：
   - 6 大配置微晶卡片全面采用 `ui-card-sub`，消除所有黑色底色；
   - 增加秒级换算（如 `180,000ms (3m)`），更具可读性。
3. **浅色主题全面除暗**：
   - 将所有 `text-slate-100`, `text-slate-200` 替换为 `text-[var(--text-primary)]`；
   - 将 `text-slate-400`, `text-slate-500` 替换为 `text-[var(--text-secondary)]`；
   - SVG 辅助线使用 `currentColor` 配合主题动态边框色彩。

---

## 3. 技术实现与组件依赖

- **纯前端自研 SVG 贝塞尔算法**：无需引入额外庞大的三方图表库，保持极低包体积与高渲染性能；
- **状态维护**：
  - `volumeChartType`: `'bar' | 'area'`（默认 `'area'` 或自由切换）；
  - `analyticsTab`: `'latency' | 'distribution'`；
  - `range`: `'today' | 6 | 12 | 24 | 48`。
- **时间格式化工具函数**：
  - `formatUptime(seconds: number): string`
  - `formatThroughput(total: number, range: number | 'today'): string`

---

## 4. 验证与回归策略

1. **测试驱动断言 (`tests/dashboardOptimization.test.ts`)**：
   - 验证 APM 4 张指标卡包含 Uptime 格式化、Throughput、可用度百分比计算；
   - 验证请求量图表支持 `bar` 与 `area` 形态切换；
   - 验证贝塞尔曲线生成逻辑；
   - 验证无硬编码暗色类名（如 `text-slate-100` 在卡片大字标题中已被主题变量替代）。
2. **构建与回归测试**：
   - `npm run build:frontend` (Vite 严格检查)
   - `npm test` (全量 Jest 测试套件)
