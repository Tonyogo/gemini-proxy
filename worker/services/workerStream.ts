const BYPASS_SIGNATURE = 'context_engineering_is_the_way_to_go';

export function createGeminiToClaudeTransformStream(
  modelName: string,
  tools: any[] = []
): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const streamState: any = {
    tools,
    messageId: `msg_stream_${Math.random().toString(36).substring(2, 11)}`,
    contentBlockIndex: 0,
    messageStartSent: false,
    thinkingBlockStarted: false,
    thinkingBlockFinished: false,
    textBlockStarted: false,
    textBlockFinished: false,
    toolCallBlockStarted: false,
    toolCallBlockFinished: false,
    currentToolIndex: -1,
    accumulatedToolCalls: [],
    accumulatedText: '',
    accumulatedThinking: '',
    currentThoughtSignature: null,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };

  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let jsonStr = trimmed;
        if (jsonStr.startsWith('data:')) {
          jsonStr = jsonStr.substring(5).trim();
        }
        if (jsonStr === '[DONE]') continue;

        let googleResponse: any;
        try {
          googleResponse = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const events = translateGoogleStreamChunk(googleResponse, modelName, streamState);
        for (const ev of events) {
          controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        }
      }
    },

    flush(controller) {
      if (buffer.trim()) {
        let jsonStr = buffer.trim();
        if (jsonStr.startsWith('data:')) {
          jsonStr = jsonStr.substring(5).trim();
        }
        if (jsonStr !== '[DONE]') {
          try {
            const googleResponse = JSON.parse(jsonStr);
            const events = translateGoogleStreamChunk(googleResponse, modelName, streamState);
            for (const ev of events) {
              controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
            }
          } catch {}
        }
      }

      // Close any open content blocks
      if (streamState.thinkingBlockStarted && !streamState.thinkingBlockFinished) {
        controller.enqueue(
          encoder.encode(
            `event: content_block_stop\ndata: ${JSON.stringify({
              type: 'content_block_stop',
              index: streamState.contentBlockIndex++
            })}\n\n`
          )
        );
        streamState.thinkingBlockFinished = true;
      }

      if (streamState.textBlockStarted && !streamState.textBlockFinished) {
        controller.enqueue(
          encoder.encode(
            `event: content_block_stop\ndata: ${JSON.stringify({
              type: 'content_block_stop',
              index: streamState.contentBlockIndex++
            })}\n\n`
          )
        );
        streamState.textBlockFinished = true;
      }

      if (streamState.toolCallBlockStarted && !streamState.toolCallBlockFinished) {
        controller.enqueue(
          encoder.encode(
            `event: content_block_stop\ndata: ${JSON.stringify({
              type: 'content_block_stop',
              index: streamState.contentBlockIndex++
            })}\n\n`
          )
        );
        streamState.toolCallBlockFinished = true;
      }

      // Final message delta and stop
      const stopReason = streamState.accumulatedToolCalls.length > 0 ? 'tool_use' : 'end_turn';
      controller.enqueue(
        encoder.encode(
          `event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta',
            delta: {
              stop_reason: stopReason,
              stop_sequence: null
            },
            usage: {
              output_tokens: streamState.totalOutputTokens
            }
          })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(
          `event: message_stop\ndata: ${JSON.stringify({
            type: 'message_stop'
          })}\n\n`
        )
      );
    }
  });
}

export function translateGoogleStreamChunk(
  googleResponse: any,
  modelName: string,
  streamState: any
): any[] {
  const events: any[] = [];
  const candidate = googleResponse.candidates?.[0];
  const usage = googleResponse.usageMetadata;

  if (usage) {
    if (usage.promptTokenCount) streamState.totalInputTokens = usage.promptTokenCount;
    const thoughts = usage.thoughtsTokenCount || 0;
    const candidates = usage.candidatesTokenCount || 0;
    if (candidates || thoughts) {
      streamState.totalOutputTokens = thoughts + candidates;
    }
  }

  // 1. Send message_start once
  if (!streamState.messageStartSent) {
    events.push({
      type: 'message_start',
      message: {
        id: streamState.messageId,
        type: 'message',
        role: 'assistant',
        model: modelName,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: streamState.totalInputTokens,
          output_tokens: 0
        }
      }
    });
    streamState.messageStartSent = true;
  }

  if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
    for (const part of candidate.content.parts) {
      // A. Thinking part
      if (part.thought === true && part.text) {
        if (!streamState.thinkingBlockStarted) {
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'thinking',
              thinking: '',
              signature: part.thoughtSignature || BYPASS_SIGNATURE
            }
          });
          streamState.thinkingBlockStarted = true;
        }

        events.push({
          type: 'content_block_delta',
          index: streamState.contentBlockIndex,
          delta: {
            type: 'thinking_delta',
            thinking: part.text
          }
        });
        streamState.accumulatedThinking += part.text;
      }

      // B. Standard text part
      else if (part.text && !part.thought) {
        if (streamState.thinkingBlockStarted && !streamState.thinkingBlockFinished) {
          events.push({
            type: 'content_block_stop',
            index: streamState.contentBlockIndex++
          });
          streamState.thinkingBlockFinished = true;
        }

        if (!streamState.textBlockStarted) {
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'text',
              text: ''
            }
          });
          streamState.textBlockStarted = true;
        }

        events.push({
          type: 'content_block_delta',
          index: streamState.contentBlockIndex,
          delta: {
            type: 'text_delta',
            text: part.text
          }
        });
        streamState.accumulatedText += part.text;
      }

      // C. Function call part (Tool use)
      else if (part.functionCall) {
        if (streamState.thinkingBlockStarted && !streamState.thinkingBlockFinished) {
          events.push({
            type: 'content_block_stop',
            index: streamState.contentBlockIndex++
          });
          streamState.thinkingBlockFinished = true;
        }

        if (streamState.textBlockStarted && !streamState.textBlockFinished) {
          events.push({
            type: 'content_block_stop',
            index: streamState.contentBlockIndex++
          });
          streamState.textBlockFinished = true;
        }

        const call = part.functionCall;
        const callId = call.id
          ? (call.id.startsWith('toolu_') ? call.id : `toolu_g_${call.id}`)
          : `toolu_g_${Math.random().toString(36).substring(2, 11)}`;

        events.push({
          type: 'content_block_start',
          index: streamState.contentBlockIndex,
          content_block: {
            type: 'tool_use',
            id: callId,
            name: call.name,
            input: {}
          }
        });

        const jsonArgs = JSON.stringify(call.args || {});
        events.push({
          type: 'content_block_delta',
          index: streamState.contentBlockIndex,
          delta: {
            type: 'input_json_delta',
            partial_json: jsonArgs
          }
        });

        events.push({
          type: 'content_block_stop',
          index: streamState.contentBlockIndex++
        });

        streamState.accumulatedToolCalls.push({
          id: callId,
          name: call.name,
          args: call.args
        });
      }
    }
  }

  return events;
}
