import { resolve, dirname } from "path";
import { existsSync } from "fs";
import type { AgentConfig, AgentName, AgentPathConfig, SkillScope } from "../types";

// ── Agent registry ──────────────────────────────────────────────

const AGENTS: AgentConfig[] = [
  {
    name: "claude",
    displayName: "Claude Code",
    paths: [
      // Skills — directory-based (SKILL.md) and flat (.md)
      { scope: "user", pattern: "~/.claude/skills/*/SKILL.md", format: "skill" },
      { scope: "user", pattern: "~/.claude/skills/*.md", format: "skill" },
      { scope: "project", pattern: ".claude/skills/*/SKILL.md", format: "skill" },
      { scope: "project", pattern: ".claude/skills/*.md", format: "skill" },
      // Commands — flat .md files
      { scope: "user", pattern: "~/.claude/commands/*.md", format: "command" },
      { scope: "project", pattern: ".claude/commands/*.md", format: "command" },
      // Agents (subagents) — flat .md files
      { scope: "user", pattern: "~/.claude/agents/*.md", format: "agent" },
      { scope: "project", pattern: ".claude/agents/*.md", format: "agent" },
    ],
    binaryNames: ["claude"],
    configFiles: ["CLAUDE.md", "claude.md"],
    supportedFrontmatter: [
      "name", "description", "disable-model-invocation", "user-invocable",
      "allowed-tools", "model", "effort", "context", "agent", "hooks",
      "paths", "shell", "argument-hint",
    ],
  },
  {
    name: "cursor",
    displayName: "Cursor",
    paths: [
      // Skills — user-level (skills-cursor is Cursor's actual dir name)
      { scope: "user", pattern: "~/.cursor/skills-cursor/*/SKILL.md", format: "skill" },
      { scope: "user", pattern: "~/.cursor/skills-cursor/*.md", format: "skill" },
      { scope: "user", pattern: "~/.cursor/skills/*/SKILL.md", format: "skill" },
      { scope: "user", pattern: "~/.cursor/skills/*.md", format: "skill" },
      // Skills — project-level (shared .agents/ path)
      { scope: "project", pattern: ".agents/skills/*/SKILL.md", format: "skill" },
      // Rules
      { scope: "project", pattern: ".cursor/.rules/*.md", format: "rule" },
      { scope: "project", pattern: ".cursor/rules/*.mdc", format: "rule" },
      { scope: "project", pattern: ".cursor/rules/*.md", format: "rule" },
    ],
    binaryNames: ["cursor"],
    configFiles: [".cursorrules"],
    supportedFrontmatter: [
      "name", "description", "disable-model-invocation",
      "license", "compatibility", "metadata",
    ],
  },
  {
    name: "codex",
    displayName: "Codex",
    paths: [
      { scope: "user", pattern: "~/.agents/skills/*/SKILL.md", format: "skill" },
      { scope: "user", pattern: "~/.agents/skills/*.md", format: "skill" },
      { scope: "project", pattern: ".agents/skills/*/SKILL.md", format: "skill" },
      { scope: "admin", pattern: "/etc/codex/skills/*/SKILL.md", format: "skill" },
    ],
    binaryNames: ["codex"],
    configFiles: [],
    supportedFrontmatter: ["name", "description"],
  },
];

const agentMap = new Map<AgentName, AgentConfig>(
  AGENTS.map((a) => [a.name, a])
);

// ── Public API ──────────────────────────────────────────────────

export function getAgentConfig(name: AgentName): AgentConfig {
  const config = agentMap.get(name);
  if (!config) throw new Error(`Unknown agent: ${name}`);
  return config;
}

export function getAllAgentConfigs(): AgentConfig[] {
  return AGENTS;
}

export function getAgentNames(): AgentName[] {
  return AGENTS.map((a) => a.name);
}

export interface ResolvedPath {
  scope: SkillScope;
  absolutePattern: string;
  format: AgentPathConfig["format"];
  agent: AgentName;
}

export function resolveAgentPaths(
  config: AgentConfig,
  projectRoot: string
): ResolvedPath[] {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return config.paths.map((p) => {
    let pattern = p.pattern;
    if (pattern.startsWith("~/")) {
      pattern = resolve(home, pattern.slice(2));
    } else if (!pattern.startsWith("/")) {
      pattern = resolve(projectRoot, pattern);
    }
    return {
      scope: p.scope,
      absolutePattern: pattern,
      format: p.format,
      agent: config.name,
    };
  });
}

export async function isAgentInstalled(name: AgentName): Promise<boolean> {
  const config = getAgentConfig(name);
  for (const bin of config.binaryNames) {
    try {
      const proc = Bun.spawn(["which", bin], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) return true;
    } catch {
      // binary not found
    }
  }
  return false;
}

export async function getBinaryPath(name: AgentName): Promise<string | null> {
  const config = getAgentConfig(name);
  for (const bin of config.binaryNames) {
    try {
      const proc = Bun.spawn(["which", bin], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const text = await new Response(proc.stdout).text();
        return text.trim() || null;
      }
    } catch {
      // binary not found
    }
  }
  return null;
}

export function findProjectRoot(startDir?: string): string {
  let dir = resolve(startDir || process.cwd());
  const root = resolve("/");
  while (dir !== root) {
    const gitDir = resolve(dir, ".git");
    if (existsSync(gitDir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir || process.cwd());
}

export function getContextLimit(name: AgentName): number {
  switch (name) {
    case "claude": return 200_000;
    case "cursor": return 120_000;
    case "codex": return 200_000;
  }
}

export function isValidAgentName(name: string): name is AgentName {
  return agentMap.has(name as AgentName);
}
