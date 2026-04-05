import { existsSync } from "fs";
import type { ParsedArgs, AgentName, SkillType, ScanResult, DiscoveredSkill } from "../types";
import { scanAll } from "../core/scanner";
import {
  getAllAgentConfigs,
  getBinaryPath,
  resolveAgentPaths,
  findProjectRoot,
} from "../core/agents";
import { formatTokens } from "../core/tokens";
import {
  printError,
  printJson,
  table,
  formatBadges,
  formatAgent,
  formatAgents,
  formatType,
  formatScope,
  scopeLabel,
  shortenPath,
  parseScopeFlag,
  parseAgentFlag,
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
  const agents = parseAgentFlag(args.flags.agent, json);

  let types: SkillType[] | undefined;
  if (args.flags.type) {
    const t = String(args.flags.type) as SkillType;
    if (!["skill", "command", "rule", "agent"].includes(t)) {
      return printError(`Unknown type: ${t}. Use: skill, command, rule, agent`, "INVALID_TYPE", json);
    }
    types = [t];
  }

  const scopes = parseScopeFlag(args.flags.scope, json);
  const showInstalled = args.flags.installed === true;

  // If --installed, show agent installation info
  if (showInstalled) {
    return runInstalled(json);
  }

  const skills = await scanAll({ agents, types, scopes });

  // Build summary
  const totalTokens = skills.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const summary: ScanResult["summary"] = {
    total: skills.length,
    totalTokens,
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

  console.log(c.bold(`\nAGS Scan — ${skills.length} items found\n`));

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
    `${c.dim("Total:")} ${summary.total} | ${agentParts} | ${typeParts} | ${scopeParts} | ${formatTokens(totalTokens)} tokens`
  );

  if (Object.keys(summary.badges).length > 0) {
    const badgeParts = Object.entries(summary.badges)
      .map(([k, v]) => `${v} ${k}`)
      .join(" | ");
    console.log(`${c.dim("Badges:")} ${badgeParts}`);
  }

  console.log();
}

// ── --installed: show agent installation info ───────────────────

async function runInstalled(json: boolean): Promise<void> {
  const projectRoot = findProjectRoot();
  const configs = getAllAgentConfigs();
  const allSkills = await scanAll({ projectRoot });

  const agents = [];

  for (const config of configs) {
    const binaryPath = await getBinaryPath(config.name);
    const installed = binaryPath !== null;

    // Resolve paths and check existence
    const resolved = resolveAgentPaths(config, projectRoot);
    const seenDirs = new Set<string>();
    const paths: { scope: string; path: string; exists: boolean }[] = [];

    for (const rp of resolved) {
      const baseDir = rp.absolutePattern.split("*")[0].replace(/\/$/, "");
      if (seenDirs.has(baseDir)) continue;
      seenDirs.add(baseDir);
      paths.push({ scope: rp.scope, path: baseDir, exists: existsSync(baseDir) });
    }

    const skillCount = allSkills.filter((s) => s.agents.includes(config.name)).length;

    agents.push({
      name: config.name,
      displayName: config.displayName,
      installed,
      binaryPath,
      skillCount,
      paths,
    });
  }

  if (json) {
    printJson({ ok: true, data: { agents } });
  }

  console.log(c.bold("\nAGS Agents\n"));

  const rows = agents.map((a) => {
    const status = a.installed ? c.green("✓") : c.red("✗");
    const pathSummary = a.paths
      .filter((p) => p.exists)
      .map((p) => shortenPath(p.path))
      .join(", ") || c.dim("—");

    return [a.displayName, status, String(a.skillCount), pathSummary];
  });

  console.log(table(["AGENT", "INSTALLED", "SKILLS", "ACTIVE PATHS"], rows));
  console.log();
}

// ── Helpers ─────────────────────────────────────────────────────

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
