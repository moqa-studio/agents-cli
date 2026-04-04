import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { ParsedArgs, AgentName, GrabResult } from "../types";
import { getAgentConfig, findProjectRoot, isValidAgentName, expandPattern } from "../core/agents";
import { parseSkillFile, nameFromFilePath } from "../core/parser";
import { estimateTokens, formatTokens } from "../core/tokens";
import { parseGitHubUrl, fetchRawContent } from "../utils/github";
import { printJson, printError, c } from "../utils/output";

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const url = args.positional[0];

  if (!url) {
    return printError("Usage: ags grab <github-url> [--to agent]", "MISSING_URL", json);
  }

  const targetAgent = (args.flags.to as string) || "claude";
  if (!isValidAgentName(targetAgent)) {
    return printError(`Unknown agent: ${targetAgent}`, "INVALID_AGENT", json);
  }

  const info = parseGitHubUrl(url);
  if (!info) {
    return printError(
      "Invalid GitHub URL. Expected: https://github.com/owner/repo/blob/branch/path/to/SKILL.md",
      "INVALID_URL",
      json
    );
  }

  let content: string;
  try {
    content = await fetchRawContent(info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return printError(msg, "FETCH_FAILED", json);
  }

  const parsed = parseSkillFile(content);
  const name = parsed.frontmatter.name
    ? String(parsed.frontmatter.name)
    : nameFromFilePath(info.path);

  const tokens = estimateTokens(content);

  const projectRoot = findProjectRoot();
  const agentConfig = getAgentConfig(targetAgent);

  const projectPath = agentConfig.paths.find((p) => p.scope === "project" && p.format === "skill");
  const userPath = agentConfig.paths.find((p) => p.scope === "user" && p.format === "skill");
  const targetPath = projectPath || userPath;

  if (!targetPath) {
    return printError(`No skill path configured for ${targetAgent}`, "NO_PATH", json);
  }

  const destPattern = expandPattern(targetPath.pattern, projectRoot);
  const destination = destPattern.replace("*/SKILL.md", `${name}/SKILL.md`);

  if (existsSync(destination)) {
    return printError(
      `Skill "${name}" already exists at ${destination}`,
      "SKILL_EXISTS",
      json
    );
  }

  const destDir = dirname(destination);
  mkdirSync(destDir, { recursive: true });
  writeFileSync(destination, content, "utf-8");

  const result: GrabResult = {
    name,
    source: url,
    destination,
    tokens,
    agent: targetAgent,
  };

  if (json) {
    printJson({ ok: true, data: result });
  }

  console.log(c.bold("\nAGS Grab\n"));
  console.log(`  ${c.bold("Name:")}    ${name}`);
  console.log(`  ${c.bold("Agent:")}   ${targetAgent}`);
  console.log(`  ${c.bold("Tokens:")}  ${formatTokens(tokens)}`);
  console.log(`  ${c.bold("Source:")}  ${c.dim(url)}`);
  console.log(`  ${c.bold("Saved:")}   ${destination}`);
  console.log();
  console.log(c.green(`  ✓ Skill "${name}" installed for ${targetAgent}`));
  console.log();
}
