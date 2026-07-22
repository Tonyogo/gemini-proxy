# Design Spec: Multimodal `tool_result` Support for Gemini Function Responses

**Date:** 2026-07-22  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

Currently, `ClaudeTranslator` converts Claude's `tool_result` content blocks by placing whatever `block.content` contains directly into Gemini's `functionResponse.response.result`. When a tool returns an image (or a mix of text and image content blocks), placing Claude's raw `{ type: "image", source: { media_type: "...", data: "..." } }` structure into `response.result` causes Gemini to ignore or fail to parse the image data.

In Google Gemini's official API specification, multimodal content returned by a function call must be attached inside a nested `parts` array **under `functionResponse`**:
```json
{
  "functionResponse": {
    "name": "get_image",
    "id": "call_123",
    "response": {
      "result": "Text description or execution summary"
    },
    "parts": [
      {
        "inlineData": {
          "mimeType": "image/png",
          "data": "<BASE64_DATA>"
        }
      }
    ]
  }
}
```

The goal is to update `ClaudeTranslator` to automatically inspect `tool_result` content, extract text and image blocks, and build Gemini-compliant `functionResponse` structures with nested `parts` containing `inlineData`.

## 2. Architecture & Translation Rules

```
Claude tool_result block
         │
         ▼
Inspect content (String vs. Array)
         │
         ├──► String ──► functionResponse.response.result = content
         │
         └──► Array ──► Separate Text & Image Blocks
                          │
                          ├── Text blocks ──► Join into functionResponse.response.result
                          │
                          └── Image blocks ──► Convert to { inlineData: { mimeType, data } }
                                                and place inside functionResponse.parts
```

### 2.1 Content Parsing Rules
When processing a `tool_result` block in `translateClaudeToGoogle`:

1. **Simple String Content:**
   ```typescript
   functionResponse: {
     name: matchedName,
     response: { result: block.content },
     id: geminiResponseId
   }
   ```

2. **Array Content (Multimodal Result):**
   - Iterate over items in `block.content`.
   - **Text Blocks (`type === 'text'`):** Collect text strings into `textParts`.
   - **Image Blocks (`type === 'image'`):** Convert `block.source.media_type` and `block.source.data` to an `inlineData` part:
     ```typescript
     {
       inlineData: {
         mimeType: item.source.media_type,
         data: item.source.data
       }
     }
     ```
   - Construct `functionResponse`:
     ```typescript
     const functionResp: any = {
       name: matchedName,
       response: { result: textParts.join('\n') || 'Tool executed successfully' },
       id: geminiResponseId
     };
     if (imageParts.length > 0) {
       functionResp.parts = imageParts;
     }
     ```

## 3. Testing Strategy
* Add unit tests in `tests/claudeTranslator.test.ts` verifying that:
  1. Plain string `tool_result` content maps cleanly as before.
  2. Array `tool_result` content containing text and base64 image blocks extracts text to `response.result` and nests image `inlineData` objects under `functionResponse.parts`.
