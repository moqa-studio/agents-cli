import { existsSync } from "fs";
import { resolve } from "path";
import type { ParsedArgs, AgentInfo, AgentPathInfo, ListAgentsResult } from "../types";
import {
  getAllAgentConfigs,
  getBinaryPath,
  resolveAgentPaths,
  findProjectRoot,
} from "../core/agents";
import { scanAll } from "../core/scanner";
import { printJson, table, shortenPath, c } from "../utils/output";

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const projectRoot = findProjectRoot();
  const configs = getAllAgentConfigs();

  const agents: AgentInfo[] = [];

  for (const config of configs) {
    const binaryPath = await getBinaryPath(config.name);
    const installed = binaryPath !== null;

    // Resolve paths and check existence
    const resolved = resolveAgentPaths(config, projectRoot);
    const paths: AgentPathInfo[] = [];
    const seenDirs = new Set<string>();

    for (const rp of resolved) {
      // Extract the base directory from the glob pattern (before *)
      const parts = rp.absolutePattern.split("*");
      const baseDir = parts[0].replace(/\/$/, "");

      if (seenDirs.has(baseDir)) continue;
      seenDirs.add(baseDir);

      paths.push({
        scope: rp.scope,
        path: baseDir,
        exists: existsSync(baseDir),
      });
    }

    // Count skills for this agent
    const skills = await scanAll({ agents: [config.name], projectRoot });
    const skillCount = skills.length;

    agents.push({
      name: config.name,
      displayName: config.displayName,
      installed,
      binaryPath,
      skillCount,
      paths,
    });
  }

  const result: ListAgentsResult = { agents };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // Human output
  console.log(c.bold("\nAGS Agents\n"));

  const rows = agents.map((a) => {
    const status = a.installed ? c.green("✓") : c.red("✗");
    const pathSummary = a.paths
      .filter((p) => p.exists)
      .map((p) => shortenPath(p.path))
      .join(", ") || c.dim("—");

    return [
      a.displayName,
      status,
      String(a.skillCount),
      pathSummary,
    ];
  });

  console.log(table(["AGENT", "INSTALLED", "SKILLS", "ACTIVE PATHS"], rows));
  console.log();
}
