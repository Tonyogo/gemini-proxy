import config from '../../../config/default';
import logger from '../../utils/logger';
import { parseModelThinkingSuffix } from '../../utils/modelThinkingHelper';
import {
  ClaudeMessage,
  ClaudeRequest,
  GeminiRequest,
  GeminiContent,
  GeminiPart,
  GeminiModelsResponse,
  SchedulingStrategy,
  NormalizedErrorResponse
} from '../../types';

const BYPASS_SIGNATURE = 'context_engineering_is_the_way_to_go';

class ClaudeTranslator {
  private roundRobinCounters: Map<string, number> = new Map();

  /**
   * Dynamically resolves raw model aliases against config.modelMappings
   * Supports plain string target, string array, or object target { target, targets, strategy }
   */
  public getModelMappingInfo(
    rawModel: string,
    advanceCounter: boolean = false
  ): { targetModel: string; strategy?: SchedulingStrategy } {
    if (!rawModel) return { targetModel: rawModel };
    if (config.modelMappings && typeof config.modelMappings === 'object') {
      const mapping = config.modelMappings[rawModel];
      if (mapping) {
        if (typeof mapping === 'string') {
          return { targetModel: mapping };
        }
        if (Array.isArray(mapping)) {
          if (mapping.length === 0) {
            return { targetModel: rawModel };
          }
          if (mapping.length === 1) {
            return { targetModel: mapping[0] };
          }
          const counter = this.roundRobinCounters.get(rawModel) || 0;
          const chosen = mapping[counter % mapping.length];
          if (advanceCounter) {
            this.roundRobinCounters.set(rawModel, counter + 1);
          }
          return { targetModel: chosen };
        }
        if (typeof mapping === 'object' && mapping !== null) {
          if (Array.isArray(mapping.targets) && mapping.targets.length > 0) {
            if (mapping.targets.length === 1) {
              return { targetModel: mapping.targets[0], strategy: mapping.strategy };
            }
            const counter = this.roundRobinCounters.get(rawModel) || 0;
            const chosen = mapping.targets[counter % mapping.targets.length];
            if (advanceCounter) {
              this.roundRobinCounters.set(rawModel, counter + 1);
            }
            return { targetModel: chosen, strategy: mapping.strategy };
          }
          if (mapping.target) {
            return {
              targetModel: mapping.target,
              strategy: mapping.strategy
            };
          }
        }
      }
    }
    return { targetModel: rawModel.replace(/^models\//, '') };
  }

  /**
   * Dynamically resolves raw model aliases against config.modelMappings
   */
  public getCleanModelName(rawModel: string): string {
    return this.getModelMappingInfo(rawModel, false).targetModel;
  }

  /**
   * Preprocesses Claude requests intended for upstream Direct Mode without protocol translation.
   * Runs model mapping (preserving -high), cleans/injects system prompt,
   * filters historical ephemeral messages without inline system conversion, and filters ignored tools.
   */
  public preprocessClaudeDirectRequest(
    claudeBody: ClaudeRequest,
    preResolvedMapping?: { targetModel: string; strategy?: SchedulingStrategy }
  ): {
    directRequest: ClaudeRequest;
    cleanModelName: string;
    strategy?: SchedulingStrategy;
    isStream: boolean;
  } {
    if (!claudeBody || !claudeBody.model) {
      throw { status: 400, message: "Missing required parameter: 'model'" };
    }

    const directRequest: ClaudeRequest = JSON.parse(JSON.stringify(claudeBody));

    const mappingInfo = preResolvedMapping || this.getModelMappingInfo(claudeBody.model, true);
    const cleanModelName = mappingInfo.targetModel || claudeBody.model.replace(/^models\//, '');
    const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
    if (thinkingInfo.isHigh) {
      directRequest.model = thinkingInfo.baseModel;
      directRequest.output_config = {
        ...(directRequest.output_config || {}),
        effort: 'high'
      };
    } else {
      directRequest.model = cleanModelName;
    }

    // Clean directRequest.system
    if (typeof directRequest.system === 'string') {
      const cleaned = this.cleanSystemContent(directRequest.system);
      if (cleaned === null || cleaned === '') {
        delete directRequest.system;
      } else {
        directRequest.system = cleaned;
      }
    } else if (Array.isArray(directRequest.system)) {
      const filteredBlocks = directRequest.system
        .map((block: any) => {
          if (typeof block === 'string') {
            const cleaned = this.cleanSystemContent(block);
            return cleaned === null ? null : cleaned;
          }
          if (block && typeof block === 'object') {
            if (typeof block.text === 'string') {
              const cleaned = this.cleanSystemContent(block.text);
              if (cleaned === null) return null;
              return { ...block, text: cleaned };
            }
            return block;
          }
          return block;
        })
        .filter((b: any) => b !== null);

      if (filteredBlocks.length === 0) {
        delete directRequest.system;
      } else {
        directRequest.system = filteredBlocks;
      }
    }

    // Append config.customSystemInstruction
    if (config.customSystemInstruction && config.customSystemInstruction.trim()) {
      const instruction = config.customSystemInstruction;
      if (Array.isArray(directRequest.system)) {
        directRequest.system.push({ type: 'text', text: instruction });
      } else if (typeof directRequest.system === 'string' && directRequest.system.length > 0) {
        directRequest.system = `${directRequest.system}\n\n${instruction}`;
      } else {
        directRequest.system = instruction;
      }
    }

    // Filter ephemeral messages
    if (Array.isArray(directRequest.messages)) {
      directRequest.messages = this.filterEphemeralMessages(directRequest.messages);
      directRequest.messages = this.slimHistoricalMessages(directRequest.messages);
    }

    // Convert inline system messages across both modes
    if (Array.isArray(directRequest.messages) && directRequest.messages.length > 0) {
      const tag = this.resolveInlineSystemTag();

      const wrapDirectSystemBlocks = (content: any): any[] => {
        const blocks: any[] = [];
        if (typeof content === 'string') {
          const cleaned = this.cleanSystemContent(content);
          if (cleaned) {
            blocks.push({ type: 'text', text: `<${tag}>\n${cleaned}\n</${tag}>` });
          }
        } else if (Array.isArray(content)) {
          for (const block of content) {
            const isTextBlock = typeof block === 'string' || block?.type === 'text' || typeof block?.text === 'string';
            if (isTextBlock) {
              const text = typeof block === 'string' ? block : (block.text || '');
              if (text) {
                const cleaned = this.cleanSystemContent(text);
                if (cleaned) {
                  blocks.push({ type: 'text', text: `<${tag}>\n${cleaned}\n</${tag}>` });
                }
              }
            } else if (block) {
              blocks.push(block);
            }
          }
        }
        return blocks;
      };

      const normalizeDirectUserBlocks = (content: any): any[] => {
        if (typeof content === 'string') {
          return content !== '' ? [{ type: 'text', text: content }] : [];
        }
        if (Array.isArray(content)) {
          return content.filter((b: any) => b !== null && b !== undefined);
        }
        return [];
      };

      const convertedMessages: any[] = [];
      let pendingUserSegment: {
        systemBlocks: any[];
        userBlocks: any[];
        rawUserMessages: any[];
      } | null = null;

      const flushUserSegment = () => {
        if (!pendingUserSegment) return;
        const { systemBlocks, userBlocks, rawUserMessages } = pendingUserSegment;
        if (systemBlocks.length === 0 && rawUserMessages.length === 1) {
          convertedMessages.push(rawUserMessages[0]);
        } else if (systemBlocks.length + userBlocks.length > 0) {
          let mergedContent: any[];
          if (config.systemRoleToInstruction) {
            mergedContent = [...systemBlocks, ...userBlocks];
          } else {
            const toolResultBlocks = userBlocks.filter(
              (b: any) => b && typeof b === 'object' && b.type === 'tool_result'
            );
            const normalUserBlocks = userBlocks.filter(
              (b: any) => !(b && typeof b === 'object' && b.type === 'tool_result')
            );
            mergedContent = [...toolResultBlocks, ...systemBlocks, ...normalUserBlocks];
          }
          convertedMessages.push({
            role: 'user',
            content: mergedContent
          });
        }
        pendingUserSegment = null;
      };

      for (const msg of directRequest.messages) {
        if (!msg) continue;
        if (msg.role === 'assistant') {
          flushUserSegment();
          convertedMessages.push(msg);
        } else if (msg.role === 'system') {
          if (!pendingUserSegment) {
            pendingUserSegment = { systemBlocks: [], userBlocks: [], rawUserMessages: [] };
          }
          pendingUserSegment.systemBlocks.push(...wrapDirectSystemBlocks(msg.content));
        } else {
          // role === 'user' (or any other non-assistant role)
          if (!pendingUserSegment) {
            pendingUserSegment = { systemBlocks: [], userBlocks: [], rawUserMessages: [] };
          }
          pendingUserSegment.rawUserMessages.push(msg);
          pendingUserSegment.userBlocks.push(...normalizeDirectUserBlocks(msg.content));
        }
      }
      flushUserSegment();

      directRequest.messages = convertedMessages;
    }

    // Filter ignored tools
    if (Array.isArray(directRequest.tools) && Array.isArray(config.ignoredTools) && config.ignoredTools.length > 0) {
      const ignoredSet = new Set(
        config.ignoredTools.map(t => (t || '').trim().toLowerCase()).filter(Boolean)
      );
      if (ignoredSet.size > 0) {
        directRequest.tools = directRequest.tools.filter((tool: any) => {
          const toolName = (tool?.name || tool?.function?.name || '').trim().toLowerCase();
          return !ignoredSet.has(toolName);
        });
        if (directRequest.tools.length === 0) {
          delete directRequest.tools;
        }
      }
    }

    return {
      directRequest,
      cleanModelName,
      strategy: mappingInfo.strategy,
      isStream: Boolean(directRequest.stream)
    };
  }

  public _convertSchemaToGemini(obj: any, isResponseSchema: boolean = false, isProperties: boolean = false): any {
    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item: any) => this._convertSchemaToGemini(item, isResponseSchema, false));
    }

    if (isProperties) {
      const propsResult: Record<string, any> = {};
      for (const propName of Object.keys(obj)) {
        if (obj[propName] && typeof obj[propName] === "object") {
          propsResult[propName] = this._convertSchemaToGemini(obj[propName], isResponseSchema, false);
        }
      }
      return propsResult;
    }

    const ALLOWED_SCHEMA_KEYS = new Set([
      "type",
      "description",
      "properties",
      "required",
      "items",
      "enum",
      "nullable"
    ]);

    const result: any = {};

    // 1. Handle const -> enum + inferred type
    if (obj.const !== undefined) {
      if (obj.enum === undefined) {
        result.enum = isResponseSchema ? [String(obj.const)] : [obj.const];
      }
      if (obj.type === undefined) {
        if (isResponseSchema || typeof obj.const === "string") {
          result.type = "STRING";
        } else if (typeof obj.const === "number") {
          result.type = Number.isInteger(obj.const) ? "INTEGER" : "NUMBER";
        } else if (typeof obj.const === "boolean") {
          result.type = "BOOLEAN";
        } else if (Array.isArray(obj.const)) {
          result.type = "ARRAY";
        } else if (typeof obj.const === "object" && obj.const !== null) {
          result.type = "OBJECT";
        }
      }
    }

    // 2. Preserve exclusiveMinimum / exclusiveMaximum constraint hints in description
    if (obj.exclusiveMinimum !== undefined || obj.exclusiveMaximum !== undefined) {
      const clauses: string[] = [];
      if (obj.exclusiveMinimum !== undefined) {
        clauses.push(`must be > ${obj.exclusiveMinimum}`);
      }
      if (obj.exclusiveMaximum !== undefined) {
        clauses.push(`must be < ${obj.exclusiveMaximum}`);
      }
      if (clauses.length > 0) {
        result.description = obj.description
          ? `${obj.description} (${clauses.join(", ")})`
          : `(${clauses.join(", ")})`;
      }
    }

    // 3. Flatten anyOf / oneOf
    const rawVariants = Array.isArray(obj.anyOf)
      ? obj.anyOf
      : Array.isArray(obj.oneOf)
      ? obj.oneOf
      : null;

    if (rawVariants) {
      const hasNull = rawVariants.some(
        (v: any) => v && (v.type === "null" || v.type === "NULL" || v.const === null)
      );
      const nonNullVariants = rawVariants.filter(
        (v: any) => v && v.type !== "null" && v.type !== "NULL" && v.const !== null
      );

      if (hasNull) {
        result.nullable = true;
      }

      // Check if all non-null variants represent enum / const choices
      const collectedEnums: any[] = [];
      let allEnumOrConst = nonNullVariants.length > 0;
      for (const v of nonNullVariants) {
        if (Array.isArray(v.enum)) {
          for (const val of v.enum) {
            if (!collectedEnums.includes(val)) {
              collectedEnums.push(val);
            }
          }
        } else if (v.const !== undefined) {
          if (!collectedEnums.includes(v.const)) {
            collectedEnums.push(v.const);
          }
        } else {
          allEnumOrConst = false;
        }
      }

      if (allEnumOrConst && collectedEnums.length > 0) {
        result.type = "STRING";
        result.enum = collectedEnums.map((val: any) => String(val));
      } else if (nonNullVariants.length >= 1) {
        const converted = this._convertSchemaToGemini(nonNullVariants[0], isResponseSchema, false);
        if (converted && typeof converted === "object") {
          for (const k of Object.keys(converted)) {
            if (ALLOWED_SCHEMA_KEYS.has(k) && result[k] === undefined) {
              result[k] = converted[k];
            }
          }
        }
      }
    }

    // 4. Process whitelisted fields from obj
    for (const key of Object.keys(obj)) {
      if (!ALLOWED_SCHEMA_KEYS.has(key)) {
        logger.debug(`[Translator] [Schema Sanitization] Stripping unsupported JSON Schema key '${key}' from parameter object.`);
        continue;
      }

      if (key === "description") {
        if (result.description === undefined && typeof obj.description === "string") {
          result.description = obj.description;
        }
      } else if (key === "nullable") {
        if (typeof obj.nullable === "boolean") {
          result.nullable = obj.nullable;
        }
      } else if (key === "type") {
        if (Array.isArray(obj.type)) {
          const types = obj.type;
          const nonNullTypes = types.filter((t: any) => String(t).toLowerCase() !== "null");
          const hasNull = types.some((t: any) => String(t).toLowerCase() === "null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullTypes.length >= 1) {
            result.type = String(nonNullTypes[0]).toUpperCase();
          } else {
            result.type = "STRING";
          }
        } else if (typeof obj.type === "string") {
          if (obj.type.toLowerCase() === "null") {
            result.nullable = true;
            result.type = "STRING";
          } else {
            result.type = obj.type.toUpperCase();
          }
        }
      } else if (key === "enum") {
        if (Array.isArray(obj.enum)) {
          result.enum = isResponseSchema ? obj.enum.map(String) : obj.enum;
          if (!result.type) {
            result.type = "STRING";
          }
        } else if (obj.enum !== undefined && obj.enum !== null) {
          result.enum = [String(obj.enum)];
          if (!result.type) {
            result.type = "STRING";
          }
        }
      } else if (key === "properties") {
        if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
          result.properties = this._convertSchemaToGemini(obj.properties, isResponseSchema, true);
        }
      } else if (key === "required") {
        if (Array.isArray(obj.required)) {
          const validRequired = obj.required.filter((r: any) => typeof r === "string");
          if (validRequired.length > 0) {
            result.required = validRequired;
          }
        }
      } else if (key === "items") {
        if (obj.items && typeof obj.items === "object") {
          if (Array.isArray(obj.items)) {
            result.items = obj.items.length > 0
              ? this._convertSchemaToGemini(obj.items[0], isResponseSchema, false)
              : { type: "STRING" };
          } else {
            result.items = this._convertSchemaToGemini(obj.items, isResponseSchema, false);
          }
        }
      }
    }

    // 5. Default missing type to uppercase (OBJECT if properties exist, ARRAY if items exist, otherwise STRING)
    if (!result.type || typeof result.type !== "string") {
      if (result.properties !== undefined) {
        result.type = "OBJECT";
      } else if (result.items !== undefined) {
        result.type = "ARRAY";
      } else {
        result.type = "STRING";
        if (result.description && typeof result.description === "string") {
          if (/NOT\s+as\s+a\s+JSON[- ]encoded\s+string/i.test(result.description)) {
            result.description = result.description.replace(
              /NOT\s+as\s+a\s+JSON[- ]encoded\s+string/gi,
              "as a valid JSON-encoded string"
            ) + " (Note: Pass arrays/objects as a valid JSON-encoded string)";
          }
        }
      }
    } else {
      result.type = result.type.toUpperCase();
    }

    // 6. Handle nested empty OBJECT schemas by injecting _placeholder property
    if (result.type === "OBJECT") {
      if (!result.properties || typeof result.properties !== "object" || Object.keys(result.properties).length === 0) {
        result.properties = {
          _placeholder: { type: "STRING" }
        };
      }
      if (Array.isArray(result.required)) {
        const filteredReq = result.required.filter((r: string) => r in result.properties);
        if (filteredReq.length > 0) {
          result.required = filteredReq;
        } else {
          delete result.required;
        }
      }
    }

    // 7. Ensure ARRAY schemas always have items defined
    if (result.type === "ARRAY" && !result.items) {
      result.items = { type: "STRING" };
    }

    return result;
  }

  /**
   * Extracts Gemini inlineData part from a Claude media block (image, document, or base64 source).
   */
  private _extractMediaPart(item: any): GeminiPart | null {
    if (!item || typeof item !== 'object') return null;

    if ((item.type === 'image' || item.type === 'document') && item.source) {
      const mimeType = item.source.media_type || 'application/octet-stream';
      const data = item.source.data;
      if (data) {
        return { inlineData: { mimeType, data } };
      }
    }

    if (item.source && item.source.data && item.source.media_type) {
      return { inlineData: { mimeType: item.source.media_type, data: item.source.data } };
    }

    return null;
  }

  /**
   * Extracts a deduplication key from system message content using the first line or first 50 chars.
   */
  private _getSystemMessagePrefixKey(content: any): string {
    let rawText = '';
    if (typeof content === 'string') {
      rawText = content;
    } else if (Array.isArray(content)) {
      rawText = content
        .map((b: any) => (typeof b === 'string' ? b : b && b.text ? b.text : ''))
        .filter(Boolean)
        .join('\n');
    }
    const lines = rawText.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines[0].substring(0, 50);
    }
    return rawText.trim().substring(0, 50);
  }

  /**
   * Deduplicates array of system messages by prefix key, retaining only the latest entry for each prefix.
   */
  public deduplicateSystemMessages(messages: any[]): any[] {
    const systemMsgs = messages.filter(m => m && m.role === 'system');
    const latestByPrefix = new Map<string, any>();

    for (const msg of systemMsgs) {
      const key = this._getSystemMessagePrefixKey(msg.content);
      latestByPrefix.set(key, msg);
    }

    return Array.from(latestByPrefix.values());
  }

  /**
   * Extracts raw text from message content (string or array of text blocks).
   */
  public _getNormalizedTextContent(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((b: any) => {
          if (typeof b === 'string') return b;
          if (b && b.type === 'text') return b.text || '';
          return b?.text || '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return '';
  }

  /**
   * Filters historical ephemeral/temporary messages prior to the last user turn.
   */
  public filterEphemeralMessages(messages: any[]): any[] {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return messages || [];
    }

    const userPatterns = (config.ephemeralUserMessages || []).map(s => s.trim()).filter(Boolean);
    const systemPatterns = (config.ephemeralSystemMessages || []).map(s => s.trim()).filter(Boolean);

    if (userPatterns.length === 0 && systemPatterns.length === 0) {
      return messages;
    }

    // Find index of the last user message
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) {
      return messages;
    }

    return messages.map((msg, index) => {
      if (!msg) return msg;
      if (index < lastUserIndex) {
        if (msg.role === 'system' && systemPatterns.length > 0) {
          const normalizedText = this._getNormalizedTextContent(msg.content);
          if (systemPatterns.some(pattern => normalizedText.includes(pattern))) {
            logger.info(`[Translator] Filtering historical ephemeral system message at index ${index}: "${normalizedText.substring(0, 40)}..."`);
            return null;
          }
        } else if (msg.role === 'user' && userPatterns.length > 0) {
          if (Array.isArray(msg.content) && msg.content.length > 1) {
            const filteredContent = msg.content.filter((block: any) => {
              let blockText = '';
              if (typeof block === 'string') {
                blockText = block.trim();
              } else if (block && block.type === 'text') {
                blockText = (block.text || '').trim();
              } else if (block && block.text) {
                blockText = String(block.text).trim();
              }

              if (blockText && userPatterns.some(pattern => blockText.includes(pattern))) {
                logger.info(`[Translator] Filtering historical ephemeral user block at msg index ${index}: "${blockText.substring(0, 40)}..."`);
                return false;
              }
              return true;
            });

            // Guard: If filtering would remove ALL blocks, keep original content
            if (filteredContent.length > 0) {
              return { ...msg, content: filteredContent };
            }
          }
        }
      }
      return msg;
    }).filter(Boolean);
  }

  public cleanSystemContent(rawText: string): string | null {
    if (!rawText) return null;
    if (!config.stripSystemFingerprints) return rawText;

    // Drop entire block if it starts with x-anthropic-billing-header
    if (/^\s*x-anthropic-billing-header/i.test(rawText)) {
      logger.info('[Translator] Dropping system content block starting with x-anthropic-billing-header');
      return null;
    }

    return rawText;
  }

  public findLastHumanTurnIndex(messages: ClaudeMessage[]): number {
    if (!Array.isArray(messages) || messages.length === 0) {
      return -1;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg || msg.role !== 'user') continue;
      if (typeof msg.content === 'string') {
        return i;
      }
      if (Array.isArray(msg.content)) {
        const hasNonToolResult = msg.content.some(
          (block: any) =>
            typeof block === 'string' ||
            (block && typeof block === 'object' && block.type !== 'tool_result')
        );
        if (hasNonToolResult) {
          return i;
        }
      }
    }
    return -1;
  }

  public slimHistoricalMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }
    const clonedMessages: ClaudeMessage[] = JSON.parse(JSON.stringify(messages));
    const lastHumanIndex = this.findLastHumanTurnIndex(clonedMessages);
    if (lastHumanIndex <= 0) {
      return clonedMessages;
    }

    return clonedMessages.map((msg, index) => {
      if (!msg || index >= lastHumanIndex || msg.role !== 'assistant' || !Array.isArray(msg.content)) {
        return msg;
      }
      const filteredContent = msg.content.filter(
        (block: any) =>
          !(block && typeof block === 'object' && (block.type === 'thinking' || block.type === 'redacted_thinking'))
      );
      return {
        ...msg,
        content: filteredContent.length > 0 ? filteredContent : [{ type: 'text', text: '...' }]
      };
    });
  }

  private resolveInlineSystemTag(): string {
    const configuredTag = (config.runtimeContextTag || '').trim();
    if (config.systemRoleToInstruction) {
      return configuredTag || 'system-context';
    }
    if (configuredTag && configuredTag !== 'system-context') {
      return configuredTag;
    }
    return 'system-reminder';
  }

  public translateClaudeToGoogle(
    claudeBody: ClaudeRequest,
    preResolvedMapping?: { targetModel: string; strategy?: SchedulingStrategy }
  ) {
    const rawModel = claudeBody.model;

    if (!rawModel) {
      throw { status: 400, message: "Missing required parameter: 'model'" };
    }

    const mappingInfo = preResolvedMapping || this.getModelMappingInfo(rawModel, true);
    let cleanModelName = mappingInfo.targetModel;
    if (!cleanModelName) {
      cleanModelName = rawModel.replace(/^models\//, '');
    }
    const mappingStrategy = mappingInfo.strategy;

    let systemInstruction: any = null;

    const appendSystemContent = (content: any) => {
      let text = "";
      if (typeof content === "string") {
        const cleaned = this.cleanSystemContent(content);
        if (cleaned) text = cleaned;
      } else if (Array.isArray(content)) {
        text = content
          .map((block: any) => {
            let blockText = "";
            if (typeof block === "string") blockText = block;
            else if (block && block.type === "text") blockText = block.text || "";
            else if (block?.text) blockText = block.text || "";

            return this.cleanSystemContent(blockText);
          })
          .filter(Boolean)
          .join("\n");
      }

      if (!text) return;

      if (systemInstruction) {
        systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n\n${text}`;
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

    if (config.customSystemInstruction) {
      appendSystemContent(config.customSystemInstruction);
    }

    const tag = this.resolveInlineSystemTag();

    const wrapSystemMessageContent = (content: any): GeminiPart[] => {
      const parts: GeminiPart[] = [];
      // const constraint = '[IMPORTANT: This context is strictly for your internal operational guidance. DO NOT quote, mention, explain, or output anything from this section in your final response or tool call explanations.]';
      if (typeof content === 'string') {
        const cleaned = this.cleanSystemContent(content);
        if (cleaned) {
          parts.push({ text: `<${tag}>\n${cleaned}\n</${tag}>` });
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          const isTextBlock = typeof block === 'string' || block?.type === 'text' || typeof block?.text === 'string';
          if (isTextBlock) {
            let blockText = typeof block === 'string' ? block : (block.text || '');
            if (blockText) {
              const cleaned = this.cleanSystemContent(blockText);
              if (cleaned) {
                parts.push({ text: `<${tag}>\n${cleaned}\n</${tag}>` });
              }
            }
          } else {
            parts.push(block);
          }
        }
      }
      return parts;
    };

    const inputMessages = claudeBody.messages && Array.isArray(claudeBody.messages)
      ? this.slimHistoricalMessages(this.filterEphemeralMessages(claudeBody.messages))
      : [];

    const contents: GeminiContent[] = [];
    const toolIdToNameMap = new Map<string, string>();

    const sanitizeParts = (rawParts: GeminiPart[]): GeminiPart[] => {
      const sanitized: GeminiPart[] = [];
      for (const part of rawParts) {
        if (!part || typeof part !== 'object') continue;
        // Strip empty text parts (text: "")
        if (
          part.text !== undefined &&
          part.text === '' &&
          !part.thought &&
          !part.thoughtSignature &&
          !part.functionCall &&
          !part.functionResponse &&
          !part.inlineData
        ) {
          continue;
        }
        if (part.functionCall) {
          const validArgs =
            part.functionCall.args &&
            typeof part.functionCall.args === 'object' &&
            !Array.isArray(part.functionCall.args)
              ? part.functionCall.args
              : {};
          part.functionCall = {
            ...part.functionCall,
            args: validArgs
          };
        }
        sanitized.push(part);
      }
      return sanitized;
    };

    const parseUserMessageParts = (msg: any): GeminiPart[] => {
      const parts: GeminiPart[] = [];
      if (typeof msg.content === 'string') {
        if (msg.content !== '') {
          parts.push({ text: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (!block) continue;
          if (typeof block === 'string') {
            if (block !== '') {
              parts.push({ text: block });
            }
          } else if (block.type === 'text') {
            if (typeof block.text === 'string' && block.text !== '') {
              parts.push({ text: block.text });
            }
          } else if (block.type === 'image' || block.type === 'document') {
            const mediaPart = this._extractMediaPart(block);
            if (mediaPart) {
              parts.push(mediaPart);
            }
          } else if (block.type === 'thinking') {
            const thinkingText = typeof block.thinking === 'string' ? block.thinking : '';
            const signature = typeof block.signature === 'string' && block.signature !== '' ? block.signature : undefined;
            if (thinkingText !== '' || signature) {
              const thoughtPart: GeminiPart = {
                thought: true,
                text: thinkingText
              };
              if (signature) {
                thoughtPart.thoughtSignature = signature;
              }
              parts.push(thoughtPart);
            }
          } else if (block.type === 'tool_use') {
            toolIdToNameMap.set(block.id, block.name);
            const geminiCallId = block.id && block.id.startsWith('toolu_g_') ? block.id.substring(8) : block.id;
            const safeArgs =
              block.input && typeof block.input === 'object' && !Array.isArray(block.input)
                ? block.input
                : {};
            parts.push({
              functionCall: {
                name: block.name,
                args: safeArgs,
                id: geminiCallId
              },
              thoughtSignature: BYPASS_SIGNATURE
            });
          } else if (block.type === 'tool_result') {
            const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
            const geminiResponseId = block.tool_use_id && block.tool_use_id.startsWith('toolu_g_') ? block.tool_use_id.substring(8) : block.tool_use_id;

            let resultText: any = block.content;
            const imageParts: any[] = [];

            if (Array.isArray(block.content)) {
              const textCollector: string[] = [];
              for (const item of block.content) {
                if (typeof item === 'string') {
                  textCollector.push(item);
                } else if (item && item.type === 'text') {
                  if (item.text) textCollector.push(item.text);
                } else {
                  const mediaPart = this._extractMediaPart(item);
                  if (mediaPart) {
                    imageParts.push(mediaPart);
                  }
                }
              }
              resultText = textCollector.join('\n');
            }

            const isError = block.is_error === true;
            const responseBody: any = isError
              ? { error: resultText !== undefined && resultText !== null && resultText !== '' ? resultText : 'Tool execution failed' }
              : { result: resultText !== undefined && resultText !== null ? resultText : '' };

            const functionResponseObj: any = {
              name: matchedName,
              response: responseBody,
              id: geminiResponseId
            };

            parts.push({
              functionResponse: functionResponseObj
            });

            if (imageParts.length > 0) {
              parts.push(...imageParts);
            }
          }
        }
      }
      return sanitizeParts(parts);
    };

    if (inputMessages.length > 0) {
      let pendingUserSegment: { systemParts: GeminiPart[]; userParts: GeminiPart[] } | null = null;

      const flushUserSegment = () => {
        if (!pendingUserSegment) return;
        const toolResponseParts = pendingUserSegment.userParts.filter(
          (p: GeminiPart) => Boolean(p && p.functionResponse)
        );
        const normalUserParts = pendingUserSegment.userParts.filter(
          (p: GeminiPart) => !Boolean(p && p.functionResponse)
        );

        if (toolResponseParts.length > 0) {
          const cleanToolParts = sanitizeParts(toolResponseParts);
          if (cleanToolParts.length > 0) {
            contents.push({
              role: 'user',
              parts: cleanToolParts
            });
          }
          const followUpParts = sanitizeParts([
            ...pendingUserSegment.systemParts,
            ...normalUserParts
          ]);
          if (followUpParts.length > 0) {
            contents.push({
              role: 'user',
              parts: followUpParts
            });
          }
        } else {
          const cleanParts = sanitizeParts([
            ...pendingUserSegment.systemParts,
            ...normalUserParts
          ]);
          if (cleanParts.length > 0) {
            contents.push({
              role: 'user',
              parts: cleanParts
            });
          }
        }
        pendingUserSegment = null;
      };

      for (const msg of inputMessages) {
        if (msg.role === 'assistant') {
          flushUserSegment();
          const modelParts = parseUserMessageParts(msg);
          if (modelParts.length > 0) {
            contents.push({
              role: 'model',
              parts: modelParts
            });
          }
        } else if (msg.role === 'system') {
          if (!pendingUserSegment) {
            pendingUserSegment = { systemParts: [], userParts: [] };
          }
          pendingUserSegment.systemParts.push(...wrapSystemMessageContent(msg.content));
        } else {
          // role === 'user' (or any other non-assistant role)
          if (!pendingUserSegment) {
            pendingUserSegment = { systemParts: [], userParts: [] };
          }
          pendingUserSegment.userParts.push(...parseUserMessageParts(msg));
        }
      }
      flushUserSegment();
    }

    // Generic consecutive same-role blocks merging to prevent alternating role constraint violations
    const mergedContents: GeminiContent[] = [];
    for (const content of contents) {
      const cleanParts = sanitizeParts(content.parts);
      if (cleanParts.length === 0) continue;
      const prev = mergedContents[mergedContents.length - 1];
      if (prev && prev.role === content.role) {
        const prevHasFunc = prev.parts.some(p => Boolean(p && p.functionResponse));
        const currHasFunc = cleanParts.some(p => Boolean(p && p.functionResponse));
        if (prevHasFunc || currHasFunc) {
          const prevOnlyFunc = prev.parts.every(p => Boolean(p && p.functionResponse));
          const currOnlyFunc = cleanParts.every(p => Boolean(p && p.functionResponse));
          if (prevOnlyFunc && currOnlyFunc) {
            prev.parts.push(...cleanParts);
          } else {
            mergedContents.push({
              role: content.role,
              parts: cleanParts
            });
          }
        } else {
          prev.parts.push(...cleanParts);
        }
      } else {
        mergedContents.push({
          role: content.role,
          parts: cleanParts
        });
      }
    }

    const googleRequest: GeminiRequest = { contents: mergedContents };
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
    if (claudeBody.top_k !== undefined) {
      generationConfig.topK = claudeBody.top_k;
    }
    if (Array.isArray(claudeBody.stop_sequences) && claudeBody.stop_sequences.length > 0) {
      const validStopSequences = Array.from(
        new Set(
          claudeBody.stop_sequences
            .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        )
      );
      if (validStopSequences.length > 0) {
        generationConfig.stopSequences = validStopSequences;
      }
    }
    if (Object.keys(generationConfig).length > 0) {
      googleRequest.generationConfig = generationConfig;
    }

    if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
      const ignoredToolsList = config.ignoredTools || [];
      const ignoredSet = new Set(ignoredToolsList.map((t: string) => String(t || '').trim().toLowerCase()).filter(Boolean));

      const validTools = claudeBody.tools.filter((tool: any) => {
        if (!tool || typeof tool !== 'object') return false;
        const name = String(tool.name || '').trim().toLowerCase();
        return name && !ignoredSet.has(name);
      });

      if (validTools.length > 0) {
        googleRequest.tools = [{
          functionDeclarations: validTools.map((tool: any) => {
            const declaration: any = {
              name: tool.name
            };
            if (tool.description !== undefined) {
              declaration.description = tool.description;
            }

            const schema = tool.input_schema;
            const hasProperties =
              schema &&
              typeof schema === 'object' &&
              schema.properties &&
              typeof schema.properties === 'object' &&
              !Array.isArray(schema.properties) &&
              Object.keys(schema.properties).length > 0;

            if (hasProperties) {
              declaration.parameters = this._convertSchemaToGemini(schema);
            }

            return declaration;
          })
        }];
      }
    }

    return {
      googleRequest,
      cleanModelName,
      strategy: mappingStrategy,
      isStream: claudeBody.stream === true
    };
  }

  /**
   * Recursively traverses an object or array and strips all '_placeholder' properties.
   * If a parent container becomes empty after deletion, it is preserved as an empty object/array.
   */
  public _removePlaceholder(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item: any) => this._removePlaceholder(item));
    }

    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (key === '_placeholder') {
        continue;
      }
      cleaned[key] = this._removePlaceholder(obj[key]);
    }
    return cleaned;
  }

  /**
   * Cleans arguments by recursively removing '_placeholder' fields,
   * restoring JSON-encoded strings to structured objects/arrays for untyped schema properties,
   * and coercing argument types to match the expected schema definition.
   */
  public _cleanAndCoerceArguments(toolName: string, rawArgs: Record<string, any>, tools?: any[]): Record<string, any> {
    const cleanedArgs = this._removePlaceholder(rawArgs);
    if (!cleanedArgs || typeof cleanedArgs !== 'object') {
      return cleanedArgs || {};
    }

    if (!tools || !Array.isArray(tools)) {
      return cleanedArgs;
    }

    // Find the original tool schema definition
    const originalTool = tools.find((t: any) => t && t.name === toolName);
    if (!originalTool || !originalTool.input_schema || typeof originalTool.input_schema !== 'object') {
      return cleanedArgs;
    }

    const properties = originalTool.input_schema.properties;
    if (!properties || typeof properties !== 'object') {
      return cleanedArgs;
    }

    const coercedArgs = { ...cleanedArgs };

    for (const propName of Object.keys(properties)) {
      const propSchema = properties[propName];
      if (!propSchema || typeof propSchema !== 'object') continue;

      const rawValue = coercedArgs[propName];
      if (rawValue === undefined || rawValue === null) continue;

      // 1. Untyped schema property: attempt to restore JSON-encoded string to object/array
      if (!propSchema.type) {
        if (typeof rawValue === 'string') {
          const trimmed = rawValue.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed === 'object' && parsed !== null) {
                logger.info(`[Translator] [Coercion] Restoring untyped JSON-encoded string property '${propName}' of tool '${toolName}' to structured object/array.`);
                coercedArgs[propName] = this._removePlaceholder(parsed);
                continue;
              }
            } catch (e: any) {
              // Parsing failed, preserve original string
            }
          }
        }
        continue;
      }

      // 2. Typed schema properties: coerce types based on expectedTypes
      // Get expected types (could be a string or array of strings, e.g. ['string', 'null'])
      let expectedTypes: string[] = [];
      if (typeof propSchema.type === 'string') {
        expectedTypes = [propSchema.type];
      } else if (Array.isArray(propSchema.type)) {
        expectedTypes = propSchema.type.filter((t: any) => typeof t === 'string');
      }

      const actualType = typeof rawValue;

      // Coerce if string is expected but got number or boolean
      if (expectedTypes.includes('string') && actualType !== 'string') {
        logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from ${actualType} to string. Value: ${rawValue}`);
        coercedArgs[propName] = String(rawValue);
      }

      // Coerce if integer/number is expected but got string
      else if ((expectedTypes.includes('number') || expectedTypes.includes('integer')) && actualType === 'string') {
        const parsed = Number(rawValue);
        if (!isNaN(parsed)) {
          logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from string to number. Value: '${rawValue}' -> ${parsed}`);
          coercedArgs[propName] = parsed;
        }
      }

      // Coerce if boolean is expected but got string or number
      else if (expectedTypes.includes('boolean') && actualType !== 'boolean') {
        let coercedBool: boolean | undefined;
        if (actualType === 'string') {
          if (rawValue.toLowerCase() === 'true') coercedBool = true;
          if (rawValue.toLowerCase() === 'false') coercedBool = false;
        } else if (actualType === 'number') {
          if (rawValue === 1) coercedBool = true;
          if (rawValue === 0) coercedBool = false;
        }

        if (coercedBool !== undefined) {
          logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from ${actualType} to boolean. Value: ${rawValue} -> ${coercedBool}`);
          coercedArgs[propName] = coercedBool;
        }
      }
    }

    return coercedArgs;
  }

  /**
   * Coerces Gemini's returned function call arguments to match the types expected
   * by the client's original JSON schema definition.
   * Backwards compatible delegate to _cleanAndCoerceArguments.
   */
  public _coerceArguments(toolName: string, args: Record<string, any>, tools?: any[]): Record<string, any> {
    return this._cleanAndCoerceArguments(toolName, args, tools);
  }

  public convertGoogleToClaudeNonStream(googleResponse: any, modelName: string, tools?: any[]) {
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
            signature: part.thoughtSignature || BYPASS_SIGNATURE
          });
        } else if (part.text) {
          content.push({
            type: 'text',
            text: part.text
          });
        } else if (part.functionCall) {
          const callId = part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_fake_${Math.random().toString(36).substring(2, 11)}`;
          const coercedArgs = this._cleanAndCoerceArguments(part.functionCall.name, part.functionCall.args || {}, tools);
          content.push({
            id: callId,
            type: 'tool_use',
            name: part.functionCall.name,
            input: coercedArgs
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

    const trimmed = googleChunk.trim();
    if (streamState.hasEmittedMessageStop) return null;
    // Ignore SSE comment/heartbeat lines (e.g. ": ping") and standard non-data SSE fields
    if (trimmed.startsWith(':')) return null;
    if (/^(event|id|retry):/i.test(trimmed)) return null;

    const tools = streamState.tools;

    let jsonString = trimmed;
    if (jsonString.startsWith('data:')) {
      jsonString = jsonString.substring(5).trim();
    }
    if (jsonString === '[DONE]') return null;

    let googleResponse;
    try {
      googleResponse = JSON.parse(jsonString);
    } catch (e: any) {
      logger.warn(`[Translator] [Stream Parse Error] Failed to parse raw Gemini streaming chunk JSON: ${e.message}`, { rawChunk: jsonString });
      return null;
    }

    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata;
    const events: any[] = [];

    if (!streamState.messageId) {
      streamState.messageId = `msg_stream_${Math.random().toString(36).substring(2, 11)}`;
      streamState.contentBlockIndex = 0;
    }
    if (modelName && !streamState.modelName) {
      streamState.modelName = modelName;
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
          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          if (!streamState.thinkingBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'thinking', thinking: '', signature: part.thoughtSignature || BYPASS_SIGNATURE }
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
          if (streamState.thinkingBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.thinkingBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          streamState.hasToolCalls = true;
          const callId = part.functionCall.id && part.functionCall.id.startsWith('toolu_')
            ? part.functionCall.id
            : (part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_stream_${Math.random().toString(36).substring(2, 11)}`);
          const coercedArgs = this._cleanAndCoerceArguments(part.functionCall.name, part.functionCall.args || {}, tools);
          // 1. Send content_block_start with empty input object
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: callId,
              name: part.functionCall.name,
              input: {}
            }
          });
          // 2. Send content_block_delta with input_json_delta format
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(coercedArgs)
            }
          });
          // 3. Send content_block_stop
          events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
          streamState.contentBlockIndex++;
        }
      }
    }

    if (usage) {
      streamState.cachedUsage = usage;
    }
    if (candidate?.finishReason) {
      streamState.cachedFinishReason = candidate.finishReason;
    }

    if (!streamState.hasEmittedMessageStop && streamState.cachedFinishReason && streamState.cachedUsage) {
      if (streamState.thinkingBlockStarted) {
        events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
        streamState.thinkingBlockStarted = false;
        streamState.contentBlockIndex++;
      }
      if (streamState.textBlockStarted) {
        events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
        streamState.textBlockStarted = false;
        streamState.contentBlockIndex++;
      }
      let stopReason = 'end_turn';
      if (streamState.cachedFinishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      } else if (streamState.hasToolCalls) {
        stopReason = 'tool_use';
      }
      events.push({
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: (streamState.cachedUsage.candidatesTokenCount || 0) + (streamState.cachedUsage.thoughtsTokenCount || 0) }
      });
      events.push({ type: 'message_stop' });
      streamState.hasEmittedMessageStop = true;
    }

    if (events.length === 0) return null;

    return events;
  }

  public flushRemainingStreamEvents(streamState: any, modelName?: string): any[] {
    const events: any[] = [];
    if (!streamState || streamState.hasEmittedMessageStop) return events;

    if (!streamState.messageStartSent) {
      if (!streamState.messageId) {
        streamState.messageId = `msg_stream_${Math.random().toString(36).substring(2, 11)}`;
        streamState.contentBlockIndex = 0;
      }
      events.push({
        type: 'message_start',
        message: {
          id: streamState.messageId,
          type: 'message',
          role: 'assistant',
          model: modelName || streamState.modelName || 'unknown',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: streamState.cachedUsage ? streamState.cachedUsage.promptTokenCount || 0 : 0,
            output_tokens: 0
          }
        }
      });
      streamState.messageStartSent = true;
    }

    if (streamState.thinkingBlockStarted) {
      events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
      streamState.thinkingBlockStarted = false;
      streamState.contentBlockIndex++;
    }

    if (streamState.textBlockStarted) {
      events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
      streamState.textBlockStarted = false;
      streamState.contentBlockIndex++;
    }

    if (!streamState.hasEmittedMessageStop) {
      let stopReason = 'end_turn';
      if (streamState.cachedFinishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      } else if (streamState.hasToolCalls) {
        stopReason = 'tool_use';
      }
      const effUsage = streamState.cachedUsage;
      const outputTokens = effUsage
        ? (effUsage.candidatesTokenCount || 0) + (effUsage.thoughtsTokenCount || 0)
        : 0;
      events.push({
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens }
      });
      events.push({ type: 'message_stop' });
      streamState.hasEmittedMessageStop = true;
    }

    return events;
  }

  public normalizeError(error: any): NormalizedErrorResponse {
    let status = error?.status || 500;
    let type = 'api_error';
    const rawMessage = error?.message || (typeof error === 'string' ? error : 'Internal Server Error');
    let message = rawMessage;

    // Detect HTML responses (e.g. Cloudflare error pages)
    const isHtml = typeof rawMessage === 'string' && /<html|<!doctype|<title/i.test(rawMessage);
    const logErr = isHtml ? `HTML error page (status: ${status})` : (rawMessage.length > 500 ? rawMessage.slice(0, 500) + '...' : rawMessage);
    logger.error(`API Error: ${logErr}`);

    // Intercept 524 (Cloudflare origin timeout) or explicit 524 in error status/message
    const is524 = status === 524 ||
      (typeof rawMessage === 'string' && (
        /\b524\b/i.test(rawMessage) ||
        /error\s*code\s*524/i.test(rawMessage) ||
        /<title>\s*524\b/i.test(rawMessage) ||
        (isHtml && /a timeout occurred/i.test(rawMessage))
      ));

    if (is524) {
      status = 529;
      type = 'overloaded_error';
      message = 'Upstream gateway timed out (524). Service is temporarily overloaded, please retry.';
      return {
        status,
        headers: {
          'x-should-retry': 'true',
          'retry-after': '3'
        },
        payload: {
          type: 'error',
          error: {
            type,
            message
          }
        }
      };
    }

    if (isHtml) {
      const titleMatch = rawMessage.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : `HTTP ${status} Error`;
      message = `Upstream returned HTML error page: ${title}`;
    }

    if (status === 400 || status === 404) type = 'invalid_request_error';
    if (status === 401 || status === 403) {
      status = 502;
      type = 'api_error';
    }
    if (status === 429) {
      type = 'rate_limit_error';
      return {
        status,
        headers: {
          'x-should-retry': 'true',
          'retry-after': '5'
        },
        payload: {
          type: 'error',
          error: {
            type,
            message
          }
        }
      };
    }
    if (status === 529) {
      type = 'overloaded_error';
      return {
        status,
        headers: {
          'x-should-retry': 'true',
          'retry-after': '3'
        },
        payload: {
          type: 'error',
          error: {
            type,
            message
          }
        }
      };
    }

    return {
      status,
      payload: {
        type: 'error',
        error: {
          type,
          message
        }
      }
    };
  }
}

export default new ClaudeTranslator();
