import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { resolve, basename, join } from "path";
import type { ParsedArgs, AgentName, DiscoveredSkill } from "../types";
import { scanAll } from "../core/scanner";
import {
  getAllAgentConfigs,
  findProjectRoot,
  getContextLimit,
  expandPattern,
  isValidAgentName,
} from "../core/agents";
import { estimateTokens, formatTokens, tokenBar } from "../core/tokens";
import { printJson, printError, formatAgent, shortenPath, c } from "../utils/output";

// ── Types ────────────────────────────────────────────────────────

interface ContextItem {
  name: string;
  category: string;          // "config" | "skill" | "command" | "agent" | "memory" | "mcp"
  tokens: number;
  filePath: string;
}

interface AgentContext {
  agent: AgentName;
  items: ContextItem[];
  totalTokens: number;
  contextLimit: number;
  percentage: number;
}

interface ContextResult {
  projectRoot: string;
  agents: AgentContext[];
  grandTotal: number;
}

// ── Command ──────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const projectRoot = findProjectRoot();

  // Optional agent filter
  let agentFilter: AgentName[] | undefined;
  if (args.flags.agent) {
    const names = String(args.flags.agent).split(",");
    for (const name of names) {
      if (!isValidAgentName(name)) {
        return printError(`Unknown agent: ${name}`, "INVALID_AGENT", json);
      }
    }
    agentFilter = names as AgentName[];
  }

  const configs = getAllAgentConfigs();
  const allSkills = await scanAll({ projectRoot });
  const agentContexts: AgentContext[] = [];

  for (const config of configs) {
    if (agentFilter && !agentFilter.includes(config.name)) continue;

    const items: ContextItem[] = [];

    // 1. Config files (CLAUDE.md, .cursorrules)
    for (const cf of config.configFiles) {
      const fullPath = resolve(projectRoot, cf);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          items.push({
            name: cf,
            category: "config",
            tokens: estimateTokens(content),
            filePath: fullPath,
          });
        } catch { /* skip unreadable */ }
      }
    }

    // 2. Skills, commands, agents for this agent
    const agentSkills = allSkills.filter((s) => s.agents.includes(config.name));
    for (const skill of agentSkills) {
      items.push({
        name: skill.name,
        category: skill.type,
        tokens: skill.tokenEstimate,
        filePath: skill.filePath,
      });
    }

    // 3. Memory files (Claude-specific)
    if (config.name === "claude") {
      const memoryItems = scanMemoryFiles(projectRoot);
      items.push(...memoryItems);
    }

    // 4. MCP server configs (from settings files)
    if (config.name === "claude") {
      const mcpItems = scanMcpConfig(projectRoot);
      items.push(...mcpItems);
    }

    const totalTokens = items.reduce((sum, i) => sum + i.tokens, 0);
    const limit = getContextLimit(config.name);

    agentContexts.push({
      agent: config.name,
      items,
      totalTokens,
      contextLimit: limit,
      percentage: Math.round((totalTokens / limit) * 1000) / 10,
    });
  }

  const grandTotal = agentContexts.reduce((sum, a) => sum + a.totalTokens, 0);
  const result: ContextResult = { projectRoot, agents: agentContexts, grandTotal };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // Human output
  console.log(c.bold(`\nAGS Context Map`));
  console.log(c.dim(`Project: ${shortenPath(projectRoot)}\n`));

  for (const ctx of agentContexts) {
    if (ctx.items.length === 0) continue;

    const icon = formatAgent(ctx.agent);
    const bar = tokenBar(ctx.totalTokens, ctx.contextLimit, 25);
    console.log(`${icon}  ${bar}  ${formatTokens(ctx.totalTokens)} / ${formatTokens(ctx.contextLimit)}`);
    console.log();

    // Group by category
    const categories = groupByCategory(ctx.items);
    for (const [cat, catItems] of categories) {
      const catTokens = catItems.reduce((sum, i) => sum + i.tokens, 0);
      console.log(`  ${categoryLabel(cat)} ${c.dim(`(${catItems.length} items, ${formatTokens(catTokens)} tokens)`)}`);

      // Sort by tokens desc within category
      const sorted = [...catItems].sort((a, b) => b.tokens - a.tokens);
      for (const item of sorted) {
        const tokens = formatTokens(item.tokens).padStart(6);
        console.log(`    ${c.bold(item.name.padEnd(28))} ${tokens}  ${c.dim(shortenPath(item.filePath))}`);
      }
      console.log();
    }
  }

  console.log(`${c.dim("Grand total:")} ${formatTokens(grandTotal)} tokens loaded before your first message\n`);
}

// ── Helpers ──────────────────────────────────────────────────────

function scanMemoryFiles(projectRoot: string): ContextItem[] {
  const items: ContextItem[] = [];
  const home = process.env.HOME || "";

  // Find the Claude project memory directory
  // Claude stores project data in ~/.claude/projects/ with path-encoded names
  const claudeProjectsDir = join(home, ".claude", "projects");
  if (!existsSync(claudeProjectsDir)) return items;

  try {
    const projectDirs = readdirSync(claudeProjectsDir);
    for (const dir of projectDirs) {
      const memoryDir = join(claudeProjectsDir, dir, "memory");
      if (!existsSync(memoryDir)) continue;

      // Check if this project dir corresponds to our project
      // Claude encodes paths like: -Users-robin-Documents-project
      const encoded = projectRoot.replace(/\//g, "-");
      if (!dir.includes(encoded) && !dir.endsWith(encoded)) continue;

      try {
        const files = readdirSync(memoryDir);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const filePath = join(memoryDir, file);
          try {
            const content = readFileSync(filePath, "utf-8");
            items.push({
              name: `memory/${file}`,
              category: "memory",
              tokens: estimateTokens(content),
              filePath,
            });
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // Also check MEMORY.md index
  const memoryIndex = join(home, ".claude", "projects");
  // The MEMORY.md is in the project-specific dir, already covered above

  return items;
}

function scanMcpConfig(projectRoot: string): ContextItem[] {
  const items: ContextItem[] = [];
  const home = process.env.HOME || "";

  // Check project-level .claude/settings.local.json and ~/.claude/settings.json
  const settingsPaths = [
    join(projectRoot, ".claude", "settings.local.json"),
    join(home, ".claude", "settings.json"),
    join(home, ".claude", "settings.local.json"),
  ];

  for (const settingsPath of settingsPaths) {
    if (!existsSync(settingsPath)) continue;
    try {
      const content = readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
        const mcpSection = JSON.stringify(parsed.mcpServers, null, 2);
        items.push({
          name: `mcp-servers (${basename(settingsPath)})`,
          category: "mcp",
          tokens: estimateTokens(mcpSection),
          filePath: settingsPath,
        });
      }
    } catch { /* skip */ }
  }

  return items;
}

function groupByCategory(items: ContextItem[]): [string, ContextItem[]][] {
  const order = ["config", "skill", "command", "agent", "memory", "mcp"];
  const groups = new Map<string, ContextItem[]>();

  for (const item of items) {
    const list = groups.get(item.category) || [];
    list.push(item);
    groups.set(item.category, list);
  }

  return order
    .filter((cat) => groups.has(cat))
    .map((cat) => [cat, groups.get(cat)!]);
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "config":  return c.yellow("Config files");
    case "skill":   return c.green("Skills");
    case "command": return c.yellow("Commands");
    case "agent":   return c.cyan("Agents/subagents");
    case "memory":  return c.magenta("Memory files");
    case "mcp":     return c.blue("MCP servers");
    default:        return cat;
  }
}
