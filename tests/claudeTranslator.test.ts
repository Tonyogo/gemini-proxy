import translator from '../src/proxy/services/claudeTranslator';
import { config, updateConfig } from '../config/default';

describe('Claude to Gemini Request Translation', () => {
  beforeEach(() => {
    config.customSystemInstruction = '';
  });

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

  it('translates stop_sequences and top_k to generationConfig', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Hello' }],
      stop_sequences: ['\n\nHuman:', 'END', '', '  ', 'END'],
      top_k: 40
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.generationConfig).toBeDefined();
    expect(result.googleRequest.generationConfig!.stopSequences).toEqual(['\n\nHuman:', 'END']);
    expect(result.googleRequest.generationConfig!.topK).toEqual(40);
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
      '<system-context>\nThis is a message system prompt\n</system-context>'
    );

    // Second part of merged message (was role: user)
    expect(result.googleRequest.contents[0].parts[1].text).toEqual('Hello');
  });

  it('translates [user, system] sequence placing system message parts before user parts', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'Hello user prompt' },
        { role: 'system', content: 'Contextual system instruction' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.length).toEqual(2);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<system-context>\nContextual system instruction\n</system-context>'
    );
    expect(result.googleRequest.contents[0].parts[1].text).toEqual('Hello user prompt');
  });

  it('translates interleaved user and system messages preserving stable relative order with system first', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'User 1' },
        { role: 'system', content: 'System 1' },
        { role: 'user', content: 'User 2' },
        { role: 'system', content: 'System 2' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.map((p: any) => p.text)).toEqual([
      '<system-context>\nSystem 1\n</system-context>',
      '<system-context>\nSystem 2\n</system-context>',
      'User 1',
      'User 2'
    ]);
  });

  it('translates tool_result with system message placing system message first', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content: 'Tool execution result'
            }
          ]
        },
        { role: 'system', content: 'Instruction after tool' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.length).toEqual(2);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<system-context>\nInstruction after tool\n</system-context>'
    );
    expect(result.googleRequest.contents[0].parts[1].functionResponse).toBeDefined();
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

  it('translates const keyword to enum and infers type when type is omitted', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Use the tool.' }],
      tools: [
        {
          name: 'configure_format',
          description: 'Configure format parameters',
          input_schema: {
            type: 'object',
            properties: {
              format: {
                const: 'json',
                description: 'Target format'
              },
              version: {
                const: 2
              },
              ratio: {
                const: 1.5
              },
              enabled: {
                const: true
              },
              mode: {
                type: 'string',
                const: 'strict'
              }
            },
            required: ['format']
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

    expect(params.properties.format.type).toEqual('STRING');
    expect(params.properties.format.enum).toEqual(['json']);
    expect(params.properties.format.const).toBeUndefined();

    expect(params.properties.version.type).toEqual('INTEGER');
    expect(params.properties.version.enum).toEqual([2]);
    expect(params.properties.version.const).toBeUndefined();

    expect(params.properties.ratio.type).toEqual('NUMBER');
    expect(params.properties.ratio.enum).toEqual([1.5]);

    expect(params.properties.enabled.type).toEqual('BOOLEAN');
    expect(params.properties.enabled.enum).toEqual([true]);

    expect(params.properties.mode.type).toEqual('STRING');
    expect(params.properties.mode.enum).toEqual(['strict']);
  });

  it('translates exclusiveMinimum and exclusiveMaximum to enhanced descriptions while stripping min/max via whitelist', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Use the tool.' }],
      tools: [
        {
          name: 'set_thresholds',
          description: 'Set numerical thresholds',
          input_schema: {
            type: 'object',
            properties: {
              count: {
                type: 'integer',
                exclusiveMinimum: 0,
                exclusiveMaximum: 10,
                description: 'Total item count'
              },
              rate: {
                type: 'number',
                exclusiveMinimum: 0.0,
                exclusiveMaximum: 1.0
              },
              offset: {
                type: 'integer',
                minimum: 0,
                exclusiveMaximum: 100,
                description: 'Starting offset'
              }
            },
            required: ['count', 'rate']
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

    // Integer: exclusive bounds appended to description, min/max stripped by whitelist
    expect(params.properties.count.type).toEqual('INTEGER');
    expect(params.properties.count.minimum).toBeUndefined();
    expect(params.properties.count.maximum).toBeUndefined();
    expect(params.properties.count.description).toEqual('Total item count (must be > 0, must be < 10)');
    expect(params.properties.count.exclusiveMinimum).toBeUndefined();
    expect(params.properties.count.exclusiveMaximum).toBeUndefined();

    // Number: description enhanced, min/max stripped by whitelist
    expect(params.properties.rate.type).toEqual('NUMBER');
    expect(params.properties.rate.minimum).toBeUndefined();
    expect(params.properties.rate.maximum).toBeUndefined();
    expect(params.properties.rate.description).toEqual('(must be > 0, must be < 1)');

    // Pre-existing minimum also stripped by whitelist
    expect(params.properties.offset.minimum).toBeUndefined();
    expect(params.properties.offset.maximum).toBeUndefined();
    expect(params.properties.offset.description).toEqual('Starting offset (must be < 100)');
  });

  it('handles nested objects and array items with const and exclusive bounds', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Nested tool' }],
      tools: [
        {
          name: 'batch_update',
          description: 'Batch update items',
          input_schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { const: 'entity' },
                    score: { type: 'integer', exclusiveMinimum: 0 }
                  },
                  required: ['kind', 'score']
                }
              }
            }
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const itemProps = result.googleRequest.tools![0].functionDeclarations[0].parameters.properties.items.items.properties;

    expect(itemProps.kind.type).toEqual('STRING');
    expect(itemProps.kind.enum).toEqual(['entity']);
    expect(itemProps.score.type).toEqual('INTEGER');
    expect(itemProps.score.minimum).toBeUndefined();
    expect(itemProps.score.description).toEqual('(must be > 0)');
  });

  it('1. removes parameters field completely for parameterless tools (e.g. CronList, EnterPlanMode, TaskList)', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'List tasks' }],
      tools: [
        {
          name: 'CronList',
          description: 'List cron jobs',
          input_schema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          }
        },
        {
          name: 'EnterPlanMode',
          description: 'Enter plan mode',
          input_schema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'TaskList',
          description: 'List all tasks',
          input_schema: {
            type: 'object'
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const decls = result.googleRequest.tools![0].functionDeclarations;

    expect(decls).toHaveLength(3);
    for (const decl of decls) {
      expect(decl.parameters).toBeUndefined();
      expect('parameters' in decl).toBe(false);
      expect(decl.name).toBeDefined();
      expect(decl.description).toBeDefined();
    }
  });

  it('2. defaults missing type to uppercase STRING (e.g. Workflow.args)', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Run workflow' }],
      tools: [
        {
          name: 'Workflow',
          description: 'Execute workflow script',
          input_schema: {
            type: 'object',
            properties: {
              args: {
                description: 'Optional input value exposed to the script as the global args'
              },
              script: {
                type: 'string',
                description: 'Workflow script'
              }
            }
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

    expect(params.type).toBe('OBJECT');
    expect(params.properties.args.type).toBe('STRING');
    expect(params.properties.args.description).toBe('Optional input value exposed to the script as the global args');
    expect(params.properties.script.type).toBe('STRING');
  });

  it('updates description for untyped fields with conflicting NOT as a JSON-encoded string notices', () => {
    const inputSchema = {
      description: 'Optional input value exposed to the script. Pass arrays/objects as actual JSON values, NOT as a JSON-encoded string — a stringified list breaks args.filter/args.map in the script.'
    };

    const converted = translator._convertSchemaToGemini(inputSchema);
    expect(converted.type).toBe('STRING');
    expect(converted.description).toContain('(Note: Pass arrays/objects as a valid JSON-encoded string)');
    expect(converted.description).not.toMatch(/NOT as a JSON-encoded string/i);
    expect(converted.description).toContain('as a valid JSON-encoded string');
  });

  it('3. handles nested empty OBJECT schemas by injecting _placeholder property (e.g. AskUserQuestion, TaskCreate)', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Ask question' }],
      tools: [
        {
          name: 'AskUserQuestion',
          description: 'Ask user a question',
          input_schema: {
            type: 'object',
            properties: {
              answers: {
                type: 'object',
                description: 'User answers collected by the permission component'
              },
              annotations: {
                type: 'object',
                properties: {},
                description: 'Optional per-question annotations'
              }
            }
          }
        },
        {
          name: 'TaskCreate',
          description: 'Create task',
          input_schema: {
            type: 'object',
            properties: {
              subject: { type: 'string' },
              metadata: {
                type: 'object',
                additionalProperties: true,
                description: 'Arbitrary metadata'
              }
            },
            required: ['subject']
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const askParams = result.googleRequest.tools![0].functionDeclarations[0].parameters;
    const taskParams = result.googleRequest.tools![0].functionDeclarations[1].parameters;

    expect(askParams.properties.answers.type).toBe('OBJECT');
    expect(askParams.properties.answers.properties).toEqual({
      _placeholder: { type: 'STRING' }
    });

    expect(askParams.properties.annotations.type).toBe('OBJECT');
    expect(askParams.properties.annotations.properties).toEqual({
      _placeholder: { type: 'STRING' }
    });

    expect(taskParams.properties.metadata.type).toBe('OBJECT');
    expect(taskParams.properties.metadata.properties).toEqual({
      _placeholder: { type: 'STRING' }
    });
    expect(taskParams.properties.metadata.additionalProperties).toBeUndefined();
  });

  it('4. flattens anyOf and oneOf enum/const variants into a single STRING enum (e.g. TaskUpdate.status)', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Update task' }],
      tools: [
        {
          name: 'TaskUpdate',
          description: 'Update task status',
          input_schema: {
            type: 'object',
            properties: {
              status: {
                description: 'New status for the task',
                anyOf: [
                  {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed']
                  },
                  {
                    type: 'string',
                    const: 'deleted'
                  }
                ]
              },
              priority: {
                description: 'Task priority',
                oneOf: [
                  { enum: ['low', 'medium'] },
                  { const: 'high' },
                  { type: 'null' }
                ]
              }
            }
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const props = result.googleRequest.tools![0].functionDeclarations[0].parameters.properties;

    expect(props.status).toEqual({
      type: 'STRING',
      description: 'New status for the task',
      enum: ['pending', 'in_progress', 'completed', 'deleted']
    });
    expect(props.status.anyOf).toBeUndefined();

    expect(props.priority).toEqual({
      type: 'STRING',
      description: 'Task priority',
      enum: ['low', 'medium', 'high'],
      nullable: true
    });
    expect(props.priority.oneOf).toBeUndefined();
  });

  it('5. strictly filters schema fields against Gemini whitelist recursively', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Report findings' }],
      tools: [
        {
          name: 'ReportFindings',
          description: 'Report code review findings',
          input_schema: {
            type: 'object',
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              findings: {
                type: 'array',
                minItems: 1,
                maxItems: 32,
                description: 'Verified findings',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    category: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 40,
                      pattern: '^[a-z-]+$',
                      format: 'slug',
                      default: 'correctness',
                      description: 'Short kebab-case slug'
                    },
                    line: {
                      type: 'integer',
                      minimum: -9007199254740990,
                      maximum: 9007199254740990,
                      description: '1-indexed line'
                    }
                  },
                  required: ['category']
                }
              }
            },
            required: ['findings']
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

    expect(Object.keys(params).sort()).toEqual(['properties', 'required', 'type']);
    const findingsProp = params.properties.findings;
    expect(findingsProp.minItems).toBeUndefined();
    expect(findingsProp.maxItems).toBeUndefined();
    expect(Object.keys(findingsProp).sort()).toEqual(['description', 'items', 'type']);

    const itemSchema = findingsProp.items;
    expect(itemSchema.additionalProperties).toBeUndefined();
    expect(Object.keys(itemSchema).sort()).toEqual(['properties', 'required', 'type']);

    const categoryProp = itemSchema.properties.category;
    expect(categoryProp).toEqual({
      type: 'STRING',
      description: 'Short kebab-case slug'
    });

    const lineProp = itemSchema.properties.line;
    expect(lineProp).toEqual({
      type: 'INTEGER',
      description: '1-indexed line'
    });
  });

  it('6. strips empty text: "" parts in contents and ensures historical functionCall.args is at least {}', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Run tool with null input' }
          ]
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            {
              type: 'tool_use',
              id: 'toolu_null_args',
              name: 'EnterPlanMode',
              input: null
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_null_args',
              content: 'Done'
            },
            { type: 'text', text: '' }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const contents = result.googleRequest.contents;

    expect(contents).toHaveLength(3);
    // First user turn should not have the empty text part
    expect(contents[0].parts).toEqual([{ text: 'Run tool with null input' }]);
    // Assistant turn should not have the empty text part, and functionCall.args must be {}
    expect(contents[1].parts).toHaveLength(1);
    expect(contents[1].parts[0].functionCall).toBeDefined();
    expect(contents[1].parts[0].functionCall!.args).toEqual({});
    expect(contents[1].parts[0].functionCall!.args).not.toBeNull();
    // Second user turn should only have the functionResponse part
    expect(contents[2].parts).toHaveLength(1);
    expect(contents[2].parts[0].functionResponse).toBeDefined();
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

  it('translates tool_result with is_error=true to response.error instead of response.result', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_fail_01',
              name: 'read_file',
              input: { path: '/missing.txt' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_fail_01',
              content: 'File not found: /missing.txt',
              is_error: true
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');

    const funcResp = userBubble.parts[0].functionResponse!;
    expect(funcResp.name).toEqual('read_file');
    expect(funcResp.response.error).toEqual('File not found: /missing.txt');
    expect(funcResp.response.result).toBeUndefined();
  });

  it('translates tool_result with is_error=true and empty content to fallback error message', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_fail_02',
              name: 'execute_command',
              input: { command: 'exit 1' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_fail_02',
              is_error: true
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const userBubble = result.googleRequest.contents[1];
    const funcResp = userBubble.parts[0].functionResponse!;
    expect(funcResp.name).toEqual('execute_command');
    expect(funcResp.response.error).toEqual('Tool execution failed');
    expect(funcResp.response.result).toBeUndefined();
  });

  it('supports custom runtimeContextTag configuration overriding', () => {
    const originalTag = config.runtimeContextTag;
    try {
      config.runtimeContextTag = 'custom-system-wrapper';

      const claudePayload: any = {
        model: 'gemini-3.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Custom tagged system message'
          },
          {
            role: 'user',
            content: 'User message'
          }
        ]
      };

      const result = translator.translateClaudeToGoogle(claudePayload);

      expect(result.googleRequest.contents[0].parts[0].text).toContain(
        'Custom tagged system message'
      );
      expect(result.googleRequest.contents[0].parts[0].text).toContain(
        '<custom-system-wrapper>'
      );
    } finally {
      config.runtimeContextTag = originalTag;
    }
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

  it('cleans _placeholder and restores untyped json string in non-stream response', () => {
    const geminiResponse = {
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              id: 'call_1',
              name: 'Workflow',
              args: {
                args: '{"foo": "bar"}',
                answers: { _placeholder: 'strip' }
              }
            }
          }]
        }
      }]
    };
    const tools = [{
      name: 'Workflow',
      input_schema: {
        type: 'object',
        properties: {
          args: { description: 'untyped' },
          answers: { type: 'object' }
        }
      }
    }];
    const result = translator.convertGoogleToClaudeNonStream(geminiResponse, 'gemini-2.5-flash', tools);
    expect(result.content[0].input).toEqual({
      args: { foo: 'bar' },
      answers: {}
    });
  });
});

describe('ClaudeTranslator - SYSTEM_ROLE_TO_INSTRUCTION & Deduplication', () => {
  let originalSwitchValue: boolean;

  beforeEach(() => {
    originalSwitchValue = config.systemRoleToInstruction;
  });

  afterEach(() => {
    config.systemRoleToInstruction = originalSwitchValue;
  });

  it('constructs systemInstruction in correct order: claudeBody.system -> customSystemInstruction -> systemRoleToInstruction msgs', () => {
    config.systemRoleToInstruction = true;
    config.customSystemInstruction = 'Adapter Prompt Content';

    const claudePayload: any = {
      model: 'gemini-3.5-flash',
      system: 'Claude Original System Content',
      messages: [
        {
          role: 'system',
          content: '# runtimeContext\nRuntime Context Content'
        },
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    };

    const result = translator.translateClaudeToGoogle(claudePayload);
    const systemText = result.googleRequest.systemInstruction!.parts[0].text;

    const idxOriginal = systemText.indexOf('Claude Original System Content');
    const idxCustom = systemText.indexOf('Adapter Prompt Content');
    const idxRuntime = systemText.indexOf('Runtime Context Content');

    expect(idxOriginal).toBeGreaterThan(-1);
    expect(idxCustom).toBeGreaterThan(-1);
    expect(idxRuntime).toBeGreaterThan(-1);

    expect(idxOriginal).toBeLessThan(idxCustom);
    expect(idxCustom).toBeLessThan(idxRuntime);

    // Clean up
    config.customSystemInstruction = '';
  });

  it('routes system messages to systemInstruction and deduplicates when systemRoleToInstruction is enabled', () => {
    config.systemRoleToInstruction = true;

    const claudePayload: any = {
      model: 'gemini-3.5-flash',
      system: 'Main system instruction',
      messages: [
        {
          role: 'system',
          content: '# claudeMd\nVersion 1: Old instruction content'
        },
        {
          role: 'user',
          content: 'User message 1'
        },
        {
          role: 'assistant',
          content: 'Assistant reply'
        },
        {
          role: 'system',
          content: '# claudeMd\nVersion 2: Updated instruction content'
        },
        {
          role: 'system',
          content: '# customContext\nUnique context content'
        },
        {
          role: 'user',
          content: 'User message 2'
        }
      ]
    };

    const result = translator.translateClaudeToGoogle(claudePayload);

    // 1. Verify contents does NOT contain role: 'system' messages converted to user turns
    expect(result.googleRequest.contents).toHaveLength(3);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('User message 1');
    expect(result.googleRequest.contents[1].parts[0].text).toEqual('Assistant reply');
    expect(result.googleRequest.contents[2].parts[0].text).toEqual('User message 2');

    // 2. Verify systemInstruction contains main prompt and deduplicated system messages (Version 2 & customContext)
    expect(result.googleRequest.systemInstruction).toBeDefined();
    const systemText = result.googleRequest.systemInstruction!.parts[0].text;

    expect(systemText).toContain('Main system instruction');
    expect(systemText).toContain('# claudeMd\nVersion 2: Updated instruction content');
    expect(systemText).toContain('# customContext\nUnique context content');
    expect(systemText).not.toContain('Version 1');
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

    const events = translator.translateGoogleToClaudeStream(JSON.stringify(chunk), 'gemini-3.5-flash', streamState);

    expect(Array.isArray(events)).toBe(true);
    expect(events![0].type).toBe('message_start');

    // Second should be content_block_start with empty input
    expect(events![1].type).toBe('content_block_start');
    expect(events![1].content_block.type).toBe('tool_use');
    expect(events![1].content_block.name).toBe('get_weather');
    expect(events![1].content_block.id).toBe('toolu_g_stream123');
    expect(events![1].content_block.input).toEqual({});

    // Third should be content_block_delta with input_json_delta type
    expect(events![2].type).toBe('content_block_delta');
    expect(events![2].delta.type).toBe('input_json_delta');
    expect(events![2].delta.partial_json).toBe('{"location":"SF"}');

    // Fourth should be content_block_stop
    expect(events![3].type).toBe('content_block_stop');
  });

  it('handles SSE chunk strings starting with data: with or without spaces', () => {
    const rawDataWithSpace = `data: {"candidates":[{"content":{"parts":[{"text":"Hello!"}],"role":"model"},"index":0}]}`;
    const rawDataNoSpace = `data:{"candidates":[{"content":{"parts":[{"text":"Hello!"}],"role":"model"},"index":0}]}`;

    const streamState1: any = {};
    const events1 = translator.translateGoogleToClaudeStream(rawDataWithSpace, 'gemini-3.5-flash', streamState1);
    expect(events1).not.toBeNull();
    expect(events1!.length).toBeGreaterThan(0);

    const streamState2: any = {};
    const events2 = translator.translateGoogleToClaudeStream(rawDataNoSpace, 'gemini-3.5-flash', streamState2);
    expect(events2).not.toBeNull();
    expect(events2!.length).toBeGreaterThan(0);
  });

  it('silently ignores SSE comment/heartbeat lines (: ping) and non-data metadata lines without logging warnings', () => {
    const logger = require('../src/utils/logger').default;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    try {
      const streamState: any = {};
      expect(translator.translateGoogleToClaudeStream(': ping', 'gemini-3.5-flash', streamState)).toBeNull();
      expect(translator.translateGoogleToClaudeStream(': keep-alive', 'gemini-3.5-flash', streamState)).toBeNull();
      expect(translator.translateGoogleToClaudeStream(':', 'gemini-3.5-flash', streamState)).toBeNull();
      expect(translator.translateGoogleToClaudeStream('event: message', 'gemini-3.5-flash', streamState)).toBeNull();
      expect(translator.translateGoogleToClaudeStream('id: 123', 'gemini-3.5-flash', streamState)).toBeNull();
      expect(translator.translateGoogleToClaudeStream('retry: 3000', 'gemini-3.5-flash', streamState)).toBeNull();

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
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

  it('cleans _placeholder and restores untyped json string in stream response', () => {
    const streamState: any = {
      tools: [{
        name: 'Workflow',
        input_schema: {
          type: 'object',
          properties: {
            args: { description: 'untyped' },
            answers: { type: 'object' }
          }
        }
      }]
    };
    const chunk = JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              id: 'call_2',
              name: 'Workflow',
              args: {
                args: '[1, 2]',
                answers: { _placeholder: 'strip' }
              }
            }
          }]
        }
      }]
    });
    const events = translator.translateGoogleToClaudeStream(`data: ${chunk}`, 'gemini-2.5-flash', streamState);
    const deltaEvent = events?.find((e: any) => e.type === 'content_block_delta');
    expect(deltaEvent).toBeDefined();
    expect(JSON.parse(deltaEvent.delta.partial_json)).toEqual({
      args: [1, 2],
      answers: {}
    });
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

  it('recursively removes _placeholder properties while preserving empty parent objects', () => {
    const rawArgs = {
      metadata: { _placeholder: 'val' },
      answers: { q1: { _placeholder: 'x' } },
      name: 'foo',
      tags: [{ id: 1, _placeholder: 'strip-me' }, { id: 2 }]
    };
    const cleaned = (translator as any)._cleanAndCoerceArguments('test_tool', rawArgs);
    expect(cleaned).toEqual({
      metadata: {},
      answers: { q1: {} },
      name: 'foo',
      tags: [{ id: 1 }, { id: 2 }]
    });

    // Test root object being only _placeholder
    const rootOnlyPlaceholder = { _placeholder: 'placeholder_val' };
    const cleanedRoot = (translator as any)._cleanAndCoerceArguments('test_tool', rootOnlyPlaceholder);
    expect(cleanedRoot).toEqual({});
  });

  it('restores JSON-encoded string to object/array for untyped properties in original schema', () => {
    const mockWorkflowTools = [
      {
        name: 'Workflow',
        description: 'Runs workflow',
        input_schema: {
          type: 'object',
          properties: {
            args: {
              description: 'Optional input value exposed to the script.'
              // Notice: no type field!
            },
            query: {
              type: 'string',
              description: 'Explicit string query'
            }
          }
        }
      }
    ];

    // Case 1: JSON object string for untyped field is parsed to object
    const rawArgsObj = { args: '{"items": [1, 2]}' };
    const coercedObj = (translator as any)._cleanAndCoerceArguments('Workflow', rawArgsObj, mockWorkflowTools);
    expect(coercedObj.args).toEqual({ items: [1, 2] });

    // Case 2: JSON array string for untyped field is parsed to array
    const rawArgsArr = { args: '[1, 2, 3]' };
    const coercedArr = (translator as any)._cleanAndCoerceArguments('Workflow', rawArgsArr, mockWorkflowTools);
    expect(coercedArr.args).toEqual([1, 2, 3]);

    // Case 3: Plain non-JSON string is preserved as-is
    const rawArgsText = { args: 'just a normal text' };
    const coercedText = (translator as any)._cleanAndCoerceArguments('Workflow', rawArgsText, mockWorkflowTools);
    expect(coercedText.args).toEqual('just a normal text');

    // Case 4: Explicit type: 'string' field is NOT parsed as JSON even if it contains valid JSON
    const rawArgsExplicit = { query: '{"key": 1}' };
    const coercedExplicit = (translator as any)._cleanAndCoerceArguments('Workflow', rawArgsExplicit, mockWorkflowTools);
    expect(coercedExplicit.query).toEqual('{"key": 1}');

    // Case 5: Primitive numeric string "123" or boolean string "true" in untyped field is NOT coerced to primitive
    const rawArgsPrimitive = { args: '123' };
    const coercedPrimitive = (translator as any)._cleanAndCoerceArguments('Workflow', rawArgsPrimitive, mockWorkflowTools);
    expect(coercedPrimitive.args).toEqual('123');
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
    expect(resultPro.strategy).toBeUndefined();

    // 4. Translate Claude request using custom model 'claude-to-gemini-custom'
    const payloadCustom = {
      model: 'claude-to-gemini-custom',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const resultCustom = translatorWithMapping.translateClaudeToGoogle(payloadCustom);
    expect(resultCustom.cleanModelName).toEqual('gemini-2.5-pro'); // Mapped to 2.5-pro!
    expect(resultCustom.strategy).toBeUndefined();
  });

  it('correctly maps configured object aliases with scheduling strategy', () => {
    config.modelMappings = {
      'claude-3-7-sonnet': {
        target: 'gemini-2.5-pro',
        strategy: 'round-robin'
      },
      'claude-3-5-haiku': {
        target: 'gemini-2.5-flash',
        strategy: 'least-used'
      },
      'claude-weighted': {
        target: 'gemini-2.5-flash-high',
        strategy: 'weighted'
      }
    };

    const translatorWithMapping = new (translator.constructor as any)();

    const res1 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-3-7-sonnet',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(res1.cleanModelName).toEqual('gemini-2.5-pro');
    expect(res1.strategy).toEqual('round-robin');

    const res2 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-3-5-haiku',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(res2.cleanModelName).toEqual('gemini-2.5-flash');
    expect(res2.strategy).toEqual('least-used');

    const res3 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-weighted',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(res3.cleanModelName).toEqual('gemini-2.5-flash-high');
    expect(res3.strategy).toEqual('weighted');
  });

  it('alternates target models in round-robin fashion for array target mappings', () => {
    config.modelMappings = {
      'claude-pool': ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro']
    };

    const translatorWithMapping = new (translator.constructor as any)();

    const call1 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call1.cleanModelName).toEqual('gemini-2.5-pro');

    const call2 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call2.cleanModelName).toEqual('gemini-2.5-flash');

    const call3 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call3.cleanModelName).toEqual('gemini-1.5-pro');

    const call4 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call4.cleanModelName).toEqual('gemini-2.5-pro');
  });

  it('alternates target models and preserves strategy for object targets array mapping', () => {
    config.modelMappings = {
      'claude-pool-object': {
        targets: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        strategy: 'round-robin'
      }
    };

    const translatorWithMapping = new (translator.constructor as any)();

    const call1 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool-object',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call1.cleanModelName).toEqual('gemini-2.5-pro');
    expect(call1.strategy).toEqual('round-robin');

    const call2 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool-object',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call2.cleanModelName).toEqual('gemini-2.5-flash');
    expect(call2.strategy).toEqual('round-robin');

    const call3 = translatorWithMapping.translateClaudeToGoogle({
      model: 'claude-pool-object',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any);
    expect(call3.cleanModelName).toEqual('gemini-2.5-pro');
    expect(call3.strategy).toEqual('round-robin');
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
      'You are a code assistant.\n\nAlways answer concisely in markdown.'
    );

    config.customSystemInstruction = '';
  });
});

describe('Claude Translator Ephemeral Messages Filtering', () => {
  beforeEach(() => {
    config.ephemeralUserMessages = [
      'no visible output'
    ];
    config.ephemeralSystemMessages = [
      'temp system context'
    ];
  });

  afterEach(() => {
    config.ephemeralUserMessages = [];
    config.ephemeralSystemMessages = [];
  });

  it('filters matching block from multi-block user message while preserving user message and other blocks', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '[Your previous response had no visible output. Please continue and produce a user-visible response.]' },
            { type: 'text', text: 'Important user question context' }
          ]
        },
        { role: 'system', content: 'This contains temp system context for historical turn.' },
        { role: 'assistant', content: 'Understood.' },
        { role: 'user', content: 'What is the capital of France?' }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const textParts = result.googleRequest.contents.flatMap((c: any) => c.parts.map((p: any) => p.text));
    expect(textParts.some((t: string) => t.includes('no visible output'))).toBe(false);
    expect(textParts.some((t: string) => t.includes('Important user question context'))).toBe(true);
    expect(textParts.some((t: string) => t.includes('temp system context'))).toBe(false);
    expect(textParts.some((t: string) => t.includes('What is the capital of France?'))).toBe(true);
  });

  it('does NOT filter single-block user message even if it matches ephemeral pattern', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: '[Your previous response had no visible output. Please continue and produce a user-visible response.]' },
        { role: 'assistant', content: 'Understood.' },
        { role: 'user', content: 'What is the capital of France?' }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const textParts = result.googleRequest.contents.flatMap((c: any) => c.parts.map((p: any) => p.text));
    // Single block user message is preserved
    expect(textParts.some((t: string) => t.includes('no visible output'))).toBe(true);
  });

  it('preserves ephemeral message if it is the latest user turn', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'user', content: '[Your previous response had no visible output. Please continue and produce a user-visible response.]' }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const textParts = result.googleRequest.contents.flatMap((c: any) => c.parts.map((p: any) => p.text));
    expect(textParts.some((t: string) => t.includes('no visible output'))).toBe(true);
  });

  it('does not filter system message if pattern belongs to user and vice versa', () => {
    config.ephemeralUserMessages = ['only_user_pattern'];
    config.ephemeralSystemMessages = ['only_system_pattern'];

    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'system', content: 'This has only_user_pattern inside system message' },
        { role: 'user', content: 'Hello' }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const textParts = result.googleRequest.contents.flatMap((c: any) => c.parts.map((p: any) => p.text));
    expect(textParts.some((t: string) => t.includes('only_user_pattern'))).toBe(true);
  });
});

describe('ClaudeTranslator - normalizeError Status Code Mapping', () => {
  it('remaps 403 and 401 upstream errors to 502 with api_error type', () => {
    const err403 = translator.normalizeError({ status: 403, message: 'User location is not supported' });
    expect(err403.status).toEqual(502);
    expect(err403.payload.error.type).toEqual('api_error');
    expect(err403.payload.error.message).toEqual('User location is not supported');

    const err401 = translator.normalizeError({ status: 401, message: 'API key expired' });
    expect(err401.status).toEqual(502);
    expect(err401.payload.error.type).toEqual('api_error');
    expect(err401.payload.error.message).toEqual('API key expired');
  });

  it('preserves other standard status codes and types', () => {
    const err400 = translator.normalizeError({ status: 400, message: 'Invalid field' });
    expect(err400.status).toEqual(400);
    expect(err400.payload.error.type).toEqual('invalid_request_error');

    const err429 = translator.normalizeError({ status: 429, message: 'Quota exceeded' });
    expect(err429.status).toEqual(429);
    expect(err429.payload.error.type).toEqual('rate_limit_error');

    const err500 = translator.normalizeError({ status: 500, message: 'Internal error' });
    expect(err500.status).toEqual(500);
    expect(err500.payload.error.type).toEqual('api_error');
  });

  it('remaps 524 upstream errors to 529 with overloaded_error type and retry headers', () => {
    const err524 = translator.normalizeError({ status: 524, message: 'A timeout occurred' });
    expect(err524.status).toEqual(529);
    expect(err524.payload.error.type).toEqual('overloaded_error');
    expect(err524.payload.error.message).toContain('Upstream gateway timed out (524)');
    expect(err524.headers).toEqual({
      'x-should-retry': 'true',
      'retry-after': '3'
    });
  });

  it('sanitizes Cloudflare 524 HTML error pages into clean 529 overloaded_error with retry headers', () => {
    const cloudflareHtml = '<!DOCTYPE html><html><head><title>524: A timeout occurred</title></head><body><h1>Error 524</h1><p>The origin web server timed out responding to this request.</p></body></html>';
    const errHtml = translator.normalizeError({ status: 524, message: cloudflareHtml });
    expect(errHtml.status).toEqual(529);
    expect(errHtml.payload.error.type).toEqual('overloaded_error');
    expect(errHtml.payload.error.message).toBe('Upstream gateway timed out (524). Service is temporarily overloaded, please retry.');
    expect(errHtml.headers).toEqual({
      'x-should-retry': 'true',
      'retry-after': '3'
    });
  });

  it('detects 524 timeout in message even if status is not 524', () => {
    const errDetected = translator.normalizeError({ status: 500, message: 'Cloudflare error code 524: A timeout occurred' });
    expect(errDetected.status).toEqual(529);
    expect(errDetected.payload.error.type).toEqual('overloaded_error');
    expect(errDetected.headers?.['x-should-retry']).toBe('true');
  });

  it('sanitizes generic HTML error pages and extracts title', () => {
    const genericHtml = '<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>';
    const errGeneric = translator.normalizeError({ status: 502, message: genericHtml });
    expect(errGeneric.status).toEqual(502);
    expect(errGeneric.payload.error.type).toEqual('api_error');
    expect(errGeneric.payload.error.message).toBe('Upstream returned HTML error page: 502 Bad Gateway');
  });

  it('provides retry headers for rate_limit_error (429) and overloaded_error (529)', () => {
    const err429 = translator.normalizeError({ status: 429, message: 'Resource exhausted' });
    expect(err429.status).toEqual(429);
    expect(err429.headers?.['x-should-retry']).toBe('true');
    expect(err429.headers?.['retry-after']).toBe('5');

    const err529 = translator.normalizeError({ status: 529, message: 'Overloaded' });
    expect(err529.status).toEqual(529);
    expect(err529.payload.error.type).toEqual('overloaded_error');
    expect(err529.headers?.['x-should-retry']).toBe('true');
    expect(err529.headers?.['retry-after']).toBe('3');
  });
});

describe('Claude Translator System Fingerprint Configuration', () => {
  it('has stripSystemFingerprints enabled by default in config', () => {
    expect(config.stripSystemFingerprints).toBe(true);
  });
});

describe('Claude System Prompt Fingerprint Sanitization', () => {
  afterEach(() => {
    config.stripSystemFingerprints = true;
    config.customSystemInstruction = '';
  });

  it('completely drops system prompt starting with x-anthropic-billing-header', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: 'x-anthropic-billing-header: cc_version=2.1.284.551; cc_entrypoint=cli;\nYou are Claude Code.',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeUndefined();
  });

  it('preserves Claude identity and Git attribution without stripping when not starting with billing header', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: "You are Claude Code, Anthropic's official CLI for Claude.\nEnd git commit messages with:\n- Co-Authored-By: Claude Code <noreply@anthropic.com>",
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    const systemText = result.googleRequest.systemInstruction!.parts[0].text;
    expect(systemText).toContain('Claude Code');
    expect(systemText).toContain('Anthropic');
    expect(systemText).toContain('Co-Authored-By');
  });

  it('drops billing header blocks in array system prompts while retaining other blocks', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: [
        { type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1;\nDrop this block' },
        { type: 'text', text: 'Keep this project instruction' }
      ],
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual('Keep this project instruction');
  });

  it('preserves billing header and Claude identity when stripSystemFingerprints is false', () => {
    config.stripSystemFingerprints = false;
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: 'x-anthropic-billing-header: test\nYou are Claude Code',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    expect(result.googleRequest.systemInstruction!.parts[0].text).toContain('x-anthropic-billing-header');
  });

  it('drops billing header with leading whitespace and newlines', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: '  \n\n  x-anthropic-billing-header: test\nPrompt',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeUndefined();
  });

  it('drops client billing header system but preserves customSystemInstruction', () => {
    config.customSystemInstruction = 'Always answer in French.';
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: 'x-anthropic-billing-header: test',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual('Always answer in French.');
  });

  it('does not forward raw empty text blocks to parts in inline system messages', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Valid system text' }
          ]
        },
        { role: 'user', content: 'Hello' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    const userParts = result.googleRequest.contents[0].parts;
    expect(userParts.some((p: any) => p.type === 'text')).toBe(false);
    expect(userParts[0].text).toContain('Valid system text');
  });

  it('provides default ignoredTools configuration and allows runtime updates', () => {
    expect((config as any).ignoredTools).toBeDefined();
    expect((config as any).ignoredTools).toContain('Artifact');
    expect((config as any).ignoredTools).toContain('ArtifactCheck');
    expect((config as any).ignoredTools).toContain('ArtifactData');
    expect((config as any).ignoredTools).toContain('ArtifactComments');
  });
});

describe('Claude Translator Ignored Tools Filtering', () => {
  it('filters out default ignored tools from claudeBody.tools', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Draw something' }],
      tools: [
        { name: 'Artifact', description: 'claude artifact tool', input_schema: { type: 'object' } },
        { name: 'ArtifactCheck', description: 'check tool', input_schema: { type: 'object' } },
        { name: 'Bash', description: 'execute bash', input_schema: { type: 'object' } }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools).toBeDefined();
    expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
    expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('Bash');
  });

  it('omits googleRequest.tools completely when all tools are ignored', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Draw something' }],
      tools: [
        { name: 'Artifact', description: 'artifact tool', input_schema: { type: 'object' } },
        { name: 'artifactcomments', description: 'case insensitive check', input_schema: { type: 'object' } }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools).toBeUndefined();
  });

  it('filters tools case-insensitively and trims whitespace', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        { name: '  aRtIfAcT  ', description: 'artifact tool', input_schema: { type: 'object' } },
        { name: 'custom_tool', description: 'keep this', input_schema: { type: 'object' } }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
    expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('custom_tool');
  });

  it('respects dynamic custom config.ignoredTools', () => {
    const originalIgnored = config.ignoredTools;
    try {
      config.ignoredTools = ['CustomUselessTool'];
      const claudePayload = {
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          { name: 'CustomUselessTool', description: 'ignored', input_schema: { type: 'object' } },
          { name: 'Artifact', description: 'now kept because overridden', input_schema: { type: 'object' } }
        ]
      } as any;

      const result = translator.translateClaudeToGoogle(claudePayload);
      expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
      expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('Artifact');
    } finally {
      config.ignoredTools = originalIgnored;
    }
  });

  it('handles malformed tool objects (null, undefined, missing name) safely', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        null,
        undefined,
        {},
        { name: '' },
        { name: '  ' },
        { name: 'Artifact' },
        { name: 'valid_tool', description: 'a valid tool', input_schema: { type: 'object' } }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools).toBeDefined();
    expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
    expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('valid_tool');
  });

  it('preserves valid tools in original order with full schemas intact', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        {
          name: 'tool_one',
          description: 'first tool',
          input_schema: {
            type: 'object',
            properties: {
              paramA: { type: 'string' }
            },
            required: ['paramA']
          }
        },
        { name: 'ArtifactData', description: 'ignored tool' },
        {
          name: 'tool_two',
          description: 'second tool',
          input_schema: {
            type: 'object',
            properties: {
              paramB: { type: 'number' }
            }
          }
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(2);
    expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('tool_one');
    expect(result.googleRequest.tools![0].functionDeclarations[0].parameters.properties.paramA.type).toBe('STRING');
    expect(result.googleRequest.tools![0].functionDeclarations[1].name).toBe('tool_two');
    expect(result.googleRequest.tools![0].functionDeclarations[1].parameters.properties.paramB.type).toBe('NUMBER');
  });

  it('reflects ignoredTools updated via updateConfig immediately', async () => {
    const originalIgnored = config.ignoredTools;
    try {
      await updateConfig({ ignoredTools: ['SpecificTool'] });
      const claudePayload = {
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          { name: 'SpecificTool', description: 'ignored', input_schema: { type: 'object' } },
          { name: 'Artifact', description: 'kept because ignoredTools changed', input_schema: { type: 'object' } }
        ]
      } as any;

      const result = translator.translateClaudeToGoogle(claudePayload);
      expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
      expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('Artifact');
    } finally {
      await updateConfig({ ignoredTools: originalIgnored });
    }
  });
});

import { buildDirectUpstreamHeaders } from '../src/utils/requestHelper';

describe('Claude Direct Mode Preprocessing & Headers', () => {
  beforeEach(() => {
    config.customSystemInstruction = '';
    config.stripSystemFingerprints = true;
    config.modelMappings = {};
    config.ignoredTools = ['Artifact', 'ArtifactCheck'];
    config.ephemeralUserMessages = ['[ephemeral-user-hint]'];
    config.ephemeralSystemMessages = ['[ephemeral-sys-hint]'];
  });

  it('maps model name, preserves -high suffix without injecting thinking, and leaves inline system messages untouched', () => {
    config.modelMappings = {
      'claude-sonnet': { target: 'claude-sonnet-4-5-high', strategy: 'least-used' }
    };
    const input = {
      model: 'claude-sonnet',
      stream: true,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'Inline system message stays as-is' },
        { role: 'user', content: 'Hello world' }
      ]
    } as any;

    const { directRequest, cleanModelName, strategy, isStream } =
      translator.preprocessClaudeDirectRequest(input);

    expect(cleanModelName).toBe('claude-sonnet-4-5-high');
    expect(directRequest.model).toBe('claude-sonnet-4-5-high');
    expect(directRequest.thinking).toBeUndefined();
    expect(strategy).toBe('least-used');
    expect(isStream).toBe(true);
    expect(directRequest.messages).toEqual([
      { role: 'system', content: 'Inline system message stays as-is' },
      { role: 'user', content: 'Hello world' }
    ]);
  });

  it('cleans x-anthropic-billing-header from top-level system array/string and appends customSystemInstruction', () => {
    config.customSystemInstruction = 'Custom direct instruction';
    const inputWithArray = {
      model: 'claude-3-5-sonnet',
      system: [
        { type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1' },
        { type: 'text', text: 'Keep this system block' }
      ],
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;

    const resArray = translator.preprocessClaudeDirectRequest(inputWithArray);
    expect(resArray.directRequest.system).toEqual([
      { type: 'text', text: 'Keep this system block' },
      { type: 'text', text: 'Custom direct instruction' }
    ]);

    config.customSystemInstruction = '';
    const inputOnlyBilling = {
      model: 'claude-3-5-sonnet',
      system: 'x-anthropic-billing-header: cc_version=2.1',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;
    const resEmpty = translator.preprocessClaudeDirectRequest(inputOnlyBilling);
    expect(resEmpty.directRequest.system).toBeUndefined();
  });

  it('filters historical ephemeral messages and removes ignoredTools without mutating input', () => {
    const original = {
      model: 'claude-3-5-sonnet',
      messages: [
        { role: 'system', content: '[ephemeral-sys-hint] drop me' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '[ephemeral-user-hint] drop block' },
            { type: 'text', text: 'keep block' }
          ]
        },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'final user turn [ephemeral-user-hint]' }
      ],
      tools: [
        { name: 'Artifact', input_schema: { type: 'object' } },
        { name: 'Bash', input_schema: { type: 'object' } }
      ]
    } as any;

    const snapshot = JSON.parse(JSON.stringify(original));
    const { directRequest } = translator.preprocessClaudeDirectRequest(original);

    expect(original).toEqual(snapshot);
    expect(directRequest.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'keep block' }] },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'final user turn [ephemeral-user-hint]' }
    ]);
    expect(directRequest.tools).toEqual([
      { name: 'Bash', input_schema: { type: 'object' } }
    ]);
  });

  it('builds direct upstream headers preserving client auth and anthropic headers', () => {
    const fakeReq = {
      headers: {
        'x-api-key': 'sk-ant-client',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'Prompt-Caching-2024-07-31'
      }
    } as any;

    const headers = buildDirectUpstreamHeaders(fakeReq, 'sk-ant-client', {
      'x-scheduling-strategy': 'round-robin'
    });

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('sk-ant-client');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-beta']).toBe('Prompt-Caching-2024-07-31');
    expect(headers['x-scheduling-strategy']).toBe('round-robin');
  });
});






