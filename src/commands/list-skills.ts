import type { ParsedArgs, AgentName, SkillScope, DiscoveredSkill } from "../types";
import { scanAll } from "../core/scanner";
import { isValidAgentName } from "../core/agents";
import { formatTokens } from "../core/tokens";
import {
  printError,
  printJson,
  table,
  formatBadges,
  formatAgent,
  formatAgents,
  formatType,
  shortenPath,
  parseScopeFlag,
  c,
} from "../utils/output";

interface ListSkillsResult {
  skills: DiscoveredSkill[];
  total: number;
  totalTokens: number;
}

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

  const scopes = parseScopeFlag(args.flags.scope, json);

  const skills = await scanAll({ agents, types: ["skill"], scopes });

  const totalTokens = skills.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const result: ListSkillsResult = { skills, total: skills.length, totalTokens };

  if (json) {
    printJson({ ok: true, data: result });
  }

  if (skills.length === 0) {
    console.log(c.dim("No skills found."));
    return;
  }

  console.log(c.bold(`\nAGS Skills — ${skills.length} found\n`));

  const rows = skills.map((s) => [
    c.bold(s.name),
    formatScope(s.scope),
    formatAgents(s.agents),
    formatTokens(s.tokenEstimate),
    formatBadges(s.badges),
    c.dim(shortenPath(s.filePath)),
  ]);

  console.log(table(["NAME", "SCOPE", "AGENT(S)", "TOKENS", "BADGES", "PATH"], rows));
  console.log(
    `\n${c.dim("Total:")} ${skills.length} skills, ${formatTokens(totalTokens)} tokens\n`
  );
}

function formatScope(scope: SkillScope): string {
  switch (scope) {
    case "project": return c.blue("local");
    case "user": return c.cyan("global");
    case "admin": return c.yellow("admin");
    case "system": return c.dim("system");
    default: return scope;
  }
}
