# Design Spec: `SYSTEM_ROLE_TO_INSTRUCTION` Switch & System Message Deduplication

**Date:** 2026-07-23  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

Currently, `ClaudeTranslator` converts incoming `role: 'system'` messages into `user` role turns in Gemini's `contents` payload, wrapped inside `<runtime-context>` tags. In certain multi-turn workflows (such as Claude Code sessions), this can cause Gemini to misinterpret system guidance as user responses. Additionally, repeated system context updates across multi-turn chats accumulate duplicate instruction blocks.

The objectives are:
1. Introduce a configurable switch `SYSTEM_ROLE_TO_INSTRUCTION` (environment variable, default `false`).
2. When enabled (`true`), map `role: 'system'` messages into Gemini's `systemInstruction` instead of inserting them as `user` turns in `contents`.
3. Include an explanatory note in `systemInstruction` clarifying the purpose of `<runtime-context>` tags.
4. Perform deduplication on `role: 'system'` messages based on initial prefix/header content, retaining only the latest version of messages sharing the same starting prefix.

## 2. Architecture & Data Flow

```
                 claudeBody.messages (contains role: 'system')
                                    │
                                    ▼
                     Check SYSTEM_ROLE_TO_INSTRUCTION
                                    │
           ┌────────────────────────┴────────────────────────┐
           │ (false - Default)                               │ (true)
           ▼                                                 ▼
Wrap in <runtime-context>                     Collect all role: 'system' msgs
   Insert as user role in contents                          │
                                                            ▼
                                             Deduplicate by Prefix/Header
                                            (Keep latest message per prefix)
                                                            │
                                                            ▼
                                             Wrap in <runtime-context>
                                           + Add explanation note
                                                            │
                                                            ▼
                                             Append to systemInstruction
                                            (Exempt from contents array)
```

## 3. Detailed Specifications

### 3.1 Configuration Setting
In `config/default.ts`:
```typescript
systemRoleToInstruction: process.env.SYSTEM_ROLE_TO_INSTRUCTION === 'true'
```

### 3.2 Prefix Extraction & Deduplication
In `ClaudeTranslator`:
* Helper `_getSystemMessagePrefixKey(content: any): string`: extracts the first non-empty line or first 50 characters of the system message.
* Helper `deduplicateSystemMessages(messages: ClaudeMessage[]): ClaudeMessage[]`: iterates over all `role: 'system'` messages and keeps only the latest entry per prefix key.

### 3.3 Translation Execution (`translateClaudeToGoogle`)
* **When `systemRoleToInstruction === false` (Default)**:
  - Process `role: 'system'` inline inside `messages` loop, converting to `user` role turn in `contents` wrapped with `<runtime-context>`.
* **When `systemRoleToInstruction === true`**:
  - Filter and deduplicate all `role: 'system'` messages using `deduplicateSystemMessages`.
  - Skip adding `role: 'system'` messages as `user` turns in `contents`.
  - Format deduplicated system messages with `<runtime-context>` tags and append them to `systemInstruction.parts`.
  - Prepend/append an explanatory usage note in `systemInstruction`:
    `"Note: Content enclosed within <runtime-context> tags contains dynamic system instructions, runtime environment state, or client tool guidance."`

## 4. Testing Strategy

Add tests in `tests/claudeTranslator.test.ts`:
1. Default behavior (`SYSTEM_ROLE_TO_INSTRUCTION = false`): verify `role: 'system'` maps to `user` turn in `contents`.
2. Enabled behavior (`SYSTEM_ROLE_TO_INSTRUCTION = true`):
   - Verify `role: 'system'` messages are omitted from `contents` and appended to `systemInstruction`.
   - Verify deduplication: given multiple `role: 'system'` messages starting with `# claudeMd\nVersion 1` and `# claudeMd\nVersion 2`, only `Version 2` is appended to `systemInstruction`.
   - Verify the explanatory notice is attached in `systemInstruction`.
