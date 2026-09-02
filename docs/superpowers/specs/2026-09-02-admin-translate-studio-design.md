# Admin Translate Studio (AI 翻译工作台) Design Spec

## 1. Overview & Goals
在 Gemini Proxy 的 Admin Web 控制台中增加一个现代化、高生产力的 **AI 翻译工作台（Translate Studio）**。
该工具作为一级功能模块（独立 Tab），定位为专业的文本与 Markdown 双向多语言翻译工具，具备以下核心能力：
- 专注于高质量文本与文档翻译，支持多种专业领域风格（通用直译、专业技术保护、学术/商务、地道润色）。
- 支持智能源语言检测与一键语言互换（⇄）。
- 支持单模型沉浸式双栏对照翻译，以及**多模型同屏并行对比翻译**（如 `gemini-2.5-flash` vs `gemini-2.5-pro`）。
- 完全复用既有 `/v1/messages` 代理路由与流式 SSE 协议，无需新增后端接口，自然享受日志审计、速率统计和安全性。
- 与现有深色高质感设计系统（Linear 风格、Tailwind CSS、Lucide 图标、玻璃拟态）保持 100% 视觉与交互一致性。

---

## 2. Architecture & Request Pipeline

### 2.1 Front-to-Back Flow
```
[User Interface: TranslateView.tsx]
       │
       ├── 1. 用户输入文本并选择源/目标语言、风格、模型
       ├── 2. 点击「翻译」或按下快捷键 ⌘+Enter
       ├── 3. 为每个选中的模型实例化独立的 AbortController
       │
       └── 并行发起流式请求:
           POST /v1/messages (SSE: stream=true)
           Headers:
             - Content-Type: application/json
             - x-admin-key: <current_admin_key> (或 Authorization Bearer)
           Body:
             - model: <modelId>
             - messages: [{ role: 'user', content: <source_text> }]
             - system: <generated_system_prompt_for_style>
             - temperature: 0.3
             - max_tokens: 4096
             - stream: true
       │
[Existing Proxy Pipeline: /v1/messages]
       │
       ├── claudeTranslator.translateClaudeToGoogle()
       ├── Gemini API upstream (streamGenerateContent)
       └── SSE 流式返回到 TranslateView.tsx
       │
[Client Stream Consumer]
       │
       ├── 解析 content_block_delta (text_delta) 实时打字机渲染
       ├── 统计耗时 durationMs 和 output_tokens 计算生成速度
       └── 单模型异常隔离与中止控制
```

---

## 3. UI/UX Component Specifications

### 3.1 Navigation & Integration
- **文件变更**: `frontend/src/App.tsx`
  - 在 `TabType` 联合类型中增加 `'translate'`：`type TabType = 'dashboard' | 'accounts' | 'logs' | 'terminal' | 'playground' | 'translate';`
  - 在 `NAV_ITEMS` 中注册导航项：
    - `id: 'translate'`
    - `icon: Languages` (来自 `lucide-react`)
    - `shortcut: '⌘6'`
  - 注册全局快捷键 `⌘6` 支持一键切换。
- **国际化词条**: `frontend/src/i18n/locales/zh.ts` 和 `en.ts`
  - 新增 `nav.translate` 词条及完整的模块内所有文本的多语言支持。

### 3.2 Main Workspace Layout (`TranslateView.tsx`)
1. **顶部控制栏 (Top Bar Toolbar)**:
   - **源语言选择器 (Source Language)**:
     - 选项包含：`auto` (自动检测), `zh` (简体中文), `en` (英语), `ja` (日语), `ko` (韩语), `fr` (法语), `de` (德语), `es` (西班牙语), `ru` (俄语) 等。
   - **语言互换按钮 (⇄ Swap Button)**:
     - 点击交换源语言与目标语言。
     - 若源语言为 `auto`，利用当前已检测出的语言智能互换。
   - **目标语言选择器 (Target Language)**:
     - 初始值根据当前系统界面语言自动推荐（中文界面下默认为 `en`，英文界面下默认为 `zh`）。
   - **翻译风格下拉 (Style Preset)**:
     - `standard` (通用直译 - 自然准确)
     - `technical` (专业技术 - 严格保护代码/Markdown/专业术语)
     - `academic` (学术/商务 - 严谨专业)
     - `polished` (地道润色 - 符合母语表达习惯)
   - **模型选择与对比切换**:
     - 模式切换开关：`单模型` / `对比模式`
     - 单模型模式：显示单选下拉框。
     - 对比模式：显示多选胶囊/复选列表（支持同时选中 2~3 个模型，如 Flash 与 Pro 并行对比）。
   - **主操作按钮**:
     - 翻译按钮（附带 `⌘+Enter` 徽标）。
     - 若正在生成中，显示停止按钮（红色方块图标，支持终止所有活动请求）。

2. **左栏：原文输入面板 (Source Panel)**:
   - 大尺寸沉浸式文本区域，支持长文本及格式粘贴。
   - 顶部/底部工具状态条：
     - 字符数与词数实时统计。
     - 自动语言检测结果胶囊展示（如：`已检测到: 简体中文`）。
     - 清空文本、一键粘贴、一键复制原文操作按钮。

3. **右栏：译文输出面板 (Target / Comparison Panel)**:
   - **单模型模式**:
     - 全宽大卡片，阅读视野清晰。
   - **多模型对比模式**:
     - 响应式 Grid 布局（1 列 或 2~3 列并排），每个模型对应独立卡片：
       - **卡片头部**:
         - 模型名称与标识。
         - 流式状态指示灯（闪烁呼吸动画表示正在生成）。
         - 耗时统计（例如 `1.4s`）与生成速度（例如 `72.8 tok/s`）。
         - 单卡片停止按钮（仅中断当前模型的生成）。
       - **卡片内容区**:
         - 流式打字机即时输出。
         - 支持切换「纯文本」与「Markdown 渲染」视图。
       - **卡片底部**:
         - 一键复制译文（带 Success 动画）。
         - 字符数与 Token 消耗统计。
         - 异常状态卡片（网络超时、429、模型不可用等独立变红重试提示）。

---

## 4. Prompt Engineering & Domain Rules

针对不同风格预设，注入严谨定制的系统提示词，严禁输出任何多余寒暄、前言或总结：

### 4.1 Base System Prompt
```text
You are an expert, highly precise professional translator.
Translate the text from {sourceLang} to {targetLang}.
Strict Rules:
1. Output ONLY the translated text. Do not add any conversational filler, greetings, explanations, notes, or Markdown fences around the entire output unless the original text had them.
2. Preserve all original structure: Markdown tags, headers, bullet points, table formats, and line breaks must remain identical.
3. Preserve untranslatable tokens: Keep code snippets (`code` and ```codeblocks```), URLs, email addresses, file paths, variables (camelCase, snake_case), and placeholders (e.g. {0}, {{var}}, %s) unchanged.
4. Maintain proper casing, punctuation, and typographical standards of the target language.
```

### 4.2 Style Modifiers
- **Technical**:
  `Domain Focus: Software engineering, cloud architecture, and technical documentation. Preserve code syntax, shell commands, CLI flags, configuration keys, and standard developer terminology exactly without translating them.`
- **Standard**:
  `Tone: Natural, faithful, accurate, and objective.`
- **Academic**:
  `Tone: Rigorous, formal, scholarly, and professional vocabulary suited for whitepapers and documentation.`
- **Polished**:
  `Tone: Highly native, idiomatic, and culturally localized. Adapt metaphors and phrasing to sound effortless and natural to native speakers.`

---

## 5. State Management & Error Handling

### 5.1 Data Model
```typescript
export interface ModelTranslationResult {
  modelId: string;
  status: 'idle' | 'streaming' | 'success' | 'error';
  text: string;
  error?: string;
  durationMs: number;
  tokens: number;
  tokensPerSec: number;
  renderMarkdown: boolean;
}

export interface TranslationPreferences {
  sourceLang: string;
  targetLang: string;
  style: 'standard' | 'technical' | 'academic' | 'polished';
  compareMode: boolean;
  selectedModels: string[];
}
```

### 5.2 Concurrency & Abort Control
- 维护 `controllersRef = useRef<Map<string, AbortController>>(new Map())`。
- 在新的翻译发起前，清空并中断旧请求。
- 单个卡片上的取消按钮只触发对应模型的 `controller.abort()`，保留已接收到的部分文本并标记状态为 `'success'`（或已暂停）。
- 卡片级独立错误捕获（`try...catch`），单模型故障绝不阻断其他模型的流式接收与渲染。

### 5.3 Local Storage Persistence
- 用户最后使用的配置持久化至 `localStorage`：
  - `translate_source_lang`
  - `translate_target_lang`
  - `translate_style`
  - `translate_compare_mode`
  - `translate_models`
- 最近 10 条简易翻译历史记录缓存在 `localStorage`，支持一键载入和清空。

---

## 6. Testing & Verification Plan

1. **功能测试 (Functional Testing)**:
   - 源语言与目标语言选择、一键互换功能是否正常。
   - 单模型模式下文本输入与流式实时打字机输出是否流畅。
   - 多模型对比模式下（2 个及以上模型）并行发起请求、各自独立接收流式文本，且无竞态冲突。
   - 风格预设（Technical / Academic / Polished）提示词注入准确性，技术代码与占位符保护验证。
2. **快捷键与交互测试 (UX & Shortcuts)**:
   - 导航栏 `⌘6` 快捷切换。
   - 输入框中 `⌘ + Enter` 触发翻译。
   - 翻译过程中中断按钮（全部中止与单卡片中止）。
   - 纯文本模式与 Markdown 渲染模式一键切换。
3. **兼容性与异常隔离 (Fault Tolerance)**:
   - 模拟单模型 401/429/超时，验证卡片级别错误变红且不波及并行模型。
   - 构建验证：`npm run build:frontend` 和 `npm run build` 确保 TypeScript 零类型错误与前端构建产物打包通过。
