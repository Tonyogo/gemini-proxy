# WebTerminal 解耦残留清理与构建优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底清理 WebTerminal 与 gt 剥离后的遗留无效代码（包括部署脚本、前端无效 Agent 出站配置、Vite 循环依赖警告），同步修正 CLAUDE.md、README.md 与 .env.example 文档规范，保持 .github/workflows/deploy.yml 不变，并通过全量构建与自动化测试。

**Architecture:** 
1. 剥离前端 `ConfigModal.tsx` 中未实际生效的 `agentId`、`availableHosts` 状态与 UI 逻辑，简化直连模式（Direct Mode）出站展示；
2. 重构 `frontend/vite.config.ts` 的 `manualChunks` 拓扑规则，消除 `@xterm` 废弃分支并彻底消除 Rollup 循环 chunk 告警；
3. 清除 `scripts/deploy.sh` 中对已删除 `scripts/gt.js` 的无效同步命令；
4. 全面重构 `CLAUDE.md`、`README.md` 与 `.env.example`，对齐纯粹的 API 代理服务定位。

**Tech Stack:** TypeScript, React 18, Vite 5, Rollup, Express, Jest.

**Spec:** In-chat approved bounded design (Brainstorming discussion on 2026-10-11).

## Global Constraints

- **deploy.yml 零改动**：绝对不修改 `.github/workflows/deploy.yml`。
- **全量测试保持 100% PASS**：所有 Jest 测试套件（99 个 suites）在改动后必须全部通过。
- **构建零告警**：`npm run build:frontend` 必须构建成功且没有任何 `Circular chunk` 警告。

## Review Focus

1. `ConfigModal` 保存配置时，上游服务器对象不再包含废弃的 `agentId` 属性，避免污染 `runtime.json`。
2. Direct 模式卡片在 `ConfigModal` 中正常展示“官方 Gemini API”标识及 API Key 输入框，不丢失原有直连配置能力。
3. `vite.config.ts` 的 `manualChunks` 拆分后生产包在浏览器中能够正常解析 Monaco 和 Markdown，不发生依赖丢失。
4. `scripts/deploy.sh` 执行时在无 `scripts/gt.js` 的情况下顺畅完成部署，不输出任何警告或报错。
5. `CLAUDE.md` 准确反映无状态代理架构，删除所有 `gt` CLI 与 `WebTerminal` 说明，避免开发助手上下文污染。

---

### Task 1: 清理部署脚本中的失效逻辑

**Files:**
- Modify: `scripts/deploy.sh:114-118`

**Interfaces:**
- Consumes: 本地 bash 脚本 `scripts/deploy.sh`
- Produces: 纯净的 `scripts/deploy.sh`，仅负责 git pull、依赖安装、构建和 pm2 reload

- [x] **Step 1: 检查 scripts/deploy.sh 中的失效逻辑**

查看 `scripts/deploy.sh` 第 114-118 行：
```bash
# Keep gt CLI binary in sync if installed globally
if [ -f "/usr/local/bin/gt" ] && [ -f "scripts/gt.js" ]; then
  cp "scripts/gt.js" "/usr/local/bin/gt" 2>/dev/null && chmod +x "/usr/local/bin/gt" || true
fi
```

- [x] **Step 2: 删除失效代码段**

从 `scripts/deploy.sh` 中删除该段逻辑。

- [x] **Step 3: 验证脚本语法**

运行：`bash -n scripts/deploy.sh`
预期：退出码 0，无任何语法错误。

- [x] **Step 4: 提交变更**

```bash
git add scripts/deploy.sh
git commit -m "fix(deploy): remove obsolete gt.js sync from deploy.sh"
```

---

### Task 2: 修复 Vite 分包配置并消除循环 Chunk 告警

**Files:**
- Modify: `frontend/vite.config.ts:13-35`

**Interfaces:**
- Consumes: Vite Rollup build options
- Produces: 无循环依赖警告的生产分包配置

- [x] **Step 1: 审查并修改 frontend/vite.config.ts**

移除无效的 `@xterm` 分支；避免将 `react` 和依赖 react 的通用库强行割裂导致的 `vendor-others <-> vendor-react` 双向依赖。将 Monaco Editor（及其语言支持）、Lucide 图标、Markdown 渲染器等体积较大或叶子节点的库独立分包，其余依赖由 Rollup 自然生成，避免跨 chunk 循环引用。

修改 `frontend/vite.config.ts` 中的 `output` 配置：
```ts
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
      return 'vendor-monaco';
    }
    if (id.includes('lucide-react')) {
      return 'vendor-lucide';
    }
    if (id.includes('react-markdown') || id.includes('remark-gfm')) {
      return 'vendor-markdown';
    }
  }
}
```

- [x] **Step 2: 运行前端构建并验证零 Circular Chunk 警告**

运行：`cd frontend && npm run build`
预期：构建成功，控制台中**无任何** `Circular chunk: vendor-others -> vendor-react` 警告信息。

- [x] **Step 3: 提交变更**

```bash
git add frontend/vite.config.ts
git commit -m "fix(frontend): resolve rollup circular chunks warning in vite config"
```

---

### Task 3: 清理前端配置弹窗中的失效 Agent 出站逻辑及对应测试

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `tests/configModalMobile.test.ts`
- Modify: `tests/i18nAgentEgress.test.ts`

**Interfaces:**
- Consumes: `ConfigModal.tsx`、国际化文件与单测套件
- Produces: 纯净的 Direct Mode UI（仅显示直出目标 Badge 和 API 密钥配置），无残留的 Agent 下拉与网络请求

- [x] **Step 1: 更新 ConfigModal.tsx**

1. 删除 `availableHosts`、`loadingHosts` 状态定义及 `fetchAvailableHosts` 函数；
2. 删除 Direct Mode 中切换“本机出站 / Agent 节点”的按钮组和 Agent 主机下拉选择框；
3. 保留 Direct Mode 中直连官方 API 的指示 Badge（如 `目标: 官方 Gemini API (本机直出)`）；
4. 在保存逻辑中，直接使用 `{ ...s, type: 'direct' }`，不再组装 `agentId` 属性；
5. 移除 `UpstreamServerConfig` 本地扩展中无用的 `agentId?: string` 字段定义。

- [x] **Step 2: 更新国际化语言包与单测**

1. 在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 中，更新 `targetOfficialEndpoint`（中文为 `目标: 官方 Gemini API (本机直连)`，英文为 `Target: Official Gemini API (Local Direct)`）；
2. 保持 `egressLocalShort` / `egressAgentShort` 键兼容或更新 `tests/i18nAgentEgress.test.ts` 使其断言直连模式相关的文案；
3. 更新 `tests/configModalMobile.test.ts` 中关于 Direct 模式卡片的断言，确保测试适配新的极简 Direct 模���卡片；
4. 运行单测验证：
   `npx jest tests/configModalMobile.test.ts tests/i18nAgentEgress.test.ts`
   预期：全部测试用例通过。

- [x] **Step 3: 运行全量测试套件**

运行：`npm test`
预期：99 个测试套件全部通过（PASS）。

- [x] **Step 4: 提交变更**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/configModalMobile.test.ts tests/i18nAgentEgress.test.ts
git commit -m "refactor(config): remove obsolete agent egress selector from direct mode UI"
```

---

### Task 4: 更新 CLAUDE.md、README.md 与 .env.example

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 项目架构文档与配置模板
- Produces: 精准、实时的开发指引与项目说明

- [x] **Step 1: 重构 CLAUDE.md**

1. 移除 `Development Commands` 中的所有 `gt` CLI 命令（`gt login`, `gt run`, `gt ps`, `gt exec` 等）；
2. 移除 `Architecture & Structure` 中的 `WebTerminal & Multi-Host Reverse Agent` 小节；
3. 增加架构解耦说明：强调 Terminal 与多主机代理已迁往独立的 `gt-hub` 项目，当前项目专注于高性能无状态 Claude-to-Gemini API 代理与 Web Admin 控制台；
4. 确保开发、构建（`npm run build`）、部署（`npm run deploy`）、测试（`npm test`）命令完全精准。

- [x] **Step 2: 修正 README.md**

1. 从“核心特性”中删除第 27-29 项关于 WebTerminal、移动端终端、多局域网主机 Agent 的描述；
2. 修正“数据与逻辑完美解耦”中对不存在的 `config/models.json` 的描述，澄清模型映射统一通过环境变量 `MODEL_MAPPINGS` 或 Web Admin 控制台动态配置；
3. 更新“项目结构”树状图，移除已不存在的 `terminal/` 目录和 `scripts/gt.js`。

- [x] **Step 3: 清理 .env.example**

删除第 7 部分关于反向终端 Agent（`TERMINAL_SERVER`）的废弃注释与配置项。

- [x] **Step 4: 提交变更**

```bash
git add CLAUDE.md README.md .env.example
git commit -m "docs: align CLAUDE.md, README.md, and .env.example with decoupled architecture"
```

---

### Task 5: 最终全链路构建与回归验证

**Files:** None (验证环境)

- [x] **Step 1: 验证前端与后端全量构建**

运行：`npm run build`
预期：
1. `npm run build:frontend` 成功构建，输出无任何 Circular chunk 警告；
2. `npm run build:backend` (`tsc`) 成功构建，无任何编译错误。

- [x] **Step 2: 验证完整自动化测试套件**

运行：`npm test`
预期：99 个 test suite，全部 PASS。

- [x] **Step 3: 检查 Git 状态与历史**

运行：`git status` 与 `git log -n 5 --oneline`
预期：工作区干净，无未暂存文件，`.github/workflows/deploy.yml` 保持零改动。
