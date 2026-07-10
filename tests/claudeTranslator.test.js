const translator = require('../src/services/claudeTranslator');

describe('Claude to Gemini Request Translation', () => {
  it('translates basic message requests', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-2.5-pro');
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });

  it('translates system prompts', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hi' }]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction.parts[0].text).toEqual('You are a helpful assistant');
  });

  it('translates system prompts with role user and combines messages system roles', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      system: 'This is the main system prompt',
      messages: [
        { role: 'system', content: 'This is a message system prompt' },
        { role: 'user', content: 'Hello' }
      ]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);

    // Assert 1: systemInstruction role must be 'user'
    expect(result.googleRequest.systemInstruction.role).toEqual('user');

    // Assert 2: Both system prompts are combined with a newline
    expect(result.googleRequest.systemInstruction.parts[0].text).toEqual(
      'This is the main system prompt\nThis is a message system prompt'
    );

    // Assert 3: System messages must be filtered OUT of conversational contents
    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });

  it('translates images', () => {
    const claudePayload = {
      model: 'claude-3-5-haiku',
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
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-2.5-flash');
    const parts = result.googleRequest.contents[0].parts;
    expect(parts[0].text).toEqual('What is this?');
    expect(parts[1].inlineData.mimeType).toEqual('image/png');
    expect(parts[1].inlineData.data).toEqual('iVBORw0KGgoAAAANS...');
  });

  it('translates thinking config', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'Explain string theory' }],
      thinking: { type: 'enabled', budget_tokens: 1024 }
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.thinkingConfig.thinkingBudget).toEqual(1024);
  });
});

describe('Claude to Gemini Tools Schema Sanitization', () => {
  it('recursively cleans and translates Claude input schemas to Gemini-compliant structures', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
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
    };

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools[0].functionDeclarations[0].parameters;

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
    // Simulated multi-turn payloads containing:
    // 1. Assistant message with a tool_use block (to establish the ID-to-name mapping)
    // 2. User message containing three different tool results with different content formats
    const claudePayload = {
      model: 'claude-3-5-sonnet',
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
            // Case A: content is a standard string
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_weather_01',
              content: 'Sunny, 20 degrees'
            },
            // Case B: content is an array of text blocks (Claude standard)
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_calc_02',
              content: [
                { type: 'text', text: '15' }
              ]
            },
            // Case C: tool_use_id is not mapped (resolves to unknown_tool)
            {
              type: 'tool_result',
              tool_use_id: 'toolu_key_unmapped_03',
              content: 'Fallback response'
            }
          ]
        }
      ]
    };

    const result = translator.translateClaudeToGoogle(claudePayload);

    // Total conversation bubbles in Gemini contents (assistant bubble + user tool results bubble)
    expect(result.googleRequest.contents.length).toEqual(2);

    const assistantBubble = result.googleRequest.contents[0];
    expect(assistantBubble.role).toEqual('model');
    expect(assistantBubble.parts[0].functionCall.name).toEqual('get_weather');

    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');
    expect(userBubble.parts.length).toEqual(3);

    // Verify Case A: String weather response resolved by ID and converted to functionResponse
    expect(userBubble.parts[0].functionResponse.name).toEqual('get_weather');
    expect(userBubble.parts[0].functionResponse.response.content).toEqual('Sunny, 20 degrees');

    // Verify Case B: Array calc response resolved by ID and converted to functionResponse
    expect(userBubble.parts[1].functionResponse.name).toEqual('calculate_sum');
    expect(userBubble.parts[1].functionResponse.response.content[0].text).toEqual('15');

    // Verify Case C: Unmapped tool result resolved to 'unknown_tool'
    expect(userBubble.parts[2].functionResponse.name).toEqual('unknown_tool');
    expect(userBubble.parts[2].functionResponse.response.content).toEqual('Fallback response');
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

    // Assert 1: output contains tool_use block
    expect(result.content[0].type).toEqual('tool_use');
    expect(result.content[0].name).toEqual('TaskCreate');
    expect(result.content[0].input.subject).toEqual('Explore project context');
    expect(result.content[0].input.description).toEqual('Check files, docs, and recent commits to understand transaction logging.');
    expect(result.content[0].id).toBeDefined();

    // Assert 2: usage and token counts parsed correctly (with thought tokens summed up into output_tokens)
    expect(result.usage.input_tokens).toEqual(47883);
    expect(result.usage.output_tokens).toEqual(53 + 291); // candidates + thoughts
    expect(result.stop_reason).toEqual('tool_use');
  });
});
