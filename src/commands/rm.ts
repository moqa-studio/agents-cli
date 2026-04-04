import { existsSync, unlinkSync, rmdirSync, readdirSync } from "fs";
import { dirname, resolve } from "path";
import type { ParsedArgs, AgentName, DiscoveredSkill } from "../types";
import { scanAll } from "../core/scanner";
import { isValidAgentName } from "../core/agents";
import { formatTokens } from "../core/tokens";
import { printJson, printError, formatAgent, c } from "../utils/output";

interface RmResult {
  removed: { name: string; agent: AgentName; type: string; path: string; tokens: number }[];
  notFound: string[];
}

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const target = args.positional[0];

  if (!target) {
    return printError("Usage: ags rm <name-or-path> [--agent X]", "MISSING_TARGET", json);
  }

  // Optional agent filter
  let agentFilter: AgentName | undefined;
  if (args.flags.agent) {
    const a = String(args.flags.agent);
    if (!isValidAgentName(a)) {
      return printError(`Unknown agent: ${a}`, "INVALID_AGENT", json);
    }
    agentFilter = a;
  }

  // Find matching items
  const allItems = await scanAll();
  let matches: DiscoveredSkill[];

  // Match by path (absolute or shortened)
  const absTarget = resolve(target);
  const isPath = target.includes("/") || target.includes(".");

  if (isPath) {
    matches = allItems.filter((s) =>
      s.filePath === absTarget ||
      s.filePath === target ||
      s.filePath.endsWith("/" + target)
    );
  } else {
    // Match by name
    matches = allItems.filter((s) => s.name === target);
  }

  // Filter by agent if specified
  if (agentFilter) {
    matches = matches.filter((s) => s.agents.includes(agentFilter!));
  }

  if (matches.length === 0) {
    return printError(
      `No match found for "${target}"${agentFilter ? ` (agent: ${agentFilter})` : ""}`,
      "NOT_FOUND",
      json
    );
  }

  const dryRun = args.flags["dry-run"] === true;

  // Remove each match
  const result: RmResult = { removed: [], notFound: [] };

  for (const item of matches) {
    if (!existsSync(item.filePath)) {
      result.notFound.push(item.filePath);
      continue;
    }

    if (!dryRun) {
      // Delete the file
      unlinkSync(item.filePath);

      // If it was a SKILL.md inside a skill directory, clean up the directory if empty
      const dir = dirname(item.filePath);
      if (item.filePath.endsWith("/SKILL.md")) {
        tryRemoveEmptyDir(dir);
      }
    }

    result.removed.push({
      name: item.name,
      agent: item.agents[0],
      type: item.type,
      path: item.filePath,
      tokens: item.tokenEstimate,
    });
  }

  if (json) {
    return printJson({ ok: true, data: { ...result, dryRun } });
  }

  // Human output
  const prefix = dryRun ? c.yellow("[dry-run] ") : "";
  console.log(c.bold(`\n${prefix}AGS Remove\n`));

  for (const r of result.removed) {
    const verb = dryRun ? c.yellow("~") : c.red("✕");
    console.log(
      `  ${verb} ${c.bold(r.name)} ${c.dim(`(${r.type})`)} ${formatAgent(r.agent as AgentName)}  ${c.dim("−" + formatTokens(r.tokens))}`
    );
    console.log(`    ${c.dim(r.path)}`);
  }

  if (result.notFound.length > 0) {
    for (const p of result.notFound) {
      console.log(`  ${c.yellow("?")} ${c.dim(p)} — file already gone`);
    }
  }

  const totalTokens = result.removed.reduce((sum, r) => sum + r.tokens, 0);
  if (dryRun) {
    console.log(
      `\n  ${result.removed.length} would be removed, ${formatTokens(totalTokens)} tokens would be freed\n`
    );
  } else {
    console.log(
      `\n  ${result.removed.length} removed, ${formatTokens(totalTokens)} tokens freed\n`
    );
  }
}

function tryRemoveEmptyDir(dir: string): void {
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) {
      rmdirSync(dir);
    }
  } catch {
    // ignore
  }
}
