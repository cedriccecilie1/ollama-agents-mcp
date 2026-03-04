import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDefinition, AgentConfig, ContextFile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_PROMPTS_DIR = join(__dirname, "..", "prompts");

const DEFAULT_CONFIG: AgentConfig = {
  temperature: 0.3,
  max_tokens: 4096,
};

function kebabToToolName(kebab: string): string {
  return `ask_${kebab.replace(/-/g, "_")}`;
}

/**
 * Resolve system.md: client dir first, fallback to shared prompts/.
 * Returns the content or null if not found anywhere.
 */
function resolveSystemPrompt(clientDir: string, agentName: string): string | null {
  // 1. Client-specific override
  const clientPath = join(clientDir, "system.md");
  if (existsSync(clientPath)) {
    console.error(`[ollama-agents] ${agentName}: using client system.md`);
    return readFileSync(clientPath, "utf-8");
  }

  // 2. Shared prompt in MCP server prompts/
  const sharedPath = join(SHARED_PROMPTS_DIR, agentName, "system.md");
  if (existsSync(sharedPath)) {
    console.error(`[ollama-agents] ${agentName}: using shared system.md`);
    return readFileSync(sharedPath, "utf-8");
  }

  return null;
}

export function loadAgents(agentsDir: string): AgentDefinition[] {
  if (!existsSync(agentsDir)) {
    throw new Error(`Agents directory not found: ${agentsDir}`);
  }

  const entries = readdirSync(agentsDir);
  const agents: AgentDefinition[] = [];

  for (const entry of entries) {
    const dirPath = join(agentsDir, entry);
    if (!statSync(dirPath).isDirectory()) continue;

    const systemPrompt = resolveSystemPrompt(dirPath, entry);
    if (!systemPrompt) {
      console.error(`[warn] Skipping ${entry}: no system.md found (client or shared)`);
      continue;
    }

    const memoryPath = join(dirPath, "memory.md");
    const memory = existsSync(memoryPath)
      ? readFileSync(memoryPath, "utf-8")
      : "";

    const configPath = join(dirPath, "config.json");
    let config: AgentConfig = { ...DEFAULT_CONFIG };
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
        config = { ...DEFAULT_CONFIG, ...parsed };
      } catch {
        console.error(`[warn] Invalid config.json in ${entry}, using defaults`);
      }
    }

    const contextFiles: ContextFile[] = [];
    if (config.context_files) {
      for (const filePath of config.context_files) {
        const normalizedPath = filePath.replace(/\\/g, "/");
        if (existsSync(normalizedPath)) {
          try {
            const content = readFileSync(normalizedPath, "utf-8");
            contextFiles.push({
              path: normalizedPath,
              label: basename(normalizedPath),
              content,
            });
            console.error(`[ollama-agents] ${entry}: loaded context file ${basename(normalizedPath)} (${(content.length / 1024).toFixed(1)}KB)`);
          } catch {
            console.error(`[warn] ${entry}: failed to read context file ${normalizedPath}`);
          }
        } else {
          console.error(`[warn] ${entry}: context file not found ${normalizedPath}`);
        }
      }
    }

    agents.push({
      name: entry,
      toolName: kebabToToolName(entry),
      systemPrompt,
      memory,
      config,
      dirPath,
      contextFiles,
    });
  }

  return agents;
}
