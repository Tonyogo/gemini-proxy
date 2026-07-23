import translator from '../src/services/claudeTranslator';
import { config } from '../config/default';

describe('Claude to Gemini Request Translation', () => {
  it('throws a 400 error when model is completely missing', () => {
    const claudePayload = {
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    expect(() => translator.translateClaudeToGoogle(claudePayload)).toThrow("Missing required parameter: 'model'");
  });

  it('translates basic message requests', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-3.5-flash');
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });

  it('translates system prompts', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual('You are a helpful assistant');
  });

  it('translates system prompts with role user and combines messages system roles', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      system: 'This is the main system prompt',
      messages: [
        { role: 'system', content: 'This is a message system prompt' },
        { role: 'user', content: 'Hello' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    // Assert 1: systemInstruction role must be 'user' and only contain the base prompt
    expect(result.googleRequest.systemInstruction!.role).toEqual('user');
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual(
      'This is the main system prompt'
    );

    // Assert 2: The inline system message is converted to role 'user' and wrapped in tags and merged
    expect(result.googleRequest.contents.length).toEqual(1);

    // Combined message parts (was role: system merged into next role: user block)
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<runtime-context>\nThis is a message system prompt\n</runtime-context>'
    );

    // Second part of merged message (was role: user)
    expect(result.googleRequest.contents[0].parts[1].text).toEqual('Hello');
  });

  it('translates images', () => {
    const claudePayload = {
      model: 'gemini-3.1-flash-lite',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw0KGgoAAAANS...'
            }
          }
        ]
      }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-3.1-flash-lite');
    const parts = result.googleRequest.contents[0].parts;
    expect(parts[0].text).toEqual('What is this?');
    expect(parts[1].inlineData!.mimeType).toEqual('image/png');
    expect(parts[1].inlineData!.data).toEqual('iVBORw0KGgoAAAANS...');
  });

  it('correctly translates document (PDF) blocks in user messages to Gemini inlineData parts', () => {
    const claudeReq: any = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here is a document:' },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: 'JVBERi0xLjQK...'
              }
            }
          ]
        }
      ]
    };

    const { googleRequest } = translator.translateClaudeToGoogle(claudeReq);
    expect(googleRequest.contents).toHaveLength(1);
    expect(googleRequest.contents[0].parts).toHaveLength(2);
    expect(googleRequest.contents[0].parts[0]).toEqual({ text: 'Here is a document:' });
    expect(googleRequest.contents[0].parts[1]).toEqual({
      inlineData: {
        mimeType: 'application/pdf',
        data: 'JVBERi0xLjQK...'
      }
    });
  });

  it('correctly extracts document blocks inside tool_result to functionResponse.parts as inlineData', () => {
    const claudeReq: any = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'fetch_pdf',
              input: {}
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content: [
                { type: 'text', text: 'Fetched file output:' },
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: 'JVBERi0xLjQK...'
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    const { googleRequest } = translator.translateClaudeToGoogle(claudeReq);
    expect(googleRequest.contents).toHaveLength(2);
    const userTurn = googleRequest.contents[1];
    expect(userTurn.parts[0].functionResponse).toBeDefined();
    expect(userTurn.parts[0].functionResponse?.name).toBe('fetch_pdf');
    expect(userTurn.parts[0].functionResponse?.response?.result).toBe('Fetched file output:');
    expect(userTurn.parts[0].functionResponse?.parts).toHaveLength(1);
    expect(userTurn.parts[0].functionResponse?.parts?.[0]).toEqual({
      inlineData: {
        mimeType: 'application/pdf',
        data: 'JVBERi0xLjQK...'
      }
    });
  });
});

describe('Claude to Gemini Tools Schema Sanitization', () => {
  it('recursively cleans and translates Claude input schemas to Gemini-compliant structures', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Use the tool.' }],
      tools: [
        {
          name: 'get_weather',
          description: 'Gets current weather',
          input_schema: {
            type: 'object',
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              location: {
                type: 'string',
                description: 'The city name'
              },
              unit: {
                type: ['string', 'null'],
                enum: ['celsius', 'fahrenheit'],
                default: 'celsius'
              }
            },
            required: ['location']
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

    // Assert 1: Lowercase "object" is mapped to uppercase "OBJECT"
    expect(params.type).toEqual('OBJECT');

    // Assert 2: Blacklisted keywords ($schema, additionalProperties) must be recursively stripped
    expect(params.$schema).toBeUndefined();
    expect(params.additionalProperties).toBeUndefined();

    // Assert 3: properties location type string mapped to uppercase STRING
    expect(params.properties.location.type).toEqual('STRING');

    // Assert 4: Nullable types array ['string', 'null'] mapped to single type and nullable: true
    expect(params.properties.unit.type).toEqual('STRING');
    expect(params.properties.unit.nullable).toEqual(true);
  });
});

describe('Claude Tools Interaction Roundtrips (Complex and Multi-Turn)', () => {
  it('successfully resolves tool names and translates various types of tool_result content to Gemini', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_key_weather_01',
              name: 'get_weather',
              input: { location: 'San Francisco' }
            },
            {
              type: 'tool_use',
              id: 'toolu_key_calc_02',
              name: 'calculate_sum',
              input: { a: 5, b: 10 }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_weather_01',
              content: 'Sunny, 20 degrees'
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_calc_02',
              content: [
                { type: 'text', text: '15' }
              ]
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_unmapped_03',
              content: 'Fallback response'
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(2);

    const assistantBubble = result.googleRequest.contents[0];
    expect(assistantBubble.role).toEqual('model');
    expect(assistantBubble.parts[0].functionCall!.name).toEqual('get_weather');
    expect(assistantBubble.parts[0].functionCall!.id).toEqual('toolu_key_weather_01');
    expect(assistantBubble.parts[0].thoughtSignature).toEqual('context_engineering_is_the_way_to_go');

    expect(assistantBubble.parts[1].functionCall!.name).toEqual('calculate_sum');
    expect(assistantBubble.parts[1].functionCall!.id).toEqual('toolu_key_calc_02');
    expect(assistantBubble.parts[1].thoughtSignature).toEqual('context_engineering_is_the_way_to_go');

    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');
    expect(userBubble.parts.length).toEqual(3);

    expect(userBubble.parts[0].functionResponse!.name).toEqual('get_weather');
    expect(userBubble.parts[0].functionResponse!.response.result).toEqual('Sunny, 20 degrees');
    expect(userBubble.parts[0].functionResponse!.id).toEqual('toolu_key_weather_01');

    expect(userBubble.parts[1].functionResponse!.name).toEqual('calculate_sum');
    expect(userBubble.parts[1].functionResponse!.response.result).toEqual('15');
    expect(userBubble.parts[1].functionResponse!.id).toEqual('toolu_key_calc_02');

    expect(userBubble.parts[2].functionResponse!.name).toEqual('unknown_tool');
    expect(userBubble.parts[2].functionResponse!.response.result).toEqual('Fallback response');
    expect(userBubble.parts[2].functionResponse!.id).toEqual('toolu_key_unmapped_03');
  });

  it.skip('substitutes Launching skill tool_result content with subsequent text content (based on log.json)', () => {
    // Simulated Skill invocation payload:
    // 1. Assistant message with a Skill tool_use block
    // 2. User message containing the Skill tool_result AND the massive instructions text block
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_g_using_superpowers',
              name: 'Skill',
              input: { skill: 'superpowers:using-superpowers' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_g_using_superpowers',
              content: 'Launching skill: superpowers:using-superpowers'
            },
            {
              type: 'text',
              text: 'Base directory for this skill: /Users/yogo/... [Complete skill guide instructions here]'
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);

    // Verify 1: The conversation bubbles length (assistant model bubble + user tool response bubble) is 2
    expect(result.googleRequest.contents.length).toEqual(2);

    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');

    // Verify 2: Sibling text block is stripped and merged directly as the response content of the Skill function Response
    expect(userBubble.parts.length).toEqual(1); // Merged into 1 part!
    expect(userBubble.parts[0].functionResponse!.name).toEqual('Skill');
    expect(userBubble.parts[0].functionResponse!.id).toEqual('using_superpowers'); // Stripped prefix "toolu_g_"
    expect(userBubble.parts[0].functionResponse!.response.result).toEqual(
      'Base directory for this skill: /Users/yogo/... [Complete skill guide instructions here]'
    );
  });

  it('correctly extracts image blocks inside tool_result to functionResponse.parts as inlineData', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_g_take_screenshot',
              name: 'take_screenshot',
              input: {}
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_g_take_screenshot',
              content: [
                { type: 'text', text: 'Screenshot captured successfully' },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: 'iVBORw0KGgoAAAANSUhEUgAA...'
                  }
                }
              ]
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');

    const funcResp = userBubble.parts[0].functionResponse!;
    expect(funcResp.name).toEqual('take_screenshot');
    expect(funcResp.response.result).toEqual('Screenshot captured successfully');
    expect(funcResp.parts).toBeDefined();
    expect(funcResp.parts!.length).toEqual(1);
    expect(funcResp.parts![0].inlineData!.mimeType).toEqual('image/png');
    expect(funcResp.parts![0].inlineData!.data).toEqual('iVBORw0KGgoAAAANSUhEUgAA...');
  });
});

describe('Gemini to Claude Non-Stream Response Translation', () => {
  it('converts standard text response', () => {
    const geminiResponse = {
      candidates: [{
        content: {
          parts: [{ text: 'This is the answer.' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 15
      }
    };
    const result = translator.convertGoogleToClaudeNonStream(geminiResponse, 'gemini-2.5-pro');
    expect(result.content[0].type).toEqual('text');
    expect(result.content[0].text).toEqual('This is the answer.');
    expect(result.usage.input_tokens).toEqual(10);
    expect(result.usage.output_tokens).toEqual(15);
  });

  it('converts Gemini functionCall response back to Claude tool_use format (based on log.json capture)', () => {
    const geminiResponse = {
      candidates: [{
        content: {
          parts: [
            {
              functionCall: {
                id: 'abc123xyz',
                name: 'TaskCreate',
                args: {
                  subject: 'Explore project context',
                  description: 'Check files, docs, and recent commits to understand transaction logging.',
                  activeForm: 'Exploring project context'
                }
              }
            }
          ]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 47883,
        candidatesTokenCount: 53,
        thoughtsTokenCount: 291
      }
    };

    const result = translator.convertGoogleToClaudeNonStream(geminiResponse, 'gemini-2.5-flash');

    // Assert 1: output contains tool_use block directly
    expect(result.content[0].type).toEqual('tool_use');
    expect(result.content[0].name).toEqual('TaskCreate');
    expect(result.content[0].id).toEqual('toolu_g_abc123xyz');
    expect(result.content[0].input.subject).toEqual('Explore project context');
    expect(result.content[0].input.description).toEqual('Check files, docs, and recent commits to understand transaction logging.');
    expect(result.content[0].id).toBeDefined();

    expect(result.usage.input_tokens).toEqual(47883);
    expect(result.usage.output_tokens).toEqual(53 + 291); // candidates + thoughts
    expect(result.stop_reason).toEqual('tool_use');
  });
});

describe('Gemini to Claude Stream Response Translation', () => {
  it('correctly translates functionCall stream chunks to incremental input_json_delta format', () => {
    const streamState: any = {};
    const chunk = {
      candidates: [{
        content: {
          parts: [{ functionCall: { id: 'stream123', name: 'get_weather', args: { location: 'SF' } } }]
        }
      }]
    };

    const eventString = translator.translateGoogleToClaudeStream(JSON.stringify(chunk), 'gemini-3.5-flash', streamState);

    // Split events by double newline to parse individual SSE blocks
    const events = eventString!.split('\n\n').filter(Boolean);

    // First is message_start
    expect(events[0]).toContain('message_start');

    // Second should be content_block_start with empty input
    expect(events[1]).toContain('content_block_start');
    expect(events[1]).toContain('"type":"tool_use"');
    expect(events[1]).toContain('"name":"get_weather"');
    expect(events[1]).toContain('"id":"toolu_g_stream123"');
    expect(events[1]).toContain('"input":{}');
    expect(events[1]).toContain('"index":0');

    // Third should be content_block_delta with input_json_delta type
    expect(events[2]).toContain('content_block_delta');
    expect(events[2]).toContain('"type":"input_json_delta"');
    expect(events[2]).toContain('"partial_json":"{\\"location\\":\\"SF\\"}"');
    expect(events[2]).toContain('"index":0');

    // Fourth should be content_block_stop
    expect(events[3]).toContain('content_block_stop');
    expect(events[3]).toContain('"index":0');
  });

  it('merges consecutive same-role blocks in contents (user, user)', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'World' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.length).toEqual(2);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
    expect(result.googleRequest.contents[0].parts[1].text).toEqual('World');
  });
});

describe('Claude Translator Argument Type Coercion', () => {
  const mockTools = [
    {
      name: 'update_task',
      description: 'Update task',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          percentage: { type: 'number' },
          active: { type: 'boolean' }
        }
      }
    }
  ];

  it('coerces numeric or boolean types to strings if schema expects string', () => {
    const rawArgs = {
      taskId: 25,
      active: true
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.taskId).toEqual('25');
    // Ensure active is not converted to string because schema expects boolean
    expect(coerced.active).toEqual(true);
  });

  it('coerces stringified numbers to number types if schema expects number/integer', () => {
    const rawArgs = {
      percentage: '85.5'
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.percentage).toEqual(85.5);
  });

  it('coerces strings or numbers to boolean if schema expects boolean', () => {
    const rawArgs = {
      active: 'true'
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.active).toEqual(true);

    const rawArgsBinary = {
      active: 0
    };
    const coercedBinary = translator._coerceArguments('update_task', rawArgsBinary, mockTools);
    expect(coercedBinary.active).toEqual(false);
  });

  it('preserves fields if types match or field does not exist in schema properties', () => {
    const rawArgs = {
      taskId: '55',
      percentage: 100,
      unmappedField: 123
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.taskId).toEqual('55');
    expect(coerced.percentage).toEqual(100);
    expect(coerced.unmappedField).toEqual(123);
  });
});

describe('Claude Translator Model Name Mapping', () => {
  it('correctly maps configured aliases to target models', () => {
    // 1. Mock/configure modelMappings in the config
    config.modelMappings = {
      'gemini-pro-latest': 'gemini-flash-latest',
      'claude-to-gemini-custom': 'gemini-2.5-pro'
    };

    // 2. Instantiate a fresh ClaudeTranslator to pick up the updated configuration
    const translatorWithMapping = new (translator.constructor as any)();

    // 3. Translate Claude request using mapped model 'gemini-pro-latest'
    const payloadPro = {
      model: 'gemini-pro-latest',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const resultPro = translatorWithMapping.translateClaudeToGoogle(payloadPro);
    expect(resultPro.cleanModelName).toEqual('gemini-flash-latest'); // Mapped to flash-latest!

    // 4. Translate Claude request using custom model 'claude-to-gemini-custom'
    const payloadCustom = {
      model: 'claude-to-gemini-custom',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const resultCustom = translatorWithMapping.translateClaudeToGoogle(payloadCustom);
    expect(resultCustom.cleanModelName).toEqual('gemini-2.5-pro'); // Mapped to 2.5-pro!
  });
});

describe('Claude Translator Custom System Instruction Injection', () => {
  it('automatically injects customSystemInstruction when configured', () => {
    config.customSystemInstruction = 'Always answer concisely in markdown.';

    const claudePayloadNoSystem = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result1 = translator.translateClaudeToGoogle(claudePayloadNoSystem);
    expect(result1.googleRequest.systemInstruction).toBeDefined();
    expect(result1.googleRequest.systemInstruction!.parts[0].text).toEqual('Always answer concisely in markdown.');

    const claudePayloadWithSystem = {
      model: 'gemini-3.5-flash',
      system: 'You are a code assistant.',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result2 = translator.translateClaudeToGoogle(claudePayloadWithSystem);
    expect(result2.googleRequest.systemInstruction).toBeDefined();
    expect(result2.googleRequest.systemInstruction!.parts[0].text).toEqual(
      'You are a code assistant.\nAlways answer concisely in markdown.'
    );

    config.customSystemInstruction = '';
  });
});
