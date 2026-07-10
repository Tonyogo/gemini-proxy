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
});
