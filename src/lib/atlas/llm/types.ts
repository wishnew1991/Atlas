export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmMessage {
  role: LlmRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolParameter {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
  items?: LlmToolParameter;
  properties?: Record<string, LlmToolParameter>;
  required?: string[];
}

export interface LlmTool {
  name: string;
  description: string;
  parameters: LlmToolParameter;
}

export type LlmProvider = "openai" | "anthropic" | "google" | "custom" | "nvidia";

export type LlmToolChoice = "auto" | "none" | "required";

export interface LlmChatOptions {
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: LlmToolChoice;
  temperature?: number;
  stream?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey: string;
  baseUrl?: string;
  provider: LlmProvider;
}

export interface LlmEmbedOptions {
  model: string;
  input: string | string[];
  apiKey: string;
  baseUrl?: string;
  provider: LlmProvider;
  inputType?: "query" | "passage";
}

export interface LlmEmbedResult {
  embeddings: number[][];
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type LlmChunk =
  | { type: "token"; text: string }
  | { type: "tool_call"; call: LlmToolCall }
  | { type: "done"; usage?: LlmUsage };

export interface LlmResult {
  content: string;
  toolCalls: LlmToolCall[];
  finishReason?: string;
  usage?: LlmUsage;
}

export interface LlmAdapter {
  chat(options: LlmChatOptions): Promise<LlmResult>;
  streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk>;
  embed?(options: LlmEmbedOptions): Promise<LlmEmbedResult>;
}
