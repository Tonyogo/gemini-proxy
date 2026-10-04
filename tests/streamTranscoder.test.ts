// tests/streamTranscoder.test.ts
import { describe, it, expect } from 'vitest';
import { createClaudeSseTransformStream } from '../src/proxy/services/streamTranscoder';

describe('streamTranscoder', () => {
  it('should transform Gemini SSE chunks into Claude SSE events', async () => {
    let capturedEvents: any[] = [];
    const transformStream = createClaudeSseTransformStream('claude-3-5-sonnet', (result) => {
      capturedEvents = result.events;
    });

    const geminiSsePayload = 
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n';

    const reader = transformStream.readable.getReader();
    const writer = transformStream.writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readPromise = (async () => {
      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }
      return output;
    })();

    await writer.write(encoder.encode(geminiSsePayload));
    await writer.close();

    const output = await readPromise;

    expect(output).toContain('event: message_start');
    expect(output).toContain('event: content_block_delta');
    expect(output).toContain('event: message_stop');
    expect(capturedEvents.length).toBeGreaterThan(0);
  });
});
