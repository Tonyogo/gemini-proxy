import translator from '../src/proxy/services/claudeTranslator';
import config from '../config/default';
import { StreamLifecycleManager } from '../src/utils/streamLifecycleManager';
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import supertest from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

jest.mock('node-fetch');
jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Phase 2 Pipeline Optimizations', () => {
  const originalMappings = config.modelMappings;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    config.modelMappings = originalMappings;
  });

  // =========================================================================
  // Item 1: Complete mapping of claudeBody.thinking and tool_choice to Gemini
  // =========================================================================
  describe('Item 1: Complete mapping of claudeBody.thinking and tool_choice to Gemini', () => {
    it('maps thinking.type = enabled with budget_tokens to generationConfig.thinkingConfig.thinkingBudget', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'Explain quantum computing' }],
        thinking: { type: 'enabled', budget_tokens: 2048 }
      });

      expect(result.googleRequest.generationConfig).toBeDefined();
      expect(result.googleRequest.generationConfig!.thinkingConfig).toEqual({
        thinkingBudget: 2048
      });
    });

    it('maps thinking.type = disabled to thinkingBudget = 0', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        thinking: { type: 'disabled' }
      });

      expect(result.googleRequest.generationConfig).toBeDefined();
      expect(result.googleRequest.generationConfig!.thinkingConfig).toEqual({
        thinkingBudget: 0
      });
    });

    it('merges thinkingBudget with thinkingLevel: HIGH when model has -high suffix', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Deep thought question' }],
        thinking: { type: 'enabled', budget_tokens: 4096 }
      });

      expect(result.googleRequest.generationConfig).toBeDefined();
      expect(result.googleRequest.generationConfig!.thinkingConfig).toEqual({
        thinkingLevel: 'HIGH',
        thinkingBudget: 4096
      });
    });

    it('merges thinkingBudget: 0 with thinkingLevel: HIGH when model has -high suffix and thinking is disabled', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Simple question' }],
        thinking: { type: 'disabled' }
      });

      expect(result.googleRequest.generationConfig).toBeDefined();
      expect(result.googleRequest.generationConfig!.thinkingConfig).toEqual({
        thinkingLevel: 'HIGH',
        thinkingBudget: 0
      });
    });

    it('injects thinkingLevel: MEDIUM when thinking is not specified and model is not -high', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.googleRequest.generationConfig?.thinkingConfig).toEqual({
        thinkingLevel: 'MEDIUM'
      });
    });

    it('maps tool_choice { type: "auto" } to functionCallingConfig.mode: AUTO', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } }],
        tool_choice: { type: 'auto' }
      });

      expect(result.googleRequest.toolConfig).toEqual({
        functionCallingConfig: {
          mode: 'AUTO'
        }
      });
    });

    it('maps tool_choice { type: "any" } to functionCallingConfig.mode: ANY', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'Call any tool' }],
        tools: [{ name: 'tool1', input_schema: { type: 'object' } }],
        tool_choice: { type: 'any' }
      });

      expect(result.googleRequest.toolConfig).toEqual({
        functionCallingConfig: {
          mode: 'ANY'
        }
      });
    });

    it('maps tool_choice { type: "tool", name: "tool_name" } to functionCallingConfig.mode: ANY with allowedFunctionNames', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'Fetch stock price' }],
        tools: [
          { name: 'get_stock', description: 'Get stock price', input_schema: { type: 'object' } },
          { name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } }
        ],
        tool_choice: { type: 'tool', name: 'get_stock' }
      });

      expect(result.googleRequest.toolConfig).toEqual({
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['get_stock']
        }
      });
    });

    it('maps tool_choice { type: "none" } to functionCallingConfig.mode: NONE', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'Do not use tools' }],
        tools: [{ name: 'calc', input_schema: { type: 'object' } }],
        tool_choice: { type: 'none' }
      });

      expect(result.googleRequest.toolConfig).toEqual({
        functionCallingConfig: {
          mode: 'NONE'
        }
      });
    });

    it('supports string format tool_choice: "auto"', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'Auto tool call' }],
        tools: [{ name: 'calc', input_schema: { type: 'object' } }],
        tool_choice: 'auto'
      });

      expect(result.googleRequest.toolConfig).toEqual({
        functionCallingConfig: {
          mode: 'AUTO'
        }
      });
    });
  });

  // =========================================================================
  // Item 2: Graceful degradation for Assistant Prefill
  // =========================================================================
  describe('Item 2: Graceful degradation for Assistant Prefill', () => {
    it('detects trailing assistant message, removes it from contents, extracts prefillContent, and injects instruction into preceding user message', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'user', content: 'Produce a JSON output' },
          { role: 'assistant', content: '{\n  "status":' }
        ]
      });

      expect(result.prefillContent).toBe('{\n  "status":');
      // Contents must NOT end with a model turn!
      expect(result.googleRequest.contents.length).toBe(1);
      expect(result.googleRequest.contents[0].role).toBe('user');
      expect(result.googleRequest.contents[0].parts[0].text).toContain('Produce a JSON output');
      expect(result.googleRequest.contents[0].parts[0].text).toContain(
        '[Instruction: Continue your response starting directly with: "{\n  "status":"]'
      );
    });

    it('injects instruction when preceding user message has array content', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Output numbers' }]
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: '1, 2, ' }]
          }
        ]
      });

      expect(result.prefillContent).toBe('1, 2, ');
      expect(result.googleRequest.contents.length).toBe(1);
      expect(result.googleRequest.contents[0].role).toBe('user');
      const texts = result.googleRequest.contents[0].parts.map(p => p.text).join('\n');
      expect(texts).toContain('1, 2, ');
    });

    it('injects instruction into systemInstruction or creates user turn when assistant prefill is the only message', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash',
        system: 'System rules',
        messages: [
          { role: 'assistant', content: 'Starting text' }
        ]
      });

      expect(result.prefillContent).toBe('Starting text');
      expect(result.googleRequest.contents.length).toBe(0);
      expect(result.googleRequest.systemInstruction?.parts[0].text).toContain('Starting text');
    });

    it('prepends prefillContent in convertGoogleToClaudeNonStream if model did not repeat it', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: ' "success" }' }] },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10 }
      };

      const converted = translator.convertGoogleToClaudeNonStream(
        googleResponse,
        'gemini-2.5-flash',
        undefined,
        '{\n  "status":'
      );

      expect(converted.content[0].text).toBe('{\n  "status": "success" }');
    });

    it('does not duplicate prefillContent in convertGoogleToClaudeNonStream if model already repeated it', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: '{\n  "status": "success" }' }] },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10 }
      };

      const converted = translator.convertGoogleToClaudeNonStream(
        googleResponse,
        'gemini-2.5-flash',
        undefined,
        '{\n  "status":'
      );

      expect(converted.content[0].text).toBe('{\n  "status": "success" }');
    });

    it('inserts prefillContent text block in convertGoogleToClaudeNonStream if response only contains tool_use', () => {
      const googleResponse = {
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'calc', args: { expr: '1+1' } }
            }]
          },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
      };

      const converted = translator.convertGoogleToClaudeNonStream(
        googleResponse,
        'gemini-2.5-flash',
        undefined,
        'Calculating: '
      );

      expect(converted.content[0]).toEqual({ type: 'text', text: 'Calculating: ' });
      expect(converted.content[1].type).toBe('tool_use');
    });

    it('emits prefillContent as the first text delta in translateGoogleToClaudeStream if model chunk did not repeat it', () => {
      const streamState: any = { tools: [], prefillContent: '{\n  "answer":' };

      const chunk = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: ' 42 }' }] }
        }]
      });

      const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);
      expect(events).toBeDefined();

      const textDeltas = events!.filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta');
      expect(textDeltas.length).toBe(2);
      expect(textDeltas[0].delta.text).toBe('{\n  "answer":');
      expect(textDeltas[1].delta.text).toBe(' 42 }');
    });

    it('does not duplicate prefillContent in translateGoogleToClaudeStream if model chunk already starts with prefill', () => {
      const streamState: any = { tools: [], prefillContent: '{\n  "answer":' };

      const chunk = JSON.stringify({
        candidates: [{
          content: { parts: [{ text: '{\n  "answer": 42 }' }] }
        }]
      });

      const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);
      expect(events).toBeDefined();

      const textDeltas = events!.filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta');
      expect(textDeltas.length).toBe(1);
      expect(textDeltas[0].delta.text).toBe('{\n  "answer": 42 }');
    });

    it('emits prefillContent cleanly in stream when thinking precedes the text', () => {
      const streamState: any = { tools: [], prefillContent: 'Result: ' };

      // Chunk 1: thinking
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ thought: true, text: 'pondering' }] } }]
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);
      expect(events1!.some(e => e.type === 'content_block_start' && e.content_block.type === 'thinking')).toBe(true);

      // Chunk 2: text arrival
      const chunk2 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'done.' }] } }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      const deltas = events2!.filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta');
      expect(deltas.length).toBe(2);
      expect(deltas[0].delta.text).toBe('Result: ');
      expect(deltas[1].delta.text).toBe('done.');
    });

    it('emits prefillContent in flushRemainingStreamEvents if no text parts were received', () => {
      const streamState: any = { tools: [], prefillContent: 'Prefilled note' };

      const chunk = JSON.stringify({
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);

      const flushed = translator.flushRemainingStreamEvents(streamState, 'gemini-2.5-flash');
      // Already emitted in translateGoogleToClaudeStream upon finish
      expect(streamState.prefillEmitted).toBe(true);
    });

    it('appends a user turn when messages ends with consecutive assistant messages so contents ends with user turn', () => {
      const result = translator.translateClaudeToGoogle({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'user', content: 'What is the answer?' },
          { role: 'assistant', content: 'Thinking about it...' },
          { role: 'assistant', content: '{\n  "answer":' }
        ]
      });

      expect(result.prefillContent).toBe('{\n  "answer":');
      expect(result.googleRequest.contents.length).toBe(3);
      expect(result.googleRequest.contents[0].role).toBe('user');
      expect(result.googleRequest.contents[1].role).toBe('model');
      expect(result.googleRequest.contents[2].role).toBe('user');
      expect(result.googleRequest.contents[2].parts[0].text).toContain('[Instruction: Continue your response starting directly with: "{\n  "answer":"]');
    });

    it('inserts prefillContent text block AFTER thinking blocks in convertGoogleToClaudeNonStream', () => {
      const googleResponse = {
        candidates: [{
          content: {
            parts: [
              { thought: true, text: 'reasoning process' },
              { functionCall: { name: 'calc', args: { expr: '2+2' } } }
            ]
          },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10 }
      };

      const converted = translator.convertGoogleToClaudeNonStream(
        googleResponse,
        'gemini-2.5-flash',
        undefined,
        'Calculating result: '
      );

      expect(converted.content.length).toBe(3);
      expect(converted.content[0].type).toBe('thinking');
      expect(converted.content[1].type).toBe('text');
      expect(converted.content[1].text).toBe('Calculating result: ');
      expect(converted.content[2].type).toBe('tool_use');
    });

    it('does not duplicate prefillContent when model streams prefill tokens across multiple chunks', () => {
      const streamState: any = { tools: [], prefillContent: '{\n  "name":' };

      // Chunk 1: first token
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{' }] } }]
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState) || [];

      // Chunk 2: second part of prefill + continuation
      const chunk2 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '\n  "name": "gemini"}' }] } }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState) || [];

      const allEvents = [...events1, ...events2];
      const textDeltas = allEvents
        .filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta')
        .map(e => e.delta.text)
        .join('');

      expect(textDeltas).toBe('{\n  "name": "gemini"}');
    });

    it('emits prefillContent followed by diverged stream text if model partial match diverges', () => {
      const streamState: any = { tools: [], prefillContent: '{\n  "name":' };

      // Chunk 1: partial match
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{' }] } }]
      });
      const events1 = translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState) || [];

      // Chunk 2: diverged text
      const chunk2 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'different json}' }] } }]
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState) || [];

      const allEvents = [...events1, ...events2];
      const textDeltas = allEvents
        .filter(e => e.type === 'content_block_delta' && e.delta.type === 'text_delta')
        .map(e => e.delta.text)
        .join('');

      expect(textDeltas).toBe('{\n  "name":{different json}');
    });

    it('emits prefillContent as a text block BEFORE tool_use block in streaming mode', () => {
      const streamState: any = { tools: [], prefillContent: 'Checking tools: ' };

      const chunk = JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: 'search', args: { q: 'weather' } }
            }]
          }
        }]
      });

      const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState) || [];

      expect(events.length).toBeGreaterThan(0);
      const prefillDelta = events.find(e => e.type === 'content_block_delta' && e.delta?.type === 'text_delta');
      expect(prefillDelta).toBeDefined();
      expect(prefillDelta!.delta.text).toBe('Checking tools: ');

      const toolUseBlock = events.find(e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock!.index).toBe(1); // text was index 0, tool_use is index 1!
    });
  });

  // =========================================================================
  // Item 3: Stream token usage accuracy (input_tokens & output_tokens)
  // =========================================================================
  describe('Item 3: Stream token usage accuracy (input_tokens & output_tokens)', () => {
    it('sets input_tokens = 0 at message_start when usageMetadata is not yet available in the chunk', () => {
      const streamState: any = { tools: [] };

      const chunkNoUsage = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }]
      });

      const events = translator.translateGoogleToClaudeStream(`data: ${chunkNoUsage}`, 'gemini-2.5-flash', streamState);
      const msgStart = events!.find(e => e.type === 'message_start');

      expect(msgStart).toBeDefined();
      expect(msgStart.message.usage).toEqual({
        input_tokens: 0,
        output_tokens: 0
      });
    });

    it('sets input_tokens and cache_read_input_tokens at message_start when usageMetadata is present', () => {
      const streamState: any = { tools: [] };

      const chunkWithUsage = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
        usageMetadata: { promptTokenCount: 42, cachedContentTokenCount: 18 }
      });

      const events = translator.translateGoogleToClaudeStream(`data: ${chunkWithUsage}`, 'gemini-2.5-flash', streamState);
      const msgStart = events!.find(e => e.type === 'message_start');

      expect(msgStart).toBeDefined();
      expect(msgStart.message.usage).toEqual({
        input_tokens: 42,
        output_tokens: 0,
        cache_read_input_tokens: 18
      });
    });

    it('updates input_tokens, output_tokens (candidates + thoughts), and cache_read_input_tokens in message_delta upon completion', () => {
      const streamState: any = { tools: [] };

      // Chunk 1: message_start
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'First part ' }] } }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);

      // Chunk 2: finishReason + complete usageMetadata
      const chunk2 = JSON.stringify({
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 85,
          thoughtsTokenCount: 30,
          cachedContentTokenCount: 50
        }
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      const delta = events2!.find(e => e.type === 'message_delta');

      expect(delta).toBeDefined();
      expect(delta.usage).toEqual({
        input_tokens: 120,
        output_tokens: 115, // 85 + 30
        cache_read_input_tokens: 50
      });
    });

    it('updates input_tokens, output_tokens, and cache_read_input_tokens in flushRemainingStreamEvents', () => {
      const streamState: any = {
        tools: [],
        cachedUsage: {
          promptTokenCount: 200,
          candidatesTokenCount: 50,
          thoughtsTokenCount: 15,
          cachedContentTokenCount: 75
        },
        cachedFinishReason: 'STOP'
      };

      const events = translator.flushRemainingStreamEvents(streamState, 'gemini-2.5-flash');
      const delta = events.find(e => e.type === 'message_delta');

      expect(delta).toBeDefined();
      expect(delta.usage).toEqual({
        input_tokens: 200,
        output_tokens: 65,
        cache_read_input_tokens: 75
      });
    });

    it('tracks cache_read_input_tokens in convertGoogleToClaudeNonStream when cachedContentTokenCount is present', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          finishReason: 'STOP'
        }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 5,
          cachedContentTokenCount: 40
        }
      };

      const result = translator.convertGoogleToClaudeNonStream(googleResponse, 'gemini-2.5-flash');
      expect(result.usage).toEqual({
        input_tokens: 100,
        output_tokens: 25,
        cache_read_input_tokens: 40
      });
    });
  });

  // =========================================================================
  // Item 4: Deferred SSE Heartbeat Ping in StreamLifecycleManager
  // =========================================================================
  describe('Item 4: Deferred SSE Heartbeat Ping in StreamLifecycleManager', () => {
    let mockReq: EventEmitter & Partial<Request>;
    let mockRes: EventEmitter & Partial<Response>;

    beforeEach(() => {
      jest.useFakeTimers();
      mockReq = new EventEmitter() as any;
      mockRes = new EventEmitter() as any;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does NOT write headers or : ping in constructor when enableSseHeartbeat is true', () => {
      const setHeaderSpy = jest.fn();
      const flushHeadersSpy = jest.fn();
      const writeSpy = jest.fn();
      mockRes.setHeader = setHeaderSpy;
      mockRes.flushHeaders = flushHeadersSpy;
      mockRes.write = writeSpy;
      (mockRes as any).headersSent = false;
      (mockRes as any).writableEnded = false;

      const manager = new StreamLifecycleManager({
        req: mockReq as Request,
        res: mockRes as Response,
        transactionId: 'test_tx_deferred_heartbeat',
        enableSseHeartbeat: true,
        heartbeatIntervalMs: 3000
      });

      expect(setHeaderSpy).not.toHaveBeenCalled();
      expect(flushHeadersSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
      expect((mockRes as any).headersSent).toBe(false);

      manager.markFinished();
    });

    it('flushes headers and sends : ping when heartbeat timer fires before upstream responds', () => {
      const setHeaderSpy = jest.fn();
      const flushHeadersSpy = jest.fn();
      const writeSpy = jest.fn();
      mockRes.setHeader = setHeaderSpy;
      mockRes.flushHeaders = flushHeadersSpy;
      mockRes.write = writeSpy;
      (mockRes as any).headersSent = false;
      (mockRes as any).writableEnded = false;

      const manager = new StreamLifecycleManager({
        req: mockReq as Request,
        res: mockRes as Response,
        transactionId: 'test_tx_timer_fires',
        enableSseHeartbeat: true,
        heartbeatIntervalMs: 3000
      });

      // Advance by 3s: timer fires
      jest.advanceTimersByTime(3000);

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(flushHeadersSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenCalledWith(': ping\n\n');

      manager.markFinished();
    });

    it('flushes headers without sending : ping when attachStream is called on fast 2xx upstream response, and stops heartbeat once data arrives', () => {
      const setHeaderSpy = jest.fn();
      const flushHeadersSpy = jest.fn();
      const writeSpy = jest.fn();
      mockRes.setHeader = setHeaderSpy;
      mockRes.flushHeaders = flushHeadersSpy;
      mockRes.write = writeSpy;
      (mockRes as any).headersSent = false;
      (mockRes as any).writableEnded = false;

      const manager = new StreamLifecycleManager({
        req: mockReq as Request,
        res: mockRes as Response,
        transactionId: 'test_tx_attach_stream',
        enableSseHeartbeat: true,
        heartbeatIntervalMs: 60000
      });

      // Upstream responds in 50ms (before 60s timer fires)
      const mockStream = new EventEmitter();
      manager.attachStream(mockStream);

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(flushHeadersSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).not.toHaveBeenCalled();

      // Once data arrives, heartbeat timer is cleared
      mockStream.emit('data', Buffer.from('data: {"text":"chunk"}\n\n'));
      jest.advanceTimersByTime(120000);
      expect(writeSpy).not.toHaveBeenCalled();

      manager.markFinished();
    });

    it('allows controller to return real HTTP error status (400, 401, 429) when upstream fails fast', async () => {
      jest.useRealTimers();

      // Mock 401 from upstream
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key invalid' } })),
        headers: { get: () => null }
      });

      const res = await supertest(app)
        .post('/v1/messages')
        .set('x-api-key', 'bad-key')
        .send({
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'test fast failure' }],
          stream: true
        });

      // headersSent was false, so real status 502 / 401 error is returned as JSON instead of HTTP 200 SSE!
      expect(res.status).toBe(502); // normalized from 401 upstream error
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toContain('API key invalid');
    });
  });

  // =========================================================================
  // Item 5: Gemini Safety Block mapping
  // =========================================================================
  describe('Item 5: Gemini Safety Block mapping', () => {
    it('maps candidate finishReason: "SAFETY" to stop_reason: "refusal" in non-streaming', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: 'I cannot fulfill this request.' }] },
          finishReason: 'SAFETY'
        }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 }
      };

      const result = translator.convertGoogleToClaudeNonStream(googleResponse, 'gemini-2.5-flash');
      expect(result.stop_reason).toBe('refusal');
    });

    it('maps candidate finishReason: "BLOCKLIST" to stop_reason: "refusal" in non-streaming', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: '' }] },
          finishReason: 'BLOCKLIST'
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
      };

      const result = translator.convertGoogleToClaudeNonStream(googleResponse, 'gemini-2.5-flash');
      expect(result.stop_reason).toBe('refusal');
    });

    it('maps candidate finishReason: "PROHIBITED_CONTENT" to stop_reason: "refusal" in non-streaming', () => {
      const googleResponse = {
        candidates: [{
          content: { parts: [{ text: '' }] },
          finishReason: 'PROHIBITED_CONTENT'
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
      };

      const result = translator.convertGoogleToClaudeNonStream(googleResponse, 'gemini-2.5-flash');
      expect(result.stop_reason).toBe('refusal');
    });

    it('maps promptFeedback.blockReason: "SAFETY" to stop_reason: "refusal" in non-streaming', () => {
      const googleResponse = {
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' }]
        },
        candidates: []
      };

      const result = translator.convertGoogleToClaudeNonStream(googleResponse, 'gemini-2.5-flash');
      expect(result.stop_reason).toBe('refusal');
    });

    it('maps candidate finishReason: "SAFETY" in stream chunk to stop_reason: "refusal" and emits message_stop', () => {
      const streamState: any = { tools: [] };

      // Chunk 1: initial text
      const chunk1 = JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Warning: ' }] } }]
      });
      translator.translateGoogleToClaudeStream(`data: ${chunk1}`, 'gemini-2.5-flash', streamState);

      // Chunk 2: safety finishReason
      const chunk2 = JSON.stringify({
        candidates: [{ finishReason: 'SAFETY' }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5 }
      });
      const events2 = translator.translateGoogleToClaudeStream(`data: ${chunk2}`, 'gemini-2.5-flash', streamState);
      expect(events2).toBeDefined();

      const delta = events2!.find(e => e.type === 'message_delta');
      expect(delta).toBeDefined();
      expect(delta.delta.stop_reason).toBe('refusal');

      const stop = events2!.find(e => e.type === 'message_stop');
      expect(stop).toBeDefined();
    });

    it('maps candidate finishReason: "PROHIBITED_CONTENT" in stream chunk to stop_reason: "refusal"', () => {
      const streamState: any = { tools: [] };

      const chunk = JSON.stringify({
        candidates: [{ finishReason: 'PROHIBITED_CONTENT' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
      });
      const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);
      const delta = events!.find(e => e.type === 'message_delta');
      expect(delta.delta.stop_reason).toBe('refusal');
    });

    it('maps promptFeedback.blockReason: "SAFETY" in stream chunk without candidates to refusal', () => {
      const streamState: any = { tools: [] };

      const chunk = JSON.stringify({
        promptFeedback: { blockReason: 'SAFETY' }
      });
      const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);
      const delta = events!.find(e => e.type === 'message_delta');
      expect(delta.delta.stop_reason).toBe('refusal');
      expect(events!.find(e => e.type === 'message_stop')).toBeDefined();

      // Test flushRemainingStreamEvents directly when cachedPromptBlockReason is set
      const pendingStreamState: any = { tools: [], cachedPromptBlockReason: 'SAFETY' };
      const flushEvents = translator.flushRemainingStreamEvents(pendingStreamState, 'gemini-2.5-flash');
      const flushDelta = flushEvents.find(e => e.type === 'message_delta');
      expect(flushDelta.delta.stop_reason).toBe('refusal');
      expect(flushEvents.find(e => e.type === 'message_stop')).toBeDefined();
    });
  });

  // =========================================================================
  // Integration E2E Tests: Full Request Pipeline
  // =========================================================================
  describe('Full Request Pipeline Integration Tests', () => {
    it('handles Assistant Prefill in non-streaming POST /v1/messages', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: ' "active", "code": 200 }' }] },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 12 }
        }),
        headers: { get: () => null }
      });

      const res = await supertest(app)
        .post('/v1/messages')
        .set('x-api-key', 'valid-key')
        .send({
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'user', content: 'Give JSON status' },
            { role: 'assistant', content: '{\n  "status":' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.content[0].text).toBe('{\n  "status": "active", "code": 200 }');
    });

    it('maps safety block refusal in non-streaming POST /v1/messages', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'Content blocked.' }] },
            finishReason: 'SAFETY'
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
        }),
        headers: { get: () => null }
      });

      const res = await supertest(app)
        .post('/v1/messages')
        .set('x-api-key', 'valid-key')
        .send({
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'generate unsafe content' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.stop_reason).toBe('refusal');
    });
  });
});
