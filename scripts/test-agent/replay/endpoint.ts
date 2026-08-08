export interface LlmEndpointConfig {
  type: "mock-openai" | "vllm" | "llamacpp" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveLlmEndpoint(port?: number): LlmEndpointConfig {
  const p = port ?? 0;
  return {
    type: (process.env.LLM_ENDPOINT_TYPE as LlmEndpointConfig["type"]) ?? "mock-openai",
    baseUrl: process.env.LLM_ENDPOINT_URL ?? `http://127.0.0.1:${p}`,
    apiKey: "test-key",
    model: process.env.LLM_ENDPOINT_MODEL ?? "test-model",
  };
}
