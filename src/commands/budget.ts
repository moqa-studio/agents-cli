import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type {
  ParsedArgs,
  AgentName,
  SkillScope,
  BudgetResult,
  BudgetConfigFile,
  BudgetEntry,
  BudgetAgentSummary,
  BudgetContextLimit,
} from "../types";
import { scanAll } from "../core/scanner";
import {
  getAllAgentConfigs,
  findProjectRoot,
  getContextLimit,
} from "../core/agents";
import { estimateTokens, formatTokens, tokenBar } from "../core/tokens";
import { printJson, printError, heading, formatAgent, c } from "../utils/output";

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const projectRoot = findProjectRoot();

  // Parse scope filter
  let scopes: SkillScope[] | undefined;
  if (args.flags.scope) {
    const s = String(args.flags.scope);
    const validScopes: Record<string, SkillScope[] | undefined> = {
      local: ["project"],
      global: ["user"],
      project: ["project"],
      user: ["user"],
      all: undefined,
    };
    if (!(s in validScopes)) {
      return printError(`Unknown scope: ${s}. Use: local, global, all`, "INVALID_SCOPE", json);
    }
    scopes = validScopes[s];
  }

  // Scan only skills (not agents, commands, rules)
  const allItems = await scanAll({ projectRoot, scopes, types: ["skill"] });

  // Scan config files
  const configFiles: BudgetConfigFile[] = [];
  for (const config of getAllAgentConfigs()) {
    for (const cf of config.configFiles) {
      const fullPath = resolve(projectRoot, cf);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const tokens = estimateTokens(content);
          configFiles.push({ name: cf, tokens, filePath: fullPath });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  // Build per-skill entries (sorted by tokens desc)
  const entries: BudgetEntry[] = allItems
    .flatMap((s) =>
      s.agents.map((agent) => ({
        name: s.name,
        agent,
        tokens: s.tokenEstimate,
        percentage: 0,
        filePath: s.filePath,
      }))
    )
    .sort((a, b) => b.tokens - a.tokens);

  // Per-agent summaries
  const byAgent: Partial<Record<AgentName, BudgetAgentSummary>> = {};
  for (const entry of entries) {
    const existing = byAgent[entry.agent] || { tokens: 0, count: 0 };
    existing.tokens += entry.tokens;
    existing.count += 1;
    byAgent[entry.agent] = existing;
  }

  // Add config file tokens to agent totals
  for (const cf of configFiles) {
    let agent: AgentName | null = null;
    if (cf.name.toLowerCase().includes("claude")) agent = "claude";
    else if (cf.name.includes("cursorrules")) agent = "cursor";

    if (agent) {
      const existing = byAgent[agent] || { tokens: 0, count: 0 };
      existing.tokens += cf.tokens;
      byAgent[agent] = existing;
    }
  }

  // Context limits
  const contextLimits: Partial<Record<AgentName, BudgetContextLimit>> = {};
  const totalTokens =
    entries.reduce((sum, e) => sum + e.tokens, 0) +
    configFiles.reduce((sum, cf) => sum + cf.tokens, 0);

  for (const [agent, summary] of Object.entries(byAgent)) {
    const limit = getContextLimit(agent as AgentName);
    const pct = (summary.tokens / limit) * 100;
    contextLimits[agent as AgentName] = {
      limit,
      used: summary.tokens,
      percentage: Math.round(pct * 10) / 10,
    };
  }

  // Update percentages — bars relative to context limit, not to max skill
  for (const entry of entries) {
    const limit = getContextLimit(entry.agent);
    entry.percentage = Math.round((entry.tokens / limit) * 1000) / 10;
  }

  // Generate top suggestions (max 5, ranked by token savings)
  const suggestions: string[] = [];
  const candidates: { text: string; tokens: number }[] = [];

  for (const skill of allItems) {
    if (skill.badges.includes("STALE") && skill.badges.includes("HEAVY")) {
      const daysAgo = Math.floor((Date.now() / 1000 - skill.lastModified) / 86400);
      candidates.push({
        text: `Remove "${skill.name}" — stale (${daysAgo}d), saves ${formatTokens(skill.tokenEstimate)} tokens`,
        tokens: skill.tokenEstimate,
      });
    } else if (skill.badges.includes("STALE")) {
      const daysAgo = Math.floor((Date.now() / 1000 - skill.lastModified) / 86400);
      candidates.push({
        text: `Remove stale "${skill.name}" (${daysAgo}d unused, ${formatTokens(skill.tokenEstimate)} tokens)`,
        tokens: skill.tokenEstimate,
      });
    }
  }

  // Sort by biggest savings first, take top 5
  candidates.sort((a, b) => b.tokens - a.tokens);
  for (const c of candidates.slice(0, 5)) {
    suggestions.push(c.text);
  }

  // Add context warning if over 10%
  for (const [agent, cl] of Object.entries(contextLimits)) {
    if (cl.percentage > 10) {
      suggestions.push(
        `${agent}: ${cl.percentage}% of context used by skills before your first message`
      );
    }
  }

  const result: BudgetResult = {
    totalTokens,
    configFiles,
    skills: entries,
    byAgent,
    contextLimits,
    suggestions,
  };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // Human output
  console.log(heading("\nAGS Skill Cost\n"));

  // Config files
  if (configFiles.length > 0) {
    console.log(c.bold("Config files"));
    for (const cf of configFiles) {
      console.log(
        `  ${cf.name.padEnd(30)} ${formatTokens(cf.tokens).padStart(6)} tokens`
      );
    }
    console.log();
  }

  // Skills ranked by token cost — bars relative to agent context limit
  if (entries.length > 0) {
    console.log(c.bold("Skills ranked by token cost"));
    console.log();
    for (const entry of entries) {
      const limit = getContextLimit(entry.agent);
      const name = c.bold(entry.name.padEnd(24));
      const agent = formatAgent(entry.agent);
      const tokens = formatTokens(entry.tokens).padStart(6);
      const bar = tokenBar(entry.tokens, limit, 20);
      console.log(`  ${name} ${agent}  ${tokens}  ${bar}`);
    }
    console.log();
  }

  // Agent subtotals
  if (Object.keys(contextLimits).length > 0) {
    console.log(c.bold("Context usage per agent"));
    console.log();
    for (const [agent, cl] of Object.entries(contextLimits)) {
      const icon = formatAgent(agent as AgentName);
      const tokens = formatTokens(cl.used);
      const limit = formatTokens(cl.limit);
      const bar = tokenBar(cl.used, cl.limit, 30);
      console.log(`  ${icon}  ${bar}  ${tokens} / ${limit}`);
    }
    console.log();
  }

  // Suggestions (max 5)
  if (suggestions.length > 0) {
    console.log(c.bold("Top suggestions"));
    console.log();
    for (const s of suggestions) {
      console.log(`  ${c.yellow("→")} ${s}`);
    }
    console.log();
  }
}
