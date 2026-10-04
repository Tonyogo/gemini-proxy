import {
  translateGoogleToClaudeStream,
  createInitialStreamState,
} from './claudeTranslator';

export interface StreamTranscoderResult {
  rawChunks: string[];
  events: any[];
}

export function createClaudeSseTransformStream(
  model: string,
  onComplete?: (result: StreamTranscoderResult) => void
): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  const state = createInitialStreamState();
  const rawChunks: string[] = [];
  const accumulatedEvents: any[] = [];

  const processLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;

    const dataPayload = trimmed.slice(5).trim();
    if (!dataPayload || dataPayload === '[DONE]') return;

    rawChunks.push(dataPayload);

    try {
      const events = translateGoogleToClaudeStream(trimmed, state, model);
      if (events && events.length > 0) {
        for (const ev of events) {
          accumulatedEvents.push(ev);
          const sseString = `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
          controller.enqueue(encoder.encode(sseString));
        }
      }
    } catch {
      // Ignore parse or processing error for corrupted chunk
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep trailing incomplete line in buffer

      for (const line of lines) {
        processLine(line, controller);
      }
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        processLine(buffer, controller);
      }

      // Ensure stream ends cleanly if message_stop wasn't sent yet
      const hasStop = accumulatedEvents.some(e => e.type === 'message_stop');
      if (!hasStop && accumulatedEvents.length > 0) {
        if (state.textBlockStarted) {
          const stopBlock = { type: 'content_block_stop', index: state.contentBlockIndex };
          accumulatedEvents.push(stopBlock);
          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(stopBlock)}\n\n`));
          state.textBlockStarted = false;
        }

        const delta = {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 0 },
        };
        accumulatedEvents.push(delta);
        controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(delta)}\n\n`));

        const stop = { type: 'message_stop' };
        accumulatedEvents.push(stop);
        controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(stop)}\n\n`));
      }

      if (onComplete) {
        onComplete({
          rawChunks,
          events: accumulatedEvents,
        });
      }
    },
  });
}
