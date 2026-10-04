// tests/claudeTranslator.test.ts
import { describe, it, expect } from 'vitest';
import {
  translateClaudeToGoogle,
  translateGoogleToClaudeResponse,
  translateGoogleToClaudeStream,
  createInitialStreamState,
} from '../src/proxy/services/claudeTranslator';

describe('claudeTranslator', () => {
  it('should translate standard user message to gemini contents', () => {
    const claudeReq = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello world' }],
      max_tokens: 100,
    };
    const geminiReq = translateClaudeToGoogle(claudeReq as any);
    expect(geminiReq.googleRequest.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello world' }] },
    ]);
    expect(geminiReq.googleRequest.generationConfig?.maxOutputTokens).toBe(100);
  });

  it('should translate gemini response back to claude message format', () => {
    const geminiRes = {
      candidates: [
        {
          content: { parts: [{ text: 'Hi there!' }], role: 'model' },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const claudeRes = translateGoogleToClaudeResponse(geminiRes, 'claude-3-5-sonnet-20241022');
    expect(claudeRes.content[0]).toEqual({ type: 'text', text: 'Hi there!' });
    expect(claudeRes.stop_reason).toBe('end_turn');
    expect(claudeRes.usage.output_tokens).toBe(5);
  });

  it('should parse streaming gemini candidate into claude stream events', () => {
    const state = createInitialStreamState();
    const chunk = {
      candidates: [
        {
          content: { parts: [{ text: 'Streaming token' }], role: 'model' },
        },
      ],
    };
    const events = translateGoogleToClaudeStream(chunk, state);
    expect(events.length).toBeGreaterThan(0);
    const deltaEvent = events.find(e => e.type === 'content_block_delta');
    expect(deltaEvent).toBeDefined();
    expect(deltaEvent.delta.text).toBe('Streaming token');
  });
});
