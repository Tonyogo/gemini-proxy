export type EndpointOption =
  | 'claude_messages'
  | 'claude_count_tokens'
  | 'gemini_generate_content'
  | 'gemini_count_tokens'
  | 'gemini_models_list'
  | 'custom';

export type ProtocolType = 'claude' | 'gemini' | 'custom';

export type ClaudePresetKey = 'basicChat' | 'toolUse' | 'vision' | 'thinkingMode';
export type GeminiPresetKey = 'geminiBasicChat' | 'geminiSystemInstruction' | 'geminiToolUse' | 'geminiVision' | 'geminiThinking';
export type PresetKey = ClaudePresetKey | GeminiPresetKey;

export const CLAUDE_PRESETS: Record<ClaudePresetKey, any> = {
  basicChat: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Hello! Explain quantum computing in simple terms." }
    ],
    stream: true
  },
  toolUse: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City and state, e.g. San Francisco, CA" },
            unit: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["location"]
        }
      }
    ],
    messages: [
      { role: "user", content: "What is the weather in Tokyo right now?" }
    ],
    stream: false
  },
  vision: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          },
          {
            type: "text",
            text: "Describe this 1x1 red pixel image."
          }
        ]
      }
    ],
    stream: true
  },
  thinkingMode: {
    model: "gemini-pro-latest",
    max_tokens: 2048,
    thinking: {
      type: "enabled",
      budget_tokens: 1024
    },
    messages: [
      { role: "user", content: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }
    ],
    stream: true
  }
};

export const GEMINI_PRESETS: Record<GeminiPresetKey, any> = {
  geminiBasicChat: {
    contents: [
      {
        role: "user",
        parts: [{ text: "Hello! Explain quantum computing in simple terms." }]
      }
    ]
  },
  geminiSystemInstruction: {
    systemInstruction: {
      parts: [{ text: "You are a witty, helpful AI assistant." }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: "Who are you and what can you do?" }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  },
  geminiToolUse: {
    contents: [
      {
        role: "user",
        parts: [{ text: "What is the weather in Tokyo right now?" }]
      }
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City and state, e.g. San Francisco, CA" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] }
              },
              required: ["location"]
            }
          }
        ]
      }
    ]
  },
  geminiVision: {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          },
          { text: "Describe this 1x1 red pixel image." }
        ]
      }
    ]
  },
  geminiThinking: {
    contents: [
      {
        role: "user",
        parts: [{ text: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }]
      }
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 1024
      }
    }
  }
};

export const GEMINI_COUNT_TOKENS_PRESET = {
  contents: [
    {
      role: "user",
      parts: [{ text: "Hello! Count the tokens in this message." }]
    }
  ]
};

export function getProtocolForEndpoint(option: EndpointOption): ProtocolType {
  if (option.startsWith('claude_')) return 'claude';
  if (option.startsWith('gemini_')) return 'gemini';
  return 'custom';
}

export function resolveTargetEndpoint(params: {
  option: EndpointOption;
  model: string;
  isStream: boolean;
  customMethod: string;
  customPath: string;
}): { url: string; method: string; protocol: ProtocolType } {
  const { option, model, isStream, customMethod, customPath } = params;
  const protocol = getProtocolForEndpoint(option);

  switch (option) {
    case 'claude_messages':
      return { url: '/v1/messages', method: 'POST', protocol: 'claude' };
    case 'claude_count_tokens':
      return { url: '/v1/messages/count_tokens', method: 'POST', protocol: 'claude' };
    case 'gemini_generate_content':
      return {
        url: isStream
          ? `/v1beta/models/${model}:streamGenerateContent?alt=sse`
          : `/v1beta/models/${model}:generateContent`,
        method: 'POST',
        protocol: 'gemini'
      };
    case 'gemini_count_tokens':
      return {
        url: `/v1beta/models/${model}:countTokens`,
        method: 'POST',
        protocol: 'gemini'
      };
    case 'gemini_models_list':
      return {
        url: '/v1beta/models',
        method: 'GET',
        protocol: 'gemini'
      };
    case 'custom': {
      const cleanPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
      return {
        url: cleanPath,
        method: customMethod.toUpperCase(),
        protocol: 'custom'
      };
    }
  }
}
