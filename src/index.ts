#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAgents } from "./agent-loader.js";
import { OllamaClient } from "./ollama-client.js";
import type { AgentDefinition } from "./types.js";

const AGENTS_DIR = process.env.AGENTS_DIR;
if (!AGENTS_DIR) {
  console.error("Missing required environment variable: AGENTS_DIR");
  process.exit(1);
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b";
const MEMORY_MARKER = "<!-- MEMORY_UPDATE -->";

const agents = loadAgents(AGENTS_DIR);
if (agents.length === 0) {
  console.error(`No agents found in ${AGENTS_DIR}`);
  process.exit(1);
}

const agentMap = new Map<string, AgentDefinition>();
for (const agent of agents) {
  agentMap.set(agent.toolName, agent);
}

const ollama = new OllamaClient(OLLAMA_URL);

const server = new Server(
  { name: "ollama-agents", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

function extractMemorySuggestions(text: string) {
  const idx = text.indexOf(MEMORY_MARKER);
  if (idx === -1) return { response: text, memorySuggestions: undefined };
  return {
    response: text.substring(0, idx).trim(),
    memorySuggestions: text.substring(idx + MEMORY_MARKER.length).trim(),
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: agents.map((agent) => {
      const model = agent.config.model ?? OLLAMA_MODEL;
      return {
        name: agent.toolName,
        description:
          agent.config.description ??
          `Ask the "${agent.name}" local LLM agent (model: ${model}). Delegates to Ollama for offline analysis.`,
        inputSchema: {
          type: "object" as const,
          properties: {
            task: {
              type: "string",
              description: "The task or question to send to the agent",
            },
            context: {
              type: "string",
              description:
                "Optional additional context (code snippet, diff, file content)",
            },
          },
          required: ["task"],
        },
      };
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const agent = agentMap.get(request.params.name);
  if (!agent) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments as { task: string; context?: string } | undefined;
  if (!args?.task) {
    return {
      content: [{ type: "text" as const, text: "Missing required parameter: task" }],
      isError: true,
    };
  }

  const model = agent.config.model ?? OLLAMA_MODEL;

  const systemParts = [agent.systemPrompt];
  if (agent.contextFiles.length > 0) {
    for (const cf of agent.contextFiles) {
      systemParts.push(`\n\n---\n## Reference: ${cf.label}\n\n${cf.content}`);
    }
  }
  if (agent.memory) {
    systemParts.push("\n\n---\n## Persistent Memory\n\n" + agent.memory);
  }
  systemParts.push(
    "\n\n---\n" +
      "If you learn something that should be remembered for future interactions, " +
      `append it after a "${MEMORY_MARKER}" marker at the end of your response. ` +
      "Only suggest memory updates for stable, reusable knowledge — not task-specific details.",
  );

  let userMessage = args.task;
  if (args.context) {
    userMessage += "\n\n---\n## Context\n\n" + args.context;
  }

  try {
    const result = await ollama.chat(
      model,
      [
        { role: "system", content: systemParts.join("") },
        { role: "user", content: userMessage },
      ],
      {
        temperature: agent.config.temperature,
        max_tokens: agent.config.max_tokens,
      },
    );

    const { response, memorySuggestions } = extractMemorySuggestions(
      result.message.content,
    );

    const output = {
      response,
      memory_suggestions: memorySuggestions,
      metadata: {
        agent: agent.name,
        model: result.model,
        prompt_tokens: result.prompt_eval_count ?? 0,
        completion_tokens: result.eval_count ?? 0,
        duration_ms: Math.round((result.total_duration ?? 0) / 1_000_000),
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            agent: agent.name,
            model,
          }),
        },
      ],
      isError: true,
    };
  }
});

for (const agent of agents) {
  console.error(
    `[ollama-agents] Registered: ${agent.toolName} (model: ${agent.config.model ?? OLLAMA_MODEL})`,
  );
}
console.error(`[ollama-agents] ${agents.length} agent(s) loaded from ${AGENTS_DIR}`);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
