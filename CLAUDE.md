# CLAUDE.md

## What is ags

ags (Agents CLI) is a CLI tool to manage skills, commands, and rules across AI coding assistants (Claude Code, Cursor, Codex). It scans, lints, measures token cost, and manages everything from a single command.

- Runtime: Bun (v1.0+), TypeScript, zero external dependencies
- Entry point: `src/index.ts` (custom arg parser, dynamic command imports)
- Package: `@moqa/ags`, v0.1.0, MIT license

## Commands

| Command | What it does | Key flags |
|---------|-------------|-----------|
| `scan` | Discover all skills/commands/agents/rules | `--agent`, `--type`, `--scope`, `--installed` |
| `context` | What's loaded into each agent's context window | `--agent` |
| `lint` | Validate skill files (9 rules: frontmatter, size, conflicts) | `--agent`, `--scope` |
| `skill-cost` | Token budget per skill, context usage bars, optimization suggestions | `--scope` |
| `grab <url>` | Install skill from GitHub URL | `--to <agent>`, `--dry-run` |
| `rm <name>` | Remove a skill/command/agent/rule | `--agent`, `--dry-run` |
| `stats` | Usage dashboard from Claude Code sessions | `--period` (7d/30d/90d/all-time/etc.) |

All commands support `--json` (`-j`) for structured output and `--help` (`-h`).

## Architecture

```
src/
  index.ts          CLI entry, arg parsing, command routing
  types.ts          All type definitions (AgentName, SkillType, DiscoveredSkill, etc.)
  commands/         One file per command (scan, context, lint, budget, grab, rm, stats)
  core/
    agents.ts       Agent registry — paths, binaries, config files, frontmatter keys
    scanner.ts      Discovery engine — glob-based scanning, deduplication, badge computation
    parser.ts       YAML frontmatter parser (regex-based, not full YAML)
    health.ts       Badge system (STALE, HEAVY, OVERSIZED, CONFLICT, SHARED)
    tokens.ts       Token estimation (word-count heuristic: words*1.3 + symbols*0.5)
  utils/
    output.ts       ANSI colors, table rendering, badge/agent/scope formatting
    github.ts       GitHub URL parsing, raw content fetching (10s timeout, 1MB limit)
    git.ts          Git last-modified timestamp (fallback to fs mtime)
tests/              Bun test suite (parser, tokens, health, github)
```

## Key design decisions

- **Agent registry drives everything**: `src/core/agents.ts` defines paths, binaries, config files, and supported frontmatter keys per agent. All commands read from this registry — adding a new agent means adding one entry here.
- **Deduplication by file path**: Scanner uses `Map<filePath, Skill>` so shared skills (same file, multiple agents) are not double-counted.
- **Dynamic imports**: Commands are loaded on-demand (`import("./commands/scan.ts")`) for fast startup.
- **Graceful fallbacks**: Missing git history, unparseable files, missing frontmatter — all handled without crashing.
- **Streaming for large files**: Stats command streams JSONL session files line-by-line.

## Supported agents

| Agent | Paths scanned |
|-------|--------------|
| Claude Code | `~/.claude/skills/`, `.claude/skills/`, `~/.claude/commands/`, `.claude/commands/`, `~/.claude/agents/` |
| Cursor | `.cursor/rules/**/*.mdc`, `.cursorrules` |
| Codex | `.codex/skills/` |

Context limits: Claude 200k, Cursor 120k, Codex 200k.

## Adding a new agent

1. Add entry to `AGENTS` in `src/core/agents.ts`
2. Add name to `AgentName` union in `src/types.ts`
3. Add context limit in `getContextLimit()`
4. Add styling in `AGENT_STYLE` in `src/utils/output.ts`
5. Update shell completions in `completions/`

## Development

```bash
bun install           # install deps
bun test              # run tests
bun run typecheck     # type-check
bun run dev           # run CLI directly (bun run src/index.ts)
bun run build         # cross-platform binaries (darwin-arm64, darwin-x64, linux-x64)
```

## Lint rules

The `lint` command checks for: `missing-frontmatter`, `missing-name`, `missing-description`, `short-description`, `heavy` (>5k chars), `oversized` (>500 lines), `name-conflict`, `unsupported-key`, `empty-body`. Exits with code 1 on errors.

## Health badges

- **STALE**: >30 days since last modification (project-scope only)
- **HEAVY**: >5000 characters
- **OVERSIZED**: >500 lines
- **CONFLICT**: Same name, different file paths
- **SHARED**: Used by multiple agents

## CI

GitHub Actions on push to main and PRs: install, typecheck, test (Ubuntu, Bun latest).
