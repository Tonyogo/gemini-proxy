# Design Spec: Multimodal `tool_result` & Document Media Support

**Date:** 2026-07-23  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

Currently, `ClaudeTranslator` converts Claude's `tool_result` content blocks and message content blocks by extracting text and images (`type === 'image'`). However, Claude API supports sending document blocks (such as PDFs, text files, CSVs with `type === 'document'`) both directly in user message prompts and inside `tool_result` content arrays.

Google Gemini supports multimodal inputs (images, audio, video, PDFs/documents) via `inlineData: { mimeType, data }` in content parts and in `functionResponse.parts`.

The goal is to implement a unified media extractor in `ClaudeTranslator` to support images, PDFs, documents, and arbitrary media payloads across both message blocks and `tool_result` execution results.

## 2. Architecture & Data Flow

```
Claude Request Payload (Message / tool_result)
               │
               ▼
   Inspect Block Type & Structure
               │
      ┌────────┴────────┐
      │                 │
   Text Block       Media Source Block
(type: 'text')   (type: 'image' | 'document' | with source.data)
      │                 │
      ▼                 ▼
Extract Text    extractMediaPart(item)
  String               │
                       ▼
         Gemini inlineData Object
      { mimeType: media_type, data: base64 }
                       │
             ┌─────────┴─────────┐
             │                   │
      Message Level       tool_result Level
   (parts.inlineData)   (functionResponse.parts)
```

## 3. Detailed Specifications

### 3.1 Media Extractor Helper Method
A private helper `_extractMediaPart(item: any): GeminiPart | null` will be introduced in `ClaudeTranslator`:

```typescript
private _extractMediaPart(item: any): GeminiPart | null {
  if (!item || typeof item !== 'object') return null;

  if ((item.type === 'image' || item.type === 'document') && item.source) {
    const mimeType = item.source.media_type || 'application/octet-stream';
    const data = item.source.data;
    if (data) {
      return { inlineData: { mimeType, data } };
    }
  }

  if (item.source && item.source.data && item.source.media_type) {
    return { inlineData: { mimeType: item.source.media_type, data: item.source.data } };
  }

  return null;
}
```

### 3.2 User / Assistant Message Mapping
In `translateClaudeToGoogle`:
* For `block.type === 'image'` or `block.type === 'document'` in `msg.content`:
  - Call `this._extractMediaPart(block)`.
  - Push the resulting `inlineData` part into `parts`.

### 3.3 `tool_result` Mapping
In `block.type === 'tool_result'`:
* When `Array.isArray(block.content)`:
  - Text items collect into `textCollector`.
  - Media items (images, documents, or objects with `source.data`) use `this._extractMediaPart(item)` to collect into `mediaParts`.
  - If `mediaParts.length > 0`, attach them as `functionResponseObj.parts = mediaParts`.

## 4. Testing Strategy

Add tests in `tests/claudeTranslator.test.ts`:
1. Verify user message containing `type: 'document'` (PDF base64) translates to Gemini `inlineData` with `mimeType: 'application/pdf'`.
2. Verify `tool_result` containing array with `type: 'document'` translates to `functionResponse.parts` with `inlineData`.
3. Verify `tool_result` containing mixed text, image, and PDF document blocks translates text into `response.result` and all media into `functionResponse.parts`.
