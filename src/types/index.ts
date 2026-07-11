export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export interface ClaudeRequest {
  model?: string;
  system?: string | any[];
  messages: ClaudeMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  tools?: any[];
  tool_choice?: any;
  output_format?: any;
  output_config?: any;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: any };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[]; role: 'user' };
  generationConfig?: Record<string, any>;
  thinkingConfig?: { thinkingBudget?: number };
  tools?: any[];
}

export interface ModelConfig {
  type: 'model';
  id: string;
  display_name: string;
  created_at: string;
  gemini_mapping: string;
}
