# 工具参数还原与 `_placeholder` 清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 Gemini 与 Claude 之间的工具调用双向适配，在请求阶段修正无类型字段提示词避免死锁，并在响应阶段递归清理 `_placeholder` 占位字段并将降级/无类型的字符串参数自动还原为 JSON 对象/数组。

**Architecture:** 
1. 在请求阶段 Schema 转换 (`_convertSchemaToGemini`) 中，当字段缺少类型降级为 STRING 且描述提示禁止 JSON 字符串时，修改提示词告知模型传入合法的 JSON-encoded string。
2. 在响应阶段参数处理函数 (`_cleanAndCoerceArguments`) 中，递归删除所有 `_placeholder` 属性（保留空的容器对象 `{}`），并在原 schema 未定义 type 时尝试对 string 参数执行 `JSON.parse` 还原成结构化对象或数组。

**Tech Stack:** TypeScript, Jest, Express

**Spec:** 用户提供的两项明确需求：
1. 递归清理 `_placeholder`：在 Gemini `functionCall.args` 转 Claude `tool_use.input` 时递归删除所有 `_placeholder` 属性，若父级对象删除后变空，保留 `{}`。
2. 修复 `Workflow.args` 等无类型字段：
   - 请求阶段（Claude -> Gemini）：当遇到无 `type` 字段补全为 `"STRING"` 时，若 `description` 包含 `"NOT as a JSON-encoded string"` 等字样，将描述提示修改/追加为 `"(Note: Pass arrays/objects as a valid JSON-encoded string)"`。
   - 响应阶段（Gemini -> Claude）：原始 Schema 中无 `type` 的字段若返回字符串，尝试 `JSON.parse` 还原为对象/数组后传入 Claude 客户端，解析失败则���留原字符串。

## Global Constraints

- 保持已有的 70 项 Jest 测试 100% 通过，不引入回归问题。
- 流式（SSE `translateGoogleToClaudeStream`）与非流式（`convertGoogleToClaudeNonStream`）必须行为一致。
- 遵循零静态配置缓存原则，严格保持 TypeScript 强类型。

## Review Focus

1. 嵌套对象与数组中的 `_placeholder`：当 `_placeholder` 存在于多层嵌套（例如 `answers.q1._placeholder`）或数组元素中的对象时，是否能被彻底清理而保留外层结构。
2. 顶层参数根对象如果是 `{ _placeholder: "..." }`，清理后应返回 `{}`，不破坏 Claude `tool_use.input` 的 Object 格式。
3. `JSON.parse` 的安全性：字符串若为 `"123"` 或 `"true"` 或普通非 JSON 纯文本时，不能误还原为非对象/数组（应严格要求解析出 `object` 或 `Array`，或者如果解析为 primitive 需谨慎对待，避免破坏语义）。
4. 大小写与不规则空格匹配：对 `"NOT as a JSON-encoded string"` 的替换或追加检查需忽略大小写。
5. 原始 Schema 中定义了显式 `type: "string"` 的字段不能被意外执行 `JSON.parse`，仅针对原本未定义 `type` 的字段。

---

### Task 1: 编写清洗与还原的核心辅助函数（含单元测试）

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Produces: 
  - `_cleanAndCoerceArguments(toolName: string, rawArgs: Record<string, any>, tools?: any[]): Record<string, any>` (扩展原有 `_coerceArguments` 或在其内部调用递归清洗与 JSON 还原)

- [x] **Step 1: Write failing tests for `_placeholder` recursive cleanup and JSON parse restoration**

在 `tests/claudeTranslator.test.ts` 中添加测试用例：
1. `recursively removes _placeholder properties while preserving empty parent objects`:
   测试输入 `{ metadata: { _placeholder: "val" }, answers: { q1: { _placeholder: "x" } }, name: "foo" }`，期望输出 `{ metadata: {}, answers: { q1: {} }, name: "foo" }`。
2. `restores JSON-encoded string to object/array for untyped properties in original schema`:
   测试原工具 `Workflow` 中 `args` 字段在 `input_schema` 中没有 `type`（或类型未指定），Gemini 传回 `args: "{\"items\": [1, 2]}"` 或 `args: "[1, 2, 3]"`，经过处理后还原为 `{ items: [1, 2] }` 或 `[1, 2, 3]`。对于纯字符串 `"just a normal text"`，则保留原字符串。对于原 schema 明确声明为 `type: "string"` 的字段（例如 `query: "{\"key\": 1}"`），不进行还原。

- [x] **Step 2: Run test to verify it fails**

Run: `npm test tests/claudeTranslator.test.ts`
Expected: FAIL（新断言失败）

- [x] **Step 3: Implement recursive cleanup and JSON restoration in `claudeTranslator.ts`**

在 `ClaudeTranslator` 中实现：
1. `_removePlaceholder(obj: any): any`:
   递归遍历对象和数组。如果遇到键名为 `_placeholder` 则 `delete`。
2. 在 `_coerceArguments`（或重命名/扩展为统一的参数处理方法）中：
   - 首先执行 `_removePlaceholder(args)`。
   - 对 `properties` 遍历时，若原始 tool schema 中字段未指定 `type`（`!propSchema.type`），且 Gemini ���回的值是 `string`：
     - 尝试 `JSON.parse`，如果解析结果为 `typeof result === 'object' && result !== null`（包括普通对象或数组），则赋值还原为该结果。
   - 保持现有的类型强制转换逻辑（string/number/boolean 兼容）。
3. 确保在 `convertGoogleToClaudeNonStream` 和 `translateGoogleToClaudeStream` 中均使用该处理逻辑。

- [x] **Step 4: Run test to verify it passes**

Run: `npm test tests/claudeTranslator.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): recursively sanitize _placeholder and restore json for untyped tool args"
```

---

### Task 2: 请求阶段 Schema 描述中的语义冲突修正（含单元测试）

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Modifies: `_convertSchemaToGemini(obj: any, isResponseSchema?: boolean, isProperties?: boolean): any`

- [x] **Step 1: Write failing tests for description conflict amendment**

在 `tests/claudeTranslator.test.ts` 中针对 `Claude to Gemini Tools Schema Sanitization` 增加用例：
`updates description for untyped fields with conflicting NOT as a JSON-encoded string notices`:
传入类似 `Workflow.args` 的 schema：
```json
{
  "description": "Optional input value exposed to the script. Pass arrays/objects as actual JSON values, NOT as a JSON-encoded string — a stringified list breaks args.filter/args.map in the script."
}
```
经过 `_convertSchemaToGemini` 转换后：
- `type` 为 `"STRING"`
- `description` 中提示已被修正为包含 `(Note: Pass arrays/objects as a valid JSON-encoded string)`，或者替换掉原冲突表述。

- [x] **Step 2: Run test to verify it fails**

Run: `npm test tests/claudeTranslator.test.ts`
Expected: FAIL（description 未被修改）

- [x] **Step 3: Implement description conflict replacement in `_convertSchemaToGemini`**

在 `_convertSchemaToGemini` 的第 5 步默认缺少 `type` 为 `"STRING"` 时：
如果原对象没有显式 `type`（且无 properties/items），被推导默认补全为 `result.type = "STRING"`：
检查 `result.description`，若匹配 `/NOT as a JSON-encoded string/i`：
将该表述替换或追加修正说明：`result.description = result.description.replace(/NOT as a JSON-encoded string/gi, "as a valid JSON-encoded string") + " (Note: Pass arrays/objects as a valid JSON-encoded string)"`（或清晰替换冲突句子）。

- [x] **Step 4: Run test to verify it passes**

Run: `npm test tests/claudeTranslator.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "fix(translator): amend conflicting JSON-string descriptions for untyped schema fields"
```

---

### Task 3: 全量测试验证与回归检查

**Files:**
- Test: `tests/claudeTranslator.test.ts`
- Test: `npm test`

- [x] **Step 1: Run all project tests**

Run: `npm test`
Expected: All suites PASS

- [x] **Step 2: Build project**

Run: `npm run build`
Expected: TypeScript backend compile & Frontend build exit code 0
