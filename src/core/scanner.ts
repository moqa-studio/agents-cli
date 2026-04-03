import { resolve, dirname } from "path";
import { existsSync, readFileSync, statSync } from "fs";
import { Glob } from "bun";
import type {
  AgentName,
  DiscoveredSkill,
  SkillType,
  SkillScope,
} from "../types";
import {
  getAllAgentConfigs,
  resolveAgentPaths,
  findProjectRoot,
  type ResolvedPath,
} from "./agents";
import { parseSkillFile, extractDescription, nameFromFilePath } from "./parser";
import { estimateTokens } from "./tokens";
import { getLastModified } from "../utils/git";
import { computeBadges } from "./health";

export interface ScanOptions {
  agents?: AgentName[];
  types?: SkillType[];
  scopes?: SkillScope[];
  projectRoot?: string;
}

export async function scanAll(opts?: ScanOptions): Promise<DiscoveredSkill[]> {
  const projectRoot = opts?.projectRoot || findProjectRoot();
  const configs = getAllAgentConfigs();

  // Map from absolute file path -> DiscoveredSkill (for deduplication)
  const skillMap = new Map<string, DiscoveredSkill>();

  for (const config of configs) {
    if (opts?.agents && !opts.agents.includes(config.name)) continue;

    const resolved = resolveAgentPaths(config, projectRoot);

    for (const rp of resolved) {
      if (opts?.types && !opts.types.includes(rp.format)) continue;
      if (opts?.scopes && !opts.scopes.includes(rp.scope)) continue;

      const files = await globFiles(rp.absolutePattern);

      for (const filePath of files) {
        const absPath = resolve(filePath);

        // Deduplication: if we already found this file via another agent
        const existing = skillMap.get(absPath);
        if (existing) {
          if (!existing.agents.includes(config.name)) {
            existing.agents.push(config.name);
          }
          continue;
        }

        const skill = await buildSkill(
          absPath,
          rp.format,
          rp.scope,
          config.name
        );
        if (skill) {
          skillMap.set(absPath, skill);
        }
      }
    }
  }

  // Convert to array and compute badges
  const skills = Array.from(skillMap.values());
  const ctx = { allSkills: skills };
  for (const skill of skills) {
    skill.badges = computeBadges(skill, ctx);
  }

  // Sort alphabetically by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

async function buildSkill(
  filePath: string,
  type: SkillType,
  scope: SkillScope,
  agent: AgentName
): Promise<DiscoveredSkill | null> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseSkillFile(content);
    const stat = statSync(filePath);
    const lastModified = await getLastModified(filePath);

    const name =
      parsed.frontmatter.name
        ? String(parsed.frontmatter.name)
        : nameFromFilePath(filePath);

    return {
      name,
      type,
      scope,
      description: extractDescription(parsed),
      agents: [agent],
      filePath,
      dirPath: dirname(filePath),
      tokenEstimate: estimateTokens(content),
      fileSize: stat.size,
      lineCount: content.split("\n").length,
      lastModified,
      badges: [], // computed after all skills are collected
      frontmatter: parsed.frontmatter,
      rawContent: content,
    };
  } catch {
    return null;
  }
}

async function globFiles(pattern: string): Promise<string[]> {
  // Split pattern into base directory and glob part
  // e.g., "/Users/x/.claude/skills/*/SKILL.md"
  //        base: "/Users/x/.claude/skills"
  //        glob: "*/SKILL.md"

  const parts = pattern.split("/");
  let baseIdx = parts.length - 1;

  // Find where the glob characters start
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes("*") || parts[i].includes("?") || parts[i].includes("[")) {
      baseIdx = i;
      break;
    }
  }

  const baseDir = parts.slice(0, baseIdx).join("/") || "/";
  const globPattern = parts.slice(baseIdx).join("/");

  if (!existsSync(baseDir)) return [];

  const results: string[] = [];
  const glob = new Glob(globPattern);

  for await (const match of glob.scan({ cwd: baseDir, absolute: true })) {
    results.push(match);
  }

  return results;
}
