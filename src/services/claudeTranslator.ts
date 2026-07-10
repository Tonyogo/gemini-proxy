import config from '../../config/default';
import logger from '../utils/logger';
import { ClaudeRequest, GeminiRequest, GeminiContent, GeminiPart } from '../types';

class ClaudeTranslator {
  public _convertSchemaToGemini(obj: any, isResponseSchema: boolean = false, isProperties: boolean = false): any {
    if (!obj || typeof obj !== "object") return obj;

    const result: any = Array.isArray(obj) ? [] : {};

    for (const key of Object.keys(obj)) {
      const unsupportedKeys = [
        "$schema", "additionalProperties", "ref", "$ref", "propertyNames",
        "patternProperties", "unevaluatedProperties", "exclusiveMinimum",
        "exclusiveMaximum", "const", "$comment", "enumDescriptions"
      ];

      if (isResponseSchema) {
        unsupportedKeys.push("default", "examples", "$defs", "id");
      }

      if (!isProperties && unsupportedKeys.includes(key)) {
        continue;
      }

      if (key === "anyOf" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const variants = obj[key];
          const hasNull = variants.some((v: any) => v.type === "null");
          const nonNullVariants = variants.filter((v: any) => v.type !== "null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullVariants.length === 1) {
            const converted = this._convertSchemaToGemini(nonNullVariants[0], isResponseSchema, false);
            Object.assign(result, converted);
            if (hasNull) result.nullable = true;
            continue;
          } else if (nonNullVariants.length > 0) {
            result.anyOf = nonNullVariants.map((v: any) =>
              this._convertSchemaToGemini(v, isResponseSchema, false)
            );
            continue;
          } else if (hasNull) {
            continue;
          }
        }
      }

      if (key === "type" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const types = obj[key];
          const nonNullTypes = types.filter((t: any) => t !== "null");
          const hasNull = types.includes("null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullTypes.length === 1) {
            result[key] = nonNullTypes[0].toUpperCase();
          } else if (nonNullTypes.length > 1) {
            if (isResponseSchema) {
              result.anyOf = nonNullTypes.map((t: any) => ({
                type: t.toUpperCase(),
              }));
            } else {
              result[key] = nonNullTypes.map((t: any) => t.toUpperCase());
            }
          } else {
            result[key] = "STRING";
          }
        } else if (typeof obj[key] === "string") {
          result[key] = obj[key].toUpperCase();
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, false);
        } else {
          result[key] = obj[key];
        }
      } else if (key === "enum" && !isProperties) {
        if (isResponseSchema) {
          if (Array.isArray(obj[key])) {
            result[key] = obj[key].map(String);
          } else if (obj[key] !== undefined && obj[key] !== null) {
            result[key] = [String(obj[key])];
          }
          result["type"] = "STRING";
        } else {
          result[key] = obj[key];
        }
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        const nextIsProperties = key === "properties";
        const recursionFlag = isProperties ? false : nextIsProperties;

        result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, recursionFlag);
      } else {
        result[key] = obj[key];
      }
    }

    return result;
  }

  public translateClaudeToGoogle(claudeBody: ClaudeRequest) {
    const rawModel = claudeBody.model || config.defaultModel;
    const cleanModelName = config.modelMapping[rawModel] || config.defaultModel;

    let systemInstruction: any = null;

    const appendSystemContent = (content: any) => {
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .map((block: any) => {
            if (typeof block === "string") return block;
            if (block && block.type === "text") return block.text || "";
            return block?.text || "";
          })
          .filter(Boolean)
          .join("\n");
      }

      if (!text) return;

      if (systemInstruction) {
        systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n${text}`;
      } else {
        systemInstruction = {
          parts: [{ text }],
          role: "user"
        };
      }
    };

    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }

    const contents: GeminiContent[] = [];
    const toolIdToNameMap = new Map<string, string>();

    if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
      for (const msg of claudeBody.messages) {
        if (msg.role === 'system') {
          appendSystemContent(msg.content);
          continue;
        }

        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: GeminiPart[] = [];

        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            } else if (block.type === 'tool_use') {
              toolIdToNameMap.set(block.id, block.name);
              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.input || {}
                }
              });
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              parts.push({
                functionResponse: {
                  name: matchedName,
                  response: { content: block.content }
                }
              });
            }
          }
        }
        contents.push({ role, parts });
      }
    }

    const googleRequest: GeminiRequest = { contents };
    if (systemInstruction) {
      googleRequest.systemInstruction = systemInstruction;
    }

    const generationConfig: any = {};
    if (claudeBody.max_tokens) {
      generationConfig.maxOutputTokens = claudeBody.max_tokens;
    }
    if (claudeBody.temperature !== undefined) {
      generationConfig.temperature = claudeBody.temperature;
    }
    if (claudeBody.top_p !== undefined) {
      generationConfig.topP = claudeBody.top_p;
    }
    if (Object.keys(generationConfig).length > 0) {
      googleRequest.generationConfig = generationConfig;
    }

    if (claudeBody.thinking && claudeBody.thinking.type === 'enabled') {
      googleRequest.thinkingConfig = {
        thinkingBudget: claudeBody.thinking.budget_tokens || 1024
      };
    }

    if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
      googleRequest.tools = [{
        functionDeclarations: claudeBody.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: this._convertSchemaToGemini(tool.input_schema)
        }))
      }];
    }

    return {
      googleRequest,
      cleanModelName,
      isStream: claudeBody.stream === true
    };
  }

  public convertGoogleToClaudeNonStream(googleResponse: any, modelName: string) {
    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata || {};

    const content: any[] = [];
    const messageId = `msg_fake_${Math.random().toString(36).substring(2, 11)}`;

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          content.push({
            type: 'thinking',
            thinking: part.text,
            signature: part.thoughtSignature || 'dummy_signature'
          });
        } else if (part.text) {
          content.push({
            type: 'text',
            text: part.text
          });
        } else if (part.functionCall) {
          content.push({
            id: `toolu_fake_${Math.random().toString(36).substring(2, 11)}`,
            type: 'tool_use',
            name: part.functionCall.name,
            input: part.functionCall.args || {}
          });
        }
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    let stopReason = 'end_turn';
    if (candidate && candidate.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (candidate && candidate.content && candidate.content.parts.some((p: any) => p.functionCall)) {
      stopReason = 'tool_use';
    }

    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: modelName,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)
      }
    };
  }

  public translateGoogleToClaudeStream(googleChunk: string, modelName: string, streamState: any) {
    if (!googleChunk || googleChunk.trim() === '') return null;

    let jsonString = googleChunk;
    if (jsonString.startsWith('data: ')) {
      jsonString = jsonString.substring(6).trim();
    }
    if (jsonString === '[DONE]') return null;

    let googleResponse;
    try {
      googleResponse = JSON.parse(jsonString);
    } catch (e) {
      return null;
    }

    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata;
    const events: any[] = [];

    if (!streamState.messageId) {
      streamState.messageId = `msg_stream_${Math.random().toString(36).substring(2, 11)}`;
      streamState.contentBlockIndex = 0;
    }

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
            input_tokens: usage ? usage.promptTokenCount || 0 : 0,
            output_tokens: 0
          }
        }
      });
      streamState.messageStartSent = true;
    }

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          if (!streamState.thinkingBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'thinking', thinking: '', signature: part.thoughtSignature || 'dummy' }
            });
            streamState.thinkingBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'thinking_delta', thinking: part.text }
          });
        } else if (part.text) {
          if (streamState.thinkingBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.thinkingBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          if (!streamState.textBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'text', text: '' }
            });
            streamState.textBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'text_delta', text: part.text }
          });
        } else if (part.functionCall) {
          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_stream_${Math.random().toString(36).substring(2, 11)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            }
          });
          events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
          streamState.contentBlockIndex++;
        }
      }
    }

    if (usage && googleResponse.candidates?.[0]?.finishReason) {
      if (streamState.textBlockStarted) {
        events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
        streamState.textBlockStarted = false;
      }
      let stopReason = 'end_turn';
      if (candidate.finishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      }
      events.push({
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0) }
      });
      events.push({ type: 'message_stop' });
    }

    if (events.length === 0) return null;

    return events.map((ev: any) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
  }

  public normalizeError(error: any) {
    logger.error(`API Error: ${error.message || error}`);
    const status = error.status || 500;
    let type = 'api_error';
    if (status === 400) type = 'invalid_request_error';
    if (status === 401 || status === 403) type = 'authentication_error';
    if (status === 429) type = 'rate_limit_error';

    return {
      status,
      payload: {
        type: 'error',
        error: {
          type,
          message: error.message || 'Internal Server Error'
        }
      }
    };
  }
}

export default new ClaudeTranslator();
