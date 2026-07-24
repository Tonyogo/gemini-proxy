# Design Spec: High-Fidelity Raw Request Body AI Playground

## Executive Summary
This design streamlines and simplifies the API Playground into a high-fidelity raw request debugger. 

It provides developers with a 2-column code-editor style panel: Left Column for entering the raw, unconstrained Claude Messages API Request JSON payload, and Right Column for rendering the real-time streamed or static HTTP response.

## Layout & Components (`frontend/src/components/PlaygroundView.tsx`)

### 1. Left Side: HTTP Request Editor (50% Width)
- **API Key Field**: Saved locally in browser LocalStorage.
- **Raw JSON Textarea**:
  - Fully editable raw JSON body text panel.
  - Automatically pre-populated with a standard, valid Claude `/v1/messages` payload:
    ```json
    {
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 1024,
      "messages": [
        { "role": "user", "content": "Hello!" }
      ],
      "stream": true
    }
    ```
- **"Send API Request" Button**: Triggering POST request to local proxy `/v1/messages`.

### 2. Right Side: HTTP Response Stream Viewer (50% Width)
- **Live Stream Text Output Area**:
  - Large monospace text display with real-time typewriter output.
  - Toggles seamlessly to render either real-time SSE delta text (if `"stream": true` is supplied in the raw request body JSON) or the final consolidated JSON response.
- **Performance Badge**: Status code and duration latency.
