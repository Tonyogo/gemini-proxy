import translator from '../src/services/claudeTranslator';
import config, { updateConfig } from '../config/default';

describe('Dynamic Config Hot-Reload in Translator', () => {
  afterEach(async () => {
    // Reset config to defaults
    await updateConfig({
      customSystemInstruction: '',
      runtimeContextTag: 'runtime-context',
      systemRoleToInstruction: false,
      modelMappings: {}
    });
  });

  it('immediately applies customSystemInstruction changes without server restart', async () => {
    await updateConfig({
      customSystemInstruction: 'Dynamic Injected System Rule'
    });

    const payload = {
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;

    const result = translator.translateClaudeToGoogle(payload);
    expect(result.googleRequest.systemInstruction!.parts[0].text).toContain('Dynamic Injected System Rule');
  });

  it('immediately applies MODEL_MAPPINGS changes without server restart', async () => {
    await updateConfig({
      modelMappings: {
        'my-custom-alias': 'gemini-1.5-flash-target'
      }
    });

    const payload = {
      model: 'my-custom-alias',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;

    const result = translator.translateClaudeToGoogle(payload);
    expect(result.cleanModelName).toBe('gemini-1.5-flash-target');
  });

  it('immediately applies RUNTIME_CONTEXT_TAG changes without server restart', async () => {
    await updateConfig({
      runtimeContextTag: 'dynamic-context-tag'
    });

    const payload = {
      model: 'gemini-1.5-flash',
      messages: [{ role: 'system', content: 'System instruction' }, { role: 'user', content: 'Hi' }]
    } as any;

    const result = translator.translateClaudeToGoogle(payload);
    expect(result.googleRequest.contents[0].parts[0].text).toContain('<dynamic-context-tag>');
  });
});
