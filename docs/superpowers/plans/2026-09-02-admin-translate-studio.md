# Admin Translate Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Gemini Proxy Admin 控制台中实现一个现代化、生产级的 AI 翻译工作台（Translate Studio），支持双栏即时对照、多领域 Prompt 预设、智能语言识别与多模型同屏并行对比流式翻译。

**Architecture:** 前端新增独立的一级路由工作台组件 `TranslateView.tsx`，配合专门的翻译引擎配置 `translateHelper.ts`，基于现有的 `/v1/messages` 代理流式接口发起请求，使用独立的 `AbortController` 实现多模型并行流式打字机渲染、异常隔离与速率统计，并在 `App.tsx` 与 i18n 语言包中完成无缝集成。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, React Markdown (已内置), Vite.

**Spec:** `docs/superpowers/specs/2026-09-02-admin-translate-studio-design.md`

## Global Constraints
- 完全复用 `/v1/messages` 既有代理接口，无需新增后端路由。
- 遵循严谨的 TypeScript 严格模式，前端打包构建 `npm run build:frontend` 必须 0 错误 0 警告。
- 视觉风格与全局系统保持 100% 统一（Linear 暗黑玻璃质感、`#090A0F` 主背景、`#0C0E14` 侧边栏与卡片底色、Indigo 高亮边框与微光效果）。
- 流式请求需支持优雅中断（单个模型中断与全部中断），多模型并发时单模型报错不影响其他模型正常输出。

---

### Task 1: 翻译辅助模块与系统提示词引擎 (Translation Helpers & Prompt Engine)

**Files:**
- Create: `frontend/src/utils/translateHelper.ts`
- Create: `tests/translateHelper.test.ts`

**Interfaces:**
- Consumes: None (纯算法与数据配置模块)
- Produces: 
  - `SUPPORTED_LANGUAGES`: 语种定义数组 `{ code: string; name: string; enName: string }`
  - `STYLE_PRESETS`: 风格定义数组 `{ id: string; name: string; enName: string; icon: string; description: string }`
  - `detectLanguageClient(text: string): string`: 客户端快速 Unicode 语种检测
  - `buildTranslationSystemPrompt(sourceLang: string, targetLang: string, style: string): string`: 组装严格的翻译系统提示词

- [ ] **Step 1: 编写单元测试用例**

```typescript
// tests/translateHelper.test.ts
import {
  detectLanguageClient,
  buildTranslationSystemPrompt,
  SUPPORTED_LANGUAGES,
  STYLE_PRESETS
} from '../frontend/src/utils/translateHelper';

describe('translateHelper', () => {
  test('detectLanguageClient identifies Chinese, English, Japanese, and Russian correctly', () => {
    expect(detectLanguageClient('你好世界')).toBe('zh');
    expect(detectLanguageClient('Hello world, this is a test.')).toBe('en');
    expect(detectLanguageClient('こんにちは、元気ですか？')).toBe('ja');
    expect(detectLanguageClient('Привет мир')).toBe('ru');
    expect(detectLanguageClient('')).toBe('en');
  });

  test('buildTranslationSystemPrompt generates strict instructions without conversational filler', () => {
    const prompt = buildTranslationSystemPrompt('zh', 'en', 'technical');
    expect(prompt).toContain('Translate the text from');
    expect(prompt).toContain('Strict Rules:');
    expect(prompt).toContain('Output ONLY the translated text');
    expect(prompt).toContain('Software engineering');
    expect(prompt).toContain('Preserve code syntax');
  });

  test('SUPPORTED_LANGUAGES and STYLE_PRESETS contain expected keys', () => {
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'auto')).toBe(true);
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'zh')).toBe(true);
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'en')).toBe(true);
    expect(STYLE_PRESETS.some(s => s.id === 'technical')).toBe(true);
    expect(STYLE_PRESETS.some(s => s.id === 'standard')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx jest tests/translateHelper.test.ts`
Expected: FAIL (Cannot find module '../frontend/src/utils/translateHelper')

- [ ] **Step 3: 实现 `frontend/src/utils/translateHelper.ts`**

```typescript
export interface LanguageOption {
  code: string;
  name: string;
  enName: string;
}

export interface StylePresetOption {
  id: 'standard' | 'technical' | 'academic' | 'polished';
  name: string;
  enName: string;
  iconName: string;
  desc: string;
  enDesc: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'auto', name: '自动检测', enName: 'Auto Detect' },
  { code: 'zh', name: '简体中文', enName: 'Simplified Chinese' },
  { code: 'en', name: '英语', enName: 'English' },
  { code: 'ja', name: '日语', enName: 'Japanese' },
  { code: 'ko', name: '韩语', enName: 'Korean' },
  { code: 'fr', name: '法语', enName: 'French' },
  { code: 'de', name: '德语', enName: 'German' },
  { code: 'es', name: '西班牙语', enName: 'Spanish' },
  { code: 'ru', name: '俄语', enName: 'Russian' },
  { code: 'it', name: '意大利语', enName: 'Italian' },
  { code: 'pt', name: '葡萄牙语', enName: 'Portuguese' },
  { code: 'zh-TW', name: '繁体中文', enName: 'Traditional Chinese' }
];

export const STYLE_PRESETS: StylePresetOption[] = [
  {
    id: 'standard',
    name: '通用直译',
    enName: 'Standard',
    iconName: 'Zap',
    desc: '忠实原文，自然通顺，适合日常沟通与通用文章。',
    enDesc: 'Faithful, natural, balanced for general communication.'
  },
  {
    id: 'technical',
    name: '专业技术',
    enName: 'Technical',
    iconName: 'Code',
    desc: '严格保护代码、Markdown格式、API路径与工程术语。',
    enDesc: 'Strictly preserves code, Markdown, API keys and tech terms.'
  },
  {
    id: 'academic',
    name: '学术商务',
    enName: 'Academic',
    iconName: 'BookOpen',
    desc: '严谨书面用词，适合论文、白皮书与正式商务文档。',
    enDesc: 'Scholarly, formal vocabulary for whitepapers and contracts.'
  },
  {
    id: 'polished',
    name: '地道润色',
    enName: 'Polished',
    iconName: 'Sparkles',
    desc: '融入母语读者表达习惯，优美流畅，适合文学与社媒。',
    enDesc: 'Native localization, idiomatic tone for creative writing.'
  }
];

export function detectLanguageClient(text: string): string {
  if (!text || !text.trim()) return 'en';
  const clean = text.trim();

  // CJK Unified Ideographs
  const chineseMatch = clean.match(/[一-龥]/g);
  // Japanese Kana
  const japaneseMatch = clean.match(/[぀-ヿ]/g);
  // Korean Hangul
  const koreanMatch = clean.match(/[가-힯]/g);
  // Cyrillic (Russian, etc.)
  const cyrillicMatch = clean.match(/[Ѐ-ӿ]/g);

  const totalLen = clean.length;
  if (japaneseMatch && japaneseMatch.length > 2) return 'ja';
  if (koreanMatch && koreanMatch.length > 2) return 'ko';
  if (chineseMatch && chineseMatch.length / totalLen > 0.15) return 'zh';
  if (cyrillicMatch && cyrillicMatch.length / totalLen > 0.2) return 'ru';

  return 'en';
}

export function getLanguageName(code: string, isZh: boolean): string {
  const item = SUPPORTED_LANGUAGES.find(l => l.code === code);
  if (!item) return code;
  return isZh ? item.name : item.enName;
}

export function buildTranslationSystemPrompt(
  sourceLang: string,
  targetLang: string,
  style: string
): string {
  const sourceName = sourceLang === 'auto' ? 'the detected source language' : getLanguageName(sourceLang, false);
  const targetName = getLanguageName(targetLang, false);

  let styleDirective = '';
  switch (style) {
    case 'technical':
      styleDirective = 'Domain Focus: Software engineering, cloud architecture, and technical documentation. Strictly preserve code syntax (`code` and ```codeblocks```), shell commands, CLI flags, configuration keys, file paths, and standard developer terminology exactly without translating them.';
      break;
    case 'academic':
      styleDirective = 'Tone: Rigorous, formal, scholarly, and professional vocabulary suited for whitepapers, research, and documentation.';
      break;
    case 'polished':
      styleDirective = 'Tone: Highly native, idiomatic, and culturally localized. Adapt metaphors and phrasing to sound effortless and natural to native speakers.';
      break;
    case 'standard':
    default:
      styleDirective = 'Tone: Natural, faithful, accurate, and objective without embellishment.';
      break;
  }

  return `You are an expert, highly precise professional translator.
Translate the text from ${sourceName} to ${targetName}.
${styleDirective}

Strict Rules:
1. Output ONLY the translated text. Do not add any conversational filler, greetings, explanations, notes, or Markdown fences around the entire output unless the original text had them.
2. Preserve all original structure: Markdown tags, headers, bullet points, table formats, and line breaks must remain identical.
3. Preserve untranslatable tokens: Keep code snippets, URLs, email addresses, file paths, variables (camelCase, snake_case), and placeholders (e.g. {0}, {{var}}, %s) unchanged.
4. Maintain proper casing, punctuation, and typographical standards of the target language.`;
}
```

- [ ] **Step 4: 重新运行测试以确认通过**

Run: `npx jest tests/translateHelper.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/utils/translateHelper.ts tests/translateHelper.test.ts
git commit -m "feat(translate): add translate helper utilities and prompt generator"
```

---

### Task 2: 国际化词条扩充 (i18n Localization for Translate Studio)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `Translations` interface in `frontend/src/i18n/locales/en.ts`
- Produces: 
  - `nav.translate`
  - `translate.*`: 所有工作台标题、占位符、操作按钮、卡片状态、错误提示等文案

- [ ] **Step 1: 在 `frontend/src/i18n/locales/en.ts` 中新增词条并更新类型定义**

```typescript
// 在 en.ts 中:
// nav 对象中增加:
    translate: "Translate Studio",

// 在 en.ts 最外层增加 translate 对象:
  translate: {
    title: "AI Translate Studio",
    subtitle: "High-precision multi-model translation workbench with style presets and split-screen comparison.",
    sourceLanguage: "Source Language",
    targetLanguage: "Target Language",
    swapLanguage: "Swap Languages",
    autoDetect: "Auto Detect",
    detectedAs: "Detected as",
    stylePreset: "Style Preset",
    translateBtn: "Translate",
    translating: "Translating...",
    stopAll: "Stop All",
    stop: "Stop",
    clear: "Clear",
    paste: "Paste",
    copy: "Copy",
    copied: "Copied!",
    copySource: "Copy Source",
    sourcePlaceholder: "Enter or paste text to translate... (Press ⌘+Enter to translate)",
    targetPlaceholder: "Translation will appear here in real-time...",
    characters: "Characters",
    words: "Words",
    comparisonMode: "Comparison Mode",
    singleModel: "Single Model",
    compareModels: "Compare Models",
    selectModelsPlaceholder: "Select models to compare...",
    renderRaw: "Raw Text",
    renderMarkdown: "Markdown",
    speedTokens: "tok/s",
    duration: "Duration",
    tokens: "Tokens",
    truncatedWarning: "Output reached max token limit and may be truncated.",
    requestFailed: "Translation failed",
    retry: "Retry",
    noModelsSelected: "Please select at least one model to translate."
  },
```

- [ ] **Step 2: 在 `frontend/src/i18n/locales/zh.ts` 中对应增加中文翻译**

```typescript
// 在 zh.ts 中:
// nav 对象中增加:
    translate: "翻译工作台",

// 在 zh.ts 最外层增加 translate 对象:
  translate: {
    title: "AI 翻译工作台",
    subtitle: "专业级多模型双向翻译工具，支持风格预设保护、流式打字机与同屏对比。",
    sourceLanguage: "源语言",
    targetLanguage: "目标语言",
    swapLanguage: "交换语言",
    autoDetect: "自动检测",
    detectedAs: "已识别为",
    stylePreset: "翻译风格",
    translateBtn: "开始翻译",
    translating: "正在翻译...",
    stopAll: "全部停止",
    stop: "停止",
    clear: "清空",
    paste: "粘贴",
    copy: "复制译文",
    copied: "已复制！",
    copySource: "复制原文",
    sourcePlaceholder: "输入或粘贴需要翻译的文本...（支持 ⌘+Enter 快捷翻译）",
    targetPlaceholder: "实时流式翻译结果将显示在此处...",
    characters: "字符数",
    words: "词数",
    comparisonMode: "对比模式",
    singleModel: "单模型",
    compareModels: "多模型对比",
    selectModelsPlaceholder: "选择要对比的模型...",
    renderRaw: "纯文本",
    renderMarkdown: "Markdown",
    speedTokens: "标记/秒",
    duration: "耗时",
    tokens: "用量",
    truncatedWarning: "译文已达单次最大 Token 限制，可能存在截断。",
    requestFailed: "翻译请求失败",
    retry: "重试",
    noModelsSelected: "请至少选择一个模型进行翻译。"
  },
```

- [ ] **Step 3: 运行前端构建检查类型一致性**

Run: `npm run build:frontend`
Expected: SUCCESS

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add comprehensive localization for Translate Studio"
```

---

### Task 3: 构建核心工作台组件 `TranslateView.tsx`

**Files:**
- Create: `frontend/src/components/TranslateView.tsx`

**Interfaces:**
- Consumes:
  - `adminKey: string` (从 App 传入)
  - `translateHelper.ts` (预设与提示词引擎)
  - `useTranslation()` (i18n)
- Produces: 
  - 导出 `default function TranslateView({ adminKey }: { adminKey: string })`

- [ ] **Step 1: 创建 `frontend/src/components/TranslateView.tsx`**

实现包含：
1. 顶部控制栏：源语言、互换按键（⇄）、目标语言、翻译风格选择、单模型/对比模式切换及模型选择器。
2. 左栏：输入文本区、字符/单词计数器、自动识别语种指示标、清空/粘贴/复制操作工具条。
3. 右栏：单模型卡片或多模型并排卡片网格，每个卡片包含：
   - 标题、流式呼吸光效、耗时和速率（tokens/s）指标
   - 纯文本 / Markdown 渲染切换按钮（使用 ReactMarkdown）
   - 单卡片停止按钮、一键复制按钮、错误状态卡片与重试
4. 全局快捷键监听：`⌘ + Enter`（Mac）或 `Ctrl + Enter`（Windows/Linux）快速触发。
5. 独立的 `AbortController` 并发池管理，流式 SSE 事件解析（`content_block_delta`，`message_delta`）。
6. 用户偏好持久化至 `localStorage`。

- [ ] **Step 2: 验证组件无语法或类型报错**

Run: `npm run build:frontend`
Expected: SUCCESS

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/components/TranslateView.tsx
git commit -m "feat(translate): implement full TranslateView component with multi-model comparison"
```

---

### Task 4: 集成工作台到主应用 `App.tsx` 与导航系统

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `TranslateView` component from `./components/TranslateView`
- Produces: 
  - `TabType`: 新增 `'translate'`
  - `NAV_ITEMS`: 注册第 6 项导航 `{ id: 'translate', icon: Languages, shortcut: '⌘6' }`
  - 键盘监听器支持 `⌘6` 快速激活

- [ ] **Step 1: 在 `App.tsx` 中导入 `Languages` 图标与 `TranslateView` 组件**

```typescript
import {
  // ... 其他已存在图标
  Languages
} from 'lucide-react';
import TranslateView from './components/TranslateView';

type TabType = 'dashboard' | 'accounts' | 'logs' | 'terminal' | 'playground' | 'translate';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'accounts', icon: Users, shortcut: '⌘2' },
  { id: 'logs', icon: FileText, shortcut: '⌘3' },
  { id: 'terminal', icon: Terminal, shortcut: '⌘4' },
  { id: 'playground', icon: Play, shortcut: '⌘5' },
  { id: 'translate', icon: Languages, shortcut: '⌘6' },
];

const VALID_TABS: TabType[] = ['dashboard', 'accounts', 'logs', 'terminal', 'playground', 'translate'];
```

- [ ] **Step 2: 在 `App.tsx` 的 `<main>` 内容区挂载 `TranslateView`**

```tsx
{activeTab === 'translate' && (
  <TranslateView
    key={refreshTrigger}
    adminKey={adminKey}
  />
)}
```

- [ ] **Step 3: 运行完整前端构建**

Run: `npm run build:frontend`
Expected: SUCCESS with zero warnings/errors.

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): register Translate Studio tab and navigation shortcut"
```

---

### Task 5: 端到端与单元测试验证 (Verification & Build Checks)

**Files:**
- Test: `tests/translateHelper.test.ts`
- Test: 所有现有 Jest 测试套件

- [ ] **Step 1: 运行所有单元测试**

Run: `npm test`
Expected: PASS (所有测试包括代理翻译器与新增的 translateHelper 全部通过)

- [ ] **Step 2: 运行全量构建打包**

Run: `npm run build`
Expected: Frontend 和 Backend 编译全部成功

- [ ] **Step 3: 提交并准备交付**

```bash
git status
```
Expected: Clean working tree

---
