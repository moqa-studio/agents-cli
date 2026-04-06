#!/usr/bin/env bun

import type { ParsedArgs } from "./types";
import { printError, c } from "./utils/output";

// Short flag aliases: -j → --json, -a → --agent, -t → --type, -s → --scope, -p → --period
const SHORT_FLAGS: Record<string, string> = {
  j: "json",
  a: "agent",
  t: "type",
  s: "scope",
  p: "period",
  v: "version",
  h: "help",
};

// Flags that never take a value (always boolean)
const BOOLEAN_FLAGS = new Set(["json", "help", "version", "dry-run", "installed"]);

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] || "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      // Handle --key=value syntax
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 2) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
        i++;
      } else {
        const key = arg.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          flags[key] = true;
          i++;
        } else {
          const next = args[i + 1];
          if (next && !next.startsWith("-")) {
            flags[key] = next;
            i += 2;
          } else {
            flags[key] = true;
            i++;
          }
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1 && !arg.startsWith("--")) {
      // Short flags: -j, -a claude, -js (combined booleans)
      const chars = arg.slice(1);
      for (let ci = 0; ci < chars.length; ci++) {
        const ch = chars[ci];
        const longName = SHORT_FLAGS[ch] || ch;
        if (BOOLEAN_FLAGS.has(longName)) {
          flags[longName] = true;
        } else if (ci === chars.length - 1) {
          // Last char in group: next arg is the value
          const next = args[i + 1];
          if (next && !next.startsWith("-")) {
            flags[longName] = next;
            i++;
          } else {
            flags[longName] = true;
          }
        } else {
          // Non-boolean in the middle of a group — treat as boolean
          flags[longName] = true;
        }
      }
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags };
}

// Read version from package.json so it stays in sync
const { version: VERSION } = await import("../package.json");

// ── Per-command help ────────────────────────────────────────────

const COMMAND_HELP: Record<string, string> = {
  scan: `
${c.bold("ags scan")} — Discover all skills, commands, agents, and rules

${c.bold("Usage:")}  ags scan [options]

${c.bold("Options:")}
  --agent X     Filter by agent: claude, cursor, codex (comma-separated)
  --type X      Filter by type: skill, command, rule, agent
  --scope X     Filter by scope: local, global, all (default: all)
  --installed   Show which agents are installed (binary, paths, skill count)
  --json        Output as JSON

${c.bold("Examples:")}
  ags scan                        Show everything
  ags scan --type skill           Skills only (replaces list-skills)
  ags scan --installed            Which agents are installed
  ags scan --scope local          Project-level only
  ags scan --scope global         User-level only
  ags scan --agent claude         Claude Code only
  ags scan --type agent           Subagents only
  ags scan --agent cursor --json  Cursor skills as JSON
`,

  "skill-cost": `
${c.bold("ags skill-cost")} — How much context your skills consume

${c.bold("Usage:")}  ags skill-cost [options]

${c.bold("Options:")}
  --scope X     Filter by scope: local, global, all (default: all)
  --json        Output as JSON

${c.bold("Shows:")}
  Per-skill token cost ranked by size, config file overhead,
  context usage per agent (bar chart vs. context limit),
  and top suggestions to free tokens.

${c.bold("Examples:")}
  ags skill-cost                  Full cost report
  ags skill-cost --scope local    Project skills only
  ags skill-cost --json           Structured output for agents
`,

  grab: `
${c.bold("ags grab")} — Install a skill from GitHub

${c.bold("Usage:")}  ags grab <github-url> [options]

${c.bold("Options:")}
  --to X        Target agent: claude, cursor, codex (default: claude)
  --dry-run     Preview without writing files
  --json        Output as JSON

${c.bold("Supported URLs:")}
  https://github.com/owner/repo/blob/branch/path/to/SKILL.md
  https://raw.githubusercontent.com/owner/repo/branch/path/to/SKILL.md

${c.bold("Examples:")}
  ags grab https://github.com/org/repo/blob/main/skills/foo/SKILL.md
  ags grab https://github.com/org/repo/blob/main/skills/foo/SKILL.md --to cursor
`,

  rm: `
${c.bold("ags rm")} — Remove a skill, command, agent, or rule

${c.bold("Usage:")}  ags rm <name-or-path> [options]

${c.bold("Options:")}
  --agent X     Only remove from this agent (if name matches multiple)
  --dry-run     Preview without deleting files
  --json        Output as JSON

${c.bold("Examples:")}
  ags rm my-skill                         Remove by name (all agents)
  ags rm my-skill --agent claude          Remove only from Claude Code
  ags rm ~/.claude/agents/old-agent.md    Remove by path
`,

  stats: `
${c.bold("ags stats")} — Usage stats and activity dashboard

${c.bold("Usage:")}  ags stats [options]

${c.bold("Options:")}
  --period X    Time range: 7d, 14d, 30d, 90d, 6m, 1y, week, month, year, all-time
                Also accepts a date: 2026-03-01 (default: 30d)
  --json        Output as JSON

${c.bold("Shows:")}
  Sessions, PRs created, token usage, MCP integrations, skills,
  subagents, peak hours, and daily activity.

${c.bold("Examples:")}
  ags stats                       Last 30 days (default)
  ags stats --period 7d           Last 7 days
  ags stats --period 90d          Last 90 days
  ags stats --period month        This calendar month
  ags stats --period all-time     Everything
  ags stats --period 2026-03-01   Since a specific date
`,

  context: `
${c.bold("ags context")} — What's loaded into your agent's context

${c.bold("Usage:")}  ags context [options]

${c.bold("Options:")}
  --agent X     Filter by agent: claude, cursor, codex
  --json        Output as JSON

${c.bold("Shows:")}
  Full context map: config files, skills, commands, agents,
  memory files, MCP server configs. Token costs and usage
  bars per agent.

${c.bold("Examples:")}
  ags context                         Full map for all agents
  ags context --agent claude          Claude Code only
  ags context --json                  Structured output for agents
`,

  lint: `
${c.bold("ags lint")} — Validate skill files

${c.bold("Usage:")}  ags lint [options]

${c.bold("Options:")}
  --agent X     Filter by agent: claude, cursor, codex
  --scope X     Filter by scope: local, global, all (default: all)
  --json        Output as JSON

${c.bold("Rules checked:")}
  missing-frontmatter    No YAML frontmatter block
  missing-description    No description field
  missing-name           No name field (uses filename fallback)
  short-description      Description under 10 chars
  heavy                  Over 5,000 characters
  oversized              Over 500 lines
  name-conflict          Same name at different paths
  unsupported-key        Frontmatter key not recognized by agent
  empty-body             No content after frontmatter

${c.bold("Examples:")}
  ags lint                            Lint everything
  ags lint --agent claude             Claude skills only
  ags lint --scope local --json       Project-level, JSON output
`,
};

function printUsage(): void {
  console.log(`
${c.bold("ags")} v${VERSION} — Agent Skills CLI

${c.bold("Usage:")}  ags <command> [options]

${c.bold("Commands:")}
  scan          Discover skills, commands, agents, rules (--type, --installed)
  context       What's loaded into your agent's context
  lint          Validate skill files for quality issues
  skill-cost    How much context your skills consume
  grab <url>    Install skill from GitHub URL
  rm <name>     Remove a skill, command, agent, or rule
  stats         Usage stats and activity dashboard

${c.bold("Global options:")}
  --json        Output as JSON (all commands)
  --help        Show help for a command
  --version     Show version

Run ${c.dim("ags <command> --help")} for command-specific options.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const json = args.flags.json === true;

  // Per-command --help
  if (args.flags.help === true && args.command in COMMAND_HELP) {
    console.log(COMMAND_HELP[args.command]);
    return;
  }

  switch (args.command) {
    case "scan": {
      const { run } = await import("./commands/scan");
      return run(args);
    }
    case "skill-cost":
    case "budget": {
      const { run } = await import("./commands/budget");
      return run(args);
    }
    case "grab": {
      const { run } = await import("./commands/grab");
      return run(args);
    }
    case "rm":
    case "remove": {
      const { run } = await import("./commands/rm");
      return run(args);
    }
    case "stats": {
      const { run } = await import("./commands/stats");
      return run(args);
    }
    case "context": {
      const { run } = await import("./commands/context");
      return run(args);
    }
    case "lint": {
      const { run } = await import("./commands/lint");
      return run(args);
    }
    case "help":
    case "--help":
      printUsage();
      return;
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    default:
      printError(`Unknown command: ${args.command}`, "UNKNOWN_COMMAND", json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
