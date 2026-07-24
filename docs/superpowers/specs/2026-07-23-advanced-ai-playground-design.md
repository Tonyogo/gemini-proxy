# Design Spec: Advanced Interactive AI Playground

## Executive Summary
This design upgrades the simplistic single-turn text Playground in `gemini-proxy` into an advanced, production-grade Interactive AI Developer Playground. 

It provides an official developer console experience featuring dynamic model fetching, slide controls for hyperparameters, thinking budget settings, real SSE streaming with typewriter effects, and multi-turn conversational history.

## Layout & Architecture (`frontend/src/components/PlaygroundView.tsx`)

### 1. Left Config & Tuning Panel (1/3 Width)
- **API Key & Dynamic Model Selector**:
  - Automatically fetches writable models list on mount from `/api/admin/models`.
  - Replaces text input with a stylized `<select>` dropdown populated with fetched model names.
- **Model Parameters (Hyperparameters)**:
  - **Temperature Slider**: Continuous range slider (`0.0` to `2.0`, default `1.0`).
  - **Max Tokens Input**: Range picker (`1` to `8192`, default `4096`).
  - **Stream Mode Toggle**: Active switch controlling `/v1/messages` stream payload serialization.
- **Thinking Configuration Panel (for Reasoning Models)**:
  - **Thinking Toggle**: Switches CoT thinking capabilities.
  - **Thinking Budget Input**: Numeric limit input (minimum `1024` tokens, default `2048`).

### 2. Right Chat Canvas & Interactive Area (2/3 Width)
- **Multi-Turn Chat History Area**:
  - Real-time message streaming with typewriter text output.
  - Alternating chat bubbles with distinct colors for user and assistant.
  - **Interactive Assistant Tabs**:
    - `Chat View`: Renders compiled final output text.
    - `Thinking View`: Renders purple-styled reasoning CoT chain blocks.
    - `JSON View`: Renders standard expandable JSON structure of the translated Claude response.
- **Message Input Console (Bottom Footer)**:
  - Wide text input supporting Shift+Enter newlines, Enter key to submit, and one-click "Clear Chat" button.
- **Performance Badge**: Real-time display of token count, status, and request duration.
