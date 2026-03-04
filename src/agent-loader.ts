import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentDefinition, AgentConfig } from "./types.js";

const DEFAULT_CONFIG: AgentConfig = {
  temperature: 0.3,
  max_tokens: 4096,
};

function kebabToToolName(kebab: string): string {
  return `ask_${kebab.replace(/-/g, "_")}`;
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

    const systemPath = join(dirPath, "system.md");
    if (!existsSync(systemPath)) {
      console.error(`[warn] Skipping ${entry}: no system.md found`);
      continue;
    }

    const systemPrompt = readFileSync(systemPath, "utf-8");
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

    agents.push({
      name: entry,
      toolName: kebabToToolName(entry),
      systemPrompt,
      memory,
      config,
      dirPath,
    });
  }

  return agents;
}
