import type { ParsedArgs, AgentName, SkillType, SkillScope, ScanResult, DiscoveredSkill } from "../types";
import { scanAll } from "../core/scanner";
import { isValidAgentName } from "../core/agents";
import { formatTokens } from "../core/tokens";
import {
  printError,
  printJson,
  table,
  heading,
  formatBadges,
  formatAgent,
  formatAgents,
  formatType,
  c,
} from "../utils/output";

// Display order and section labels for each type
const TYPE_SECTIONS: { type: SkillType; label: string; icon: string }[] = [
  { type: "skill", label: "Skills", icon: "◇" },
  { type: "command", label: "Commands", icon: "▸" },
  { type: "agent", label: "Agents", icon: "●" },
  { type: "rule", label: "Rules", icon: "§" },
];

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;

  // Parse filters
  let agents: AgentName[] | undefined;
  if (args.flags.agent) {
    const names = String(args.flags.agent).split(",");
    for (const name of names) {
      if (!isValidAgentName(name)) {
        return printError(`Unknown agent: ${name}`, "INVALID_AGENT", json);
      }
    }
    agents = names as AgentName[];
  }

  let types: SkillType[] | undefined;
  if (args.flags.type) {
    const t = String(args.flags.type) as SkillType;
    if (!["skill", "command", "rule", "agent"].includes(t)) {
      return printError(`Unknown type: ${t}. Use: skill, command, rule, agent`, "INVALID_TYPE", json);
    }
    types = [t];
  }

  let scopes: SkillScope[] | undefined;
  if (args.flags.scope) {
    const s = String(args.flags.scope);
    const validScopes: Record<string, SkillScope[]> = {
      local: ["project"],
      global: ["user"],
      project: ["project"],
      user: ["user"],
      all: undefined as unknown as SkillScope[],
    };
    if (!(s in validScopes)) {
      return printError(`Unknown scope: ${s}. Use: local, global, all`, "INVALID_SCOPE", json);
    }
    scopes = validScopes[s] || undefined;
  }

  const skills = await scanAll({ agents, types, scopes });

  // Build summary
  const summary: ScanResult["summary"] = {
    total: skills.length,
    byAgent: {},
    byType: {},
    byScope: {},
    badges: {},
  };

  for (const skill of skills) {
    for (const agent of skill.agents) {
      summary.byAgent[agent] = (summary.byAgent[agent] || 0) + 1;
    }
    summary.byType[skill.type] = (summary.byType[skill.type] || 0) + 1;
    summary.byScope[skill.scope] = (summary.byScope[skill.scope] || 0) + 1;
    for (const badge of skill.badges) {
      summary.badges[badge] = (summary.badges[badge] || 0) + 1;
    }
  }

  const result: ScanResult = { skills, summary };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // Human output
  if (skills.length === 0) {
    console.log(c.dim("Nothing found."));
    return;
  }

  console.log(heading(`\nAGS Scan — ${skills.length} items found\n`));

  // Group by type and render separate tables
  for (const section of TYPE_SECTIONS) {
    const items = skills.filter((s) => s.type === section.type);
    if (items.length === 0) continue;

    const sectionTitle = `${section.icon} ${section.label} (${items.length})`;
    console.log(c.bold(formatType(section.type).replace(section.type, sectionTitle)));
    console.log();

    const rows = items.map((s) => renderRow(s));

    console.log(
      table(
        ["NAME", "SCOPE", "AGENT(S)", "TOKENS", "BADGES", "PATH"],
        rows
      )
    );
    console.log();
  }

  // Summary
  const agentParts = Object.entries(summary.byAgent)
    .map(([k, v]) => `${formatAgent(k as AgentName)} ${v}`)
    .join("  ");
  const typeParts = Object.entries(summary.byType)
    .map(([k, v]) => `${formatType(k as SkillType)} ${v}`)
    .join("  ");
  const scopeParts = Object.entries(summary.byScope)
    .map(([k, v]) => `${scopeLabel(k)}: ${v}`)
    .join(" | ");

  console.log(
    `${c.dim("Total:")} ${summary.total} | ${agentParts} | ${typeParts} | ${scopeParts}`
  );

  if (Object.keys(summary.badges).length > 0) {
    const badgeParts = Object.entries(summary.badges)
      .map(([k, v]) => `${v} ${k}`)
      .join(" | ");
    console.log(`${c.dim("Badges:")} ${badgeParts}`);
  }

  console.log();
}

function renderRow(s: DiscoveredSkill): string[] {
  return [
    c.bold(s.name),
    formatScope(s.scope),
    formatAgents(s.agents),
    formatTokens(s.tokenEstimate),
    formatBadges(s.badges),
    c.dim(shortenPath(s.filePath)),
  ];
}

function formatScope(scope: string): string {
  switch (scope) {
    case "project": return c.blue("local");
    case "user": return c.cyan("global");
    case "admin": return c.yellow("admin");
    case "system": return c.dim("system");
    default: return scope;
  }
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "project": return "local";
    case "user": return "global";
    default: return scope;
  }
}

function shortenPath(filePath: string): string {
  const home = process.env.HOME || "";
  if (home && filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  const cwd = process.cwd();
  if (filePath.startsWith(cwd + "/")) {
    return filePath.slice(cwd.length + 1);
  }
  return filePath;
}
