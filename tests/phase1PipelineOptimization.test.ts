import translator from '../src/proxy/services/claudeTranslator';
import config from '../config/default';

describe('Phase 1 Pipeline Optimizations', () => {
  const originalMappings = config.modelMappings;
  const originalSystemRole = config.systemRoleToInstruction;

  beforeEach(() => {
    config.systemRoleToInstruction = false;
  });

  afterEach(() => {
    config.modelMappings = originalMappings;
    config.systemRoleToInstruction = originalSystemRole;
  });

  describe('Issue 1: getModelMappingInfo round-robin counter drift', () => {
    it('does not advance roundRobinCounters when advanceCounter is false or omitted in getModelMappingInfo', () => {
      config.modelMappings = {
        'pool-model': ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro']
      };

      const freshTranslator = new (translator.constructor as any)();

      // Read-only calls (advanceCounter: false or default)
      const res1 = freshTranslator.getModelMappingInfo('pool-model');
      expect(res1.targetModel).toBe('gemini-2.5-pro');

      const res2 = freshTranslator.getModelMappingInfo('pool-model', false);
      expect(res2.targetModel).toBe('gemini-2.5-pro');

      const res3 = freshTranslator.getModelMappingInfo('pool-model', false);
      expect(res3.targetModel).toBe('gemini-2.5-pro');
    });

    it('does not advance roundRobinCounters when getCleanModelName is called', () => {
      config.modelMappings = {
        'pool-model': ['gemini-2.5-pro', 'gemini-2.5-flash']
      };

      const freshTranslator = new (translator.constructor as any)();

      expect(freshTranslator.getCleanModelName('pool-model')).toBe('gemini-2.5-pro');
      expect(freshTranslator.getCleanModelName('pool-model')).toBe('gemini-2.5-pro');
      expect(freshTranslator.getCleanModelName('pool-model')).toBe('gemini-2.5-pro');
    });

    it('advances counter when advanceCounter is true', () => {
      config.modelMappings = {
        'pool-model': ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro']
      };

      const freshTranslator = new (translator.constructor as any)();

      const call1 = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(call1.targetModel).toBe('gemini-2.5-pro');

      const call2 = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(call2.targetModel).toBe('gemini-2.5-flash');

      const call3 = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(call3.targetModel).toBe('gemini-1.5-pro');

      const call4 = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(call4.targetModel).toBe('gemini-2.5-pro');
    });

    it('reuses pre-resolved mappingInfo without advancing counter in translateClaudeToGoogle and preprocessClaudeDirectRequest', () => {
      config.modelMappings = {
        'pool-model': ['gemini-2.5-pro', 'gemini-2.5-flash']
      };

      const freshTranslator = new (translator.constructor as any)();

      // Initial routing advances once
      const mappingInfo = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(mappingInfo.targetModel).toBe('gemini-2.5-pro');

      // Subsequent translation passes pre-resolved mappingInfo and does not advance
      const translated = freshTranslator.translateClaudeToGoogle(
        { model: 'pool-model', messages: [{ role: 'user', content: 'Hi' }] },
        mappingInfo
      );
      expect(translated.cleanModelName).toBe('gemini-2.5-pro');

      // Direct request preprocess passes pre-resolved mappingInfo and does not advance
      const direct = freshTranslator.preprocessClaudeDirectRequest(
        { model: 'pool-model', messages: [{ role: 'user', content: 'Hi' }] },
        mappingInfo
      );
      expect(direct.cleanModelName).toBe('gemini-2.5-pro');

      // Next request advances to flash
      const nextMappingInfo = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(nextMappingInfo.targetModel).toBe('gemini-2.5-flash');
    });

    it('does not advance roundRobinCounters when object mapping with targets array is queried with advanceCounter=false', () => {
      config.modelMappings = {
        'pool-obj': {
          targets: ['gemini-2.5-pro', 'gemini-2.5-flash'],
          strategy: 'round-robin'
        }
      };

      const freshTranslator = new (translator.constructor as any)();

      // Read-only calls
      expect(freshTranslator.getModelMappingInfo('pool-obj', false).targetModel).toBe('gemini-2.5-pro');
      expect(freshTranslator.getModelMappingInfo('pool-obj', false).targetModel).toBe('gemini-2.5-pro');
      expect(freshTranslator.getCleanModelName('pool-obj')).toBe('gemini-2.5-pro');

      // Advancing call
      expect(freshTranslator.getModelMappingInfo('pool-obj', true).targetModel).toBe('gemini-2.5-pro');
      expect(freshTranslator.getModelMappingInfo('pool-obj', true).targetModel).toBe('gemini-2.5-flash');
      expect(freshTranslator.getModelMappingInfo('pool-obj', false).targetModel).toBe('gemini-2.5-pro');
    });

    it('does not advance roundRobinCounters during token count translation with pre-resolved mapping', () => {
      config.modelMappings = {
        'pool-model': ['gemini-2.5-pro', 'gemini-2.5-flash']
      };

      const freshTranslator = new (translator.constructor as any)();

      // Clean model name resolution (read-only)
      const effectiveCountModel = freshTranslator.getCleanModelName('pool-model');
      expect(effectiveCountModel).toBe('gemini-2.5-pro');

      // Translation for countTokens passing preResolvedMapping
      const countRes = freshTranslator.translateClaudeToGoogle(
        { model: 'pool-model', messages: [{ role: 'user', content: 'Count my tokens' }] },
        { targetModel: effectiveCountModel }
      );
      expect(countRes.cleanModelName).toBe('gemini-2.5-pro');

      // Verify counter was NOT advanced
      const nextCall = freshTranslator.getModelMappingInfo('pool-model', true);
      expect(nextCall.targetModel).toBe('gemini-2.5-pro');
    });
  });

  describe('Issue 2: SSE stream thinking block close & stop_reason for tool calls', () => {
    it('closes thinking block when part.functionCall arrives without prior text, and sets stop_reason to tool_use', () => {
      const streamState: any = { tools: [] };

      // Chunk 1: Thinking block starts and deltas
      const chunk1 = JSON.stringify({
        candidates: [{
          content: {
            parts: [{ thought: true, text: 'Thinking about the problem...' }]
          }
        }]
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(events1).toBeDefined();
      expect(streamState.thinkingBlockStarted).toBe(true);
      expect(streamState.contentBlockIndex).toBe(0);

      const startEvent = events1!.find(e => e.type === 'content_block_start');
      expect(startEvent.content_block.type).toBe('thinking');

      // Chunk 2: functionCall arrives directly without text
      const chunk2 = JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                id: 'call_123',
                name: 'get_weather',
                args: { location: 'Beijing' }
              }
            }]
          }
        }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      expect(events2).toBeDefined();

      // First event must be content_block_stop for thinking block (index 0)
      expect(events2![0]).toEqual({
        type: 'content_block_stop',
        index: 0
      });
      expect(streamState.thinkingBlockStarted).toBe(false);

      // Followed by tool_use start at index 1
      expect(events2![1]).toEqual({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_g_call_123',
          name: 'get_weather',
          input: {}
        }
      });
      // Tool delta
      expect(events2![2].type).toBe('content_block_delta');
      // Tool stop at index 1
      expect(events2![3]).toEqual({
        type: 'content_block_stop',
        index: 1
      });
      expect(streamState.hasToolCalls).toBe(true);

      // Chunk 3: End chunk with finishReason and usageMetadata
      const chunk3 = JSON.stringify({
        candidates: [{
          finishReason: 'STOP'
        }],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25
        }
      });
      const events3 = translator.translateGoogleToClaudeStream(`data: ${chunk3}`, 'gemini-2.5-flash', streamState);
      expect(events3).toBeDefined();

      const deltaEvent = events3!.find(e => e.type === 'message_delta');
      expect(deltaEvent).toBeDefined();
      expect(deltaEvent.delta.stop_reason).toBe('tool_use'); // Must be tool_use instead of end_turn!
      expect(events3!.find(e => e.type === 'message_stop')).toBeDefined();
    });

    it('closes thinking block, starts text block, and closes text block when functionCall arrives, then emits tool_use stop_reason', () => {
      const streamState: any = { tools: [] };

      // Chunk 1: Thinking block
      const chunk1 = JSON.stringify({
        candidates: [{
          content: { parts: [{ thought: true, text: 'Plan: call calculator' }] }
        }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(streamState.thinkingBlockStarted).toBe(true);

      // Chunk 2: Text block starts (closes thinking block)
      const chunk2 = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'I will calculate that for you.' }] }
        }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      expect(events2!.some(e => e.type === 'content_block_stop' && e.index === 0)).toBe(true);
      expect(streamState.thinkingBlockStarted).toBe(false);
      expect(streamState.textBlockStarted).toBe(true);
      expect(streamState.contentBlockIndex).toBe(1);

      // Chunk 3: functionCall arrives (closes text block)
      const chunk3 = JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: { id: 'calc_1', name: 'calculator', args: { expr: '2+2' } }
            }]
          }
        }]
      });
      const events3 = translator.translateGoogleToClaudeStream(`data: ${chunk3}`, 'gemini-2.5-flash', streamState);
      expect(events3![0]).toEqual({ type: 'content_block_stop', index: 1 });
      expect(streamState.textBlockStarted).toBe(false);
      expect(events3![1].type).toBe('content_block_start');
      expect(events3![1].content_block.type).toBe('tool_use');
      expect(streamState.hasToolCalls).toBe(true);

      // Chunk 4: finish chunk
      const chunk4 = JSON.stringify({
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 }
      });
      const events4 = translator.translateGoogleToClaudeStream(`data: ${chunk4}`, 'gemini-2.5-flash', streamState);
      const delta = events4!.find(e => e.type === 'message_delta');
      expect(delta.delta.stop_reason).toBe('tool_use');
    });

    it('sets stop_reason to max_tokens even if tool calls were made when finishReason is MAX_TOKENS', () => {
      const streamState: any = { tools: [] };

      const chunk1 = JSON.stringify({
        candidates: [{
          content: {
            parts: [{ functionCall: { id: 'call_x', name: 'search', args: {} } }]
          }
        }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(streamState.hasToolCalls).toBe(true);

      const chunk2 = JSON.stringify({
        candidates: [{ finishReason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 100 }
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      const delta = events2!.find(e => e.type === 'message_delta');
      expect(delta.delta.stop_reason).toBe('max_tokens');
    });
  });

  describe('Issue 3: Cross-chunk finishReason & usageMetadata and stream EOF handling', () => {
    it('properly caches finishReason and usageMetadata across different chunks and emits message_stop', () => {
      const streamState: any = {};

      // Chunk 1: Content with finishReason: 'STOP', but NO usageMetadata
      const chunk1 = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Hello, world!' }] },
          finishReason: 'STOP'
        }]
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(events1).toBeDefined();
      expect(streamState.cachedFinishReason).toBe('STOP');
      expect(streamState.hasEmittedMessageStop).toBeFalsy();
      expect(events1!.some(e => e.type === 'message_stop')).toBe(false);

      // Chunk 2: Standalone usageMetadata chunk, NO candidates
      const chunk2 = JSON.stringify({
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8
        }
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      expect(events2).toBeDefined();
      expect(streamState.cachedUsage).toBeDefined();
      expect(streamState.hasEmittedMessageStop).toBe(true);

      // Should have emitted text stop, message_delta, and message_stop
      const stopReasonDelta = events2!.find(e => e.type === 'message_delta');
      expect(stopReasonDelta).toBeDefined();
      expect(stopReasonDelta.delta.stop_reason).toBe('end_turn');
      expect(stopReasonDelta.usage.output_tokens).toBe(8);
      expect(events2!.some(e => e.type === 'message_stop')).toBe(true);
    });

    it('flushRemainingStreamEvents closes pending blocks and emits message_stop on premature EOF', () => {
      const streamState: any = {
        tools: []
      };

      // Chunk 1: Open a text block but never finish
      const chunk1 = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Partial text...' }] }
        }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(streamState.textBlockStarted).toBe(true);
      expect(streamState.hasEmittedMessageStop).toBeFalsy();

      // Flush on stream EOF
      const flushedEvents = translator.flushRemainingStreamEvents(streamState, 'gemini-2.5-flash');
      expect(flushedEvents.length).toBeGreaterThan(0);

      // Must have content_block_stop for the open text block
      const stopEvent = flushedEvents.find(e => e.type === 'content_block_stop');
      expect(stopEvent).toBeDefined();

      // Must have message_delta and message_stop
      const deltaEvent = flushedEvents.find(e => e.type === 'message_delta');
      expect(deltaEvent).toBeDefined();
      expect(deltaEvent.delta.stop_reason).toBe('end_turn');
      expect(flushedEvents.find(e => e.type === 'message_stop')).toBeDefined();
      expect(streamState.hasEmittedMessageStop).toBe(true);

      // Calling flush again returns empty array
      const flushedAgain = translator.flushRemainingStreamEvents(streamState, 'gemini-2.5-flash');
      expect(flushedAgain).toEqual([]);
    });

    it('properly caches usageMetadata when it arrives BEFORE finishReason (reverse order)', () => {
      const streamState: any = {};

      // Chunk 1: usageMetadata arrives first
      const chunk1 = JSON.stringify({
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 12
        }
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(streamState.cachedUsage).toBeDefined();
      expect(streamState.cachedFinishReason).toBeUndefined();
      expect(streamState.hasEmittedMessageStop).toBeFalsy();
      expect(events1!.some(e => e.type === 'message_stop')).toBe(false);

      // Chunk 2: content with finishReason: 'STOP' arrives later
      const chunk2 = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Answer' }] },
          finishReason: 'STOP'
        }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      expect(streamState.cachedFinishReason).toBe('STOP');
      expect(streamState.hasEmittedMessageStop).toBe(true);

      const delta = events2!.find(e => e.type === 'message_delta');
      expect(delta).toBeDefined();
      expect(delta.usage.output_tokens).toBe(12);
      expect(events2!.some(e => e.type === 'message_stop')).toBe(true);
    });

    it('ignores any subsequent chunks once message_stop has already been emitted', () => {
      const streamState: any = {};

      // Complete stream
      const chunk1 = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Done' }] },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 }
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(streamState.hasEmittedMessageStop).toBe(true);

      // Trailing chunk arrives after message_stop
      const trailingChunk = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Extra unexpected data' }] }
        }]
      });
      const trailingEvents = translator.translateGoogleToClaudeStream(`data: ${trailingChunk}`, 'gemini-2.5-flash', streamState);
      expect(trailingEvents).toBeNull();
    });

    it('uses streamState.modelName when flushing empty stream without explicit modelName', () => {
      const streamState: any = {};

      // Chunk 1 starts stream with modelName
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '' }] } }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-pro', streamState);
      expect(streamState.modelName).toBe('gemini-2.5-pro');

      // Flush without passing modelName
      const flushed = translator.flushRemainingStreamEvents(streamState);
      expect(flushed.length).toBeGreaterThan(0);
      expect(streamState.hasEmittedMessageStop).toBe(true);

      // Flushed again returns empty
      expect(translator.flushRemainingStreamEvents(streamState)).toEqual([]);
    });
  });

  describe('Issue 4 (Defect 16): Do NOT inject illegal parts inside functionResponse', () => {
    it('ensures functionResponse strictly contains name, response, id and never has parts property', () => {
      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_doc', input: {} }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: [
                  { type: 'text', text: 'Document content' },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/png',
                      data: 'base64data=='
                    }
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      const userTurn = result.googleRequest.contents[1];
      expect(userTurn.role).toBe('user');
      expect(userTurn.parts[0].functionResponse).toBeDefined();

      const fnResp = userTurn.parts[0].functionResponse;
      expect(fnResp?.name).toBe('read_doc');
      expect(fnResp?.response).toEqual({ result: 'Document content' });
      expect(fnResp?.id).toBe('toolu_1');
      // Critical check: Protobuf compliance
      expect((fnResp as any)?.parts).toBeUndefined();
    });

    it('ensures multi-image tool_result never has parts property on functionResponse and separates images into next turn', () => {
      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_multi', name: 'render_charts', input: {} }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_multi',
                content: [
                  { type: 'text', text: 'Rendered 2 charts' },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data1' } },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'data2' } }
                ]
              }
            ]
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      expect(result.googleRequest.contents).toHaveLength(3);

      const userTurn = result.googleRequest.contents[1];
      expect(userTurn.role).toBe('user');
      expect(userTurn.parts).toHaveLength(1);
      expect(userTurn.parts[0].functionResponse).toBeDefined();
      expect(userTurn.parts[0].functionResponse?.name).toBe('render_charts');
      expect((userTurn.parts[0].functionResponse as any)?.parts).toBeUndefined();

      const mediaTurn = result.googleRequest.contents[2];
      expect(mediaTurn.role).toBe('user');
      expect(mediaTurn.parts).toHaveLength(2);
      expect(mediaTurn.parts[0].inlineData?.data).toBe('data1');
      expect(mediaTurn.parts[1].inlineData?.data).toBe('data2');
    });

    it('ensures error tool_result never has parts property on functionResponse', () => {
      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_err', name: 'execute_command', input: {} }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_err',
                is_error: true,
                content: 'Command failed with exit code 1'
              }
            ]
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      const userTurn = result.googleRequest.contents[1];
      expect(userTurn.parts[0].functionResponse?.response).toEqual({
        error: 'Command failed with exit code 1'
      });
      expect((userTurn.parts[0].functionResponse as any)?.parts).toBeUndefined();
    });
  });

  describe('Issue 5 (Defect 20): Separate tool_result and user text into distinct Gemini turns', () => {
    it('splits tool_result and follow-up text into separate Gemini user turns', () => {
      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_search', name: 'search', input: { q: 'weather' } }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_search',
                content: 'Sunny, 25C'
              },
              {
                type: 'text',
                text: 'Based on this weather, should I wear a jacket?'
              }
            ]
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      const contents = result.googleRequest.contents;

      // Model turn
      expect(contents[0].role).toBe('model');
      expect(contents[0].parts[0].functionCall).toBeDefined();

      // Turn 1: Dedicated user turn containing ONLY functionResponse
      expect(contents[1].role).toBe('user');
      expect(contents[1].parts).toHaveLength(1);
      expect(contents[1].parts[0].functionResponse).toBeDefined();
      expect(contents[1].parts[0].functionResponse?.name).toBe('search');
      expect((contents[1].parts[0] as any).text).toBeUndefined();

      // Turn 2: User turn containing the text instructions/question
      expect(contents[2].role).toBe('user');
      expect(contents[2].parts).toHaveLength(1);
      expect(contents[2].parts[0].text).toBe('Based on this weather, should I wear a jacket?');
      expect(contents[2].parts[0].functionResponse).toBeUndefined();
    });

    it('merges consecutive functionResponse turns together, but does not merge functionResponse with text', () => {
      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'call_1', name: 'fetch_a', input: {} },
              { type: 'tool_use', id: 'call_2', name: 'fetch_b', input: {} }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'call_1', content: 'Result A' }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'call_2', content: 'Result B' },
              { type: 'text', text: 'Now summarize both results.' }
            ]
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      const contents = result.googleRequest.contents;

      // Model turn
      expect(contents[0].role).toBe('model');

      // FunctionResponse turn: merges both tool results into one turn
      expect(contents[1].role).toBe('user');
      expect(contents[1].parts).toHaveLength(2);
      expect(contents[1].parts[0].functionResponse?.name).toBe('fetch_a');
      expect(contents[1].parts[1].functionResponse?.name).toBe('fetch_b');

      // Follow-up user text turn: kept completely separate
      expect(contents[2].role).toBe('user');
      expect(contents[2].parts).toHaveLength(1);
      expect(contents[2].parts[0].text).toBe('Now summarize both results.');
    });

    it('splits tool_result and follow-up text into separate turns when systemRoleToInstruction is true', () => {
      config.systemRoleToInstruction = true;

      const claudePayload: any = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_split_sys', name: 'get_time', input: {} }]
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_split_sys',
                content: '12:00 PM'
              },
              {
                type: 'text',
                text: 'Is it lunchtime yet?'
              }
            ]
          },
          {
            role: 'system',
            content: 'Be polite and brief'
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);
      const contents = result.googleRequest.contents;

      // Turn 0: Model tool use
      expect(contents[0].role).toBe('model');

      // Turn 1: Dedicated user turn containing ONLY functionResponse
      expect(contents[1].role).toBe('user');
      expect(contents[1].parts).toHaveLength(1);
      expect(contents[1].parts[0].functionResponse).toBeDefined();
      expect(contents[1].parts[0].functionResponse?.name).toBe('get_time');
      expect((contents[1].parts[0] as any).text).toBeUndefined();

      // Turn 2: User turn containing system-context and follow-up text
      expect(contents[2].role).toBe('user');
      expect(contents[2].parts).toHaveLength(2);
      expect(contents[2].parts[0].text).toContain('<system-context>');
      expect(contents[2].parts[0].text).toContain('Be polite and brief');
      expect(contents[2].parts[1].text).toBe('Is it lunchtime yet?');
      expect(contents[2].parts[0].functionResponse).toBeUndefined();
    });
  });
});
