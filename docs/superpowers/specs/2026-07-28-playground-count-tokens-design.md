# Design Spec: Playground API Endpoint Selector & count_tokens Support

**Date**: 2026-07-28  
**Topic**: Add `/v1/messages/count_tokens` and Custom Endpoint support to Playground UI  
**Status**: Approved

## Problem Statement
Currently, `frontend/src/components/PlaygroundView.tsx` hardcodes requests exclusively to `POST /v1/messages`. Users cannot test `/v1/messages/count_tokens` or custom API proxy routes from the web console playground.

## Solution Design

### 1. Endpoint Selector & State Management
In `PlaygroundView.tsx`, introduce state variables:
- `endpointOption`: `'messages' | 'count_tokens' | 'custom'` (default `'messages'`)
- `customMethod`: `'POST' | 'GET' | 'PUT' | 'DELETE'` (default `'POST'`)
- `customPath`: `string` (default `'/v1/models'`)

### 2. Payload Presets
Maintain default JSON payloads for quick switching:
- `messages`: Includes `model`, `max_tokens`, `messages`, and `stream: true`.
- `count_tokens`: Includes `model` and `messages` (omits stream / max_tokens).

Switching `endpointOption` between `messages` and `count_tokens` automatically updates the Monaco Editor request body value if the user hasn't heavily customized it (or upon user selection).

### 3. Top Control Bar UI
Add an endpoint selector dropdown to the top bar:
- Select dropdown with options:
  - `POST /v1/messages`
  - `POST /v1/messages/count_tokens`
  - `Custom Endpoint...`
- When `Custom Endpoint...` is selected, render a Method select (`POST`, `GET`, etc.) and a Path text input (`/v1/...`).

### 4. Dynamic Request Dispatch
In `handleSend`:
- Determine target URL and HTTP method dynamically based on selected option.
- Send API key in `x-api-key` header.
- For non-stream responses (`count_tokens` or `GET` endpoints), render the resulting JSON response in `JsonTreeView` and `rawResponse`.

## Impacted Files
- `frontend/src/components/PlaygroundView.tsx`
