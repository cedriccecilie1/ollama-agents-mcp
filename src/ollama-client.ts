import type { OllamaChatRequest, OllamaChatResponse, OllamaMessage } from "./types.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_OLLAMA_URL;
  }

  async chat(
    model: string,
    messages: OllamaMessage[],
    options?: { temperature?: number; max_tokens?: number },
  ): Promise<OllamaChatResponse> {
    const body: OllamaChatRequest = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature,
        num_predict: options?.max_tokens,
      },
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        `Cannot reach Ollama at ${this.baseUrl}. ` +
          `Is Ollama running? Start it with 'ollama serve'. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama returned HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as OllamaChatResponse;
  }
}
