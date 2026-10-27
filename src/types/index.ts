export interface ClaudeTextBlock {
  type: 'text';
  text: string;
  [key: string]: any;
}

export interface ClaudeThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
  [key: string]: any;
}

export interface ClaudeRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
  [key: string]: any;
}

export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
  [key: string]: any;
}

export interface ClaudeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | any[];
  is_error?: boolean;
  [key: string]: any;
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeRedactedThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock
  | Record<string, any>;

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  [key: string]: any;
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
  stop_sequences?: string[];
  thinking?: {
    type: 'enabled' | 'disabled';
    budget_tokens?: number;
    [key: string]: any;
  } | any;
  tools?: ClaudeTool[] | any[];
  tool_choice?: any;
  output_format?: any;
  output_config?: any;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, any>; id?: string };
  functionResponse?: { name: string; response: any; id?: string };
  thoughtSignature?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[]; role: 'user' };
  generationConfig?: Record<string, any>;
  tools?: any[];
  toolConfig?: any;
}

export interface GeminiModelEntry {
  name: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature: number;
  topP: number;
  topK: number;
  maxTemperature: number;
  thinking?: boolean;
}

export interface GeminiModelsResponse {
  models: GeminiModelEntry[];
}

export interface ModelConfig {
  type: 'model';
  id: string;
  display_name: string;
  created_at: string;
}

export type SchedulingStrategy = 'least-used' | 'round-robin' | 'weighted';

export interface ModelMappingTargetConfig {
  target?: string;
  targets?: string[];
  strategy?: SchedulingStrategy;
}

export type ModelMappingValue = string | string[] | ModelMappingTargetConfig;

export type ModelMappingsConfig = Record<string, ModelMappingValue>;

export type EffortLevel = 'low' | 'medium' | 'high';
export type EffortModelMappings = Record<EffortLevel, ModelMappingsConfig>;

export type DiscoverAppType = 'builtin' | 'custom';

export interface DiscoverAppItem {
  id: string;
  type: DiscoverAppType;
  name: string;
  description?: string;
  icon: string;
  color: string;
  badge?: string;
  enabled: boolean;
  order: number;
  url?: string;
  useGateway?: boolean;
  createdAt?: number;
}

export interface CustomWebAppItem {
  id: string;
  name: string;
  url: string;
  description?: string;
  icon?: string;
  color?: string;
  useGateway?: boolean;
  createdAt: number;
}

export type UpstreamServerType = 'proxy' | 'direct';

export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: UpstreamServerType;
  apiKeys?: string[];
  proxyUrl?: string;
  useProxy?: boolean;
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
  keyCount?: number;
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  proxyUrl?: string;
  useProxy?: boolean;
}

export interface NormalizedErrorPayload {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export interface NormalizedErrorResponse {
  status: number;
  headers?: Record<string, string>;
  payload: NormalizedErrorPayload;
}

export * from './accountUsage';
export * from './tasks';


