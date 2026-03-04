/** Optional per-agent configuration (config.json) */
export interface AgentConfig {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  description?: string;
  /** Absolute paths to files injected as context in the system prompt */
  context_files?: string[];
}

/** A loaded context file ready for prompt injection */
export interface ContextFile {
  path: string;
  label: string;
  content: string;
}

/** Fully loaded agent definition */
export interface AgentDefinition {
  name: string;
  toolName: string;
  systemPrompt: string;
  memory: string;
  config: AgentConfig;
  dirPath: string;
  contextFiles: ContextFile[];
}

/** Ollama /api/chat request */
export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Ollama /api/chat response (stream: false) */
export interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  total_duration: number;
  prompt_eval_count: number;
  eval_count: number;
}
