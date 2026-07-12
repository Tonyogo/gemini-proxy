import translator from '../src/services/claudeTranslator';

describe('Claude to Gemini Request Translation', () => {
  it('translates basic message requests', () => {
    const claudePayload = {
      model: 'claude-sonnet-4.6',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-3.5-flash');
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });

  it('translates system prompts', () => {
    const claudePayload = {
      model: 'claude-sonnet-4.6',
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual('You are a helpful assistant');
  });

  it('translates system prompts with role user and combines messages system roles', () => {
    const claudePayload = {
      model: 'claude-sonnet-4.6',
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

    // Assert 2: The inline system message is converted to role 'user' and wrapped in tags
    expect(result.googleRequest.contents.length).toEqual(2);

    // First message (was role: system)
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<system-reminder>\nThis is a message system prompt\n</system-reminder>'
    );

    // Second message (was role: user)
    expect(result.googleRequest.contents[1].role).toEqual('user');
    expect(result.googleRequest.contents[1].parts[0].text).toEqual('Hello');
  });

  it('translates images', () => {
    const claudePayload = {
      model: 'claude-haiku-4.5',
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
});

describe('Claude to Gemini Tools Schema Sanitization', () => {
  it('recursively cleans and translates Claude input schemas to Gemini-compliant structures', () => {
    const claudePayload = {
      model: 'claude-sonnet-4.6',
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
      model: 'claude-sonnet-4.6',
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

    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');
    expect(userBubble.parts.length).toEqual(3);

    expect(userBubble.parts[0].functionResponse!.name).toEqual('get_weather');
    expect(userBubble.parts[0].functionResponse!.response.content).toEqual('Sunny, 20 degrees');

    expect(userBubble.parts[1].functionResponse!.name).toEqual('calculate_sum');
    expect(userBubble.parts[1].functionResponse!.response.content[0].text).toEqual('15');

    expect(userBubble.parts[2].functionResponse!.name).toEqual('unknown_tool');
    expect(userBubble.parts[2].functionResponse!.response.content).toEqual('Fallback response');
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
    expect(result.content[0].input.subject).toEqual('Explore project context');
    expect(result.content[0].input.description).toEqual('Check files, docs, and recent commits to understand transaction logging.');
    expect(result.content[0].id).toBeDefined();

    expect(result.usage.input_tokens).toEqual(47883);
    expect(result.usage.output_tokens).toEqual(53 + 291); // candidates + thoughts
    expect(result.stop_reason).toEqual('tool_use');
  });
});

describe('Gemini to Claude Stream Response Translation', () => {
  it('correctly translates functionCall stream chunks without injecting empty text blocks', () => {
    const streamState: any = {};
    const chunk = {
      candidates: [{
        content: {
          parts: [{ functionCall: { name: 'get_weather', args: { location: 'SF' } } }]
        }
      }]
    };

    const eventString = translator.translateGoogleToClaudeStream(JSON.stringify(chunk), 'gemini-3.5-flash', streamState);

    // Split events by double newline to parse individual SSE blocks
    const events = eventString!.split('\n\n').filter(Boolean);

    // First is message_start
    expect(events[0]).toContain('message_start');

    // Second should be the actual tool_use start directly
    expect(events[1]).toContain('content_block_start');
    expect(events[1]).toContain('tool_use');
    expect(events[1]).toContain('get_weather');
    expect(events[1]).toContain('"index":0');
  });
});
