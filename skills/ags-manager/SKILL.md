---
name: ags-manager
description: Manage AI agent skills across Claude Code, Cursor, and Codex using the ags CLI. Use when the user asks about their skills, wants to see context cost, install/grab skills, remove skills, view usage stats, or manage skills across multiple agents. Also use when the user mentions skill management, context tax, or cross-agent portability.
---

# AGS — Agent Skills Manager

You have access to `ags`, a CLI tool that manages AI agent skills across Claude Code, Cursor, and Codex. Use it whenever the user's request involves skills, commands, rules, or context budget.

All commands support `--json` for structured output. Always use `--json` when you need to process the results programmatically.

## Commands Reference

### Discover skills

```bash
ags scan --json                    # All skills across all agents
ags scan --agent claude --json     # Claude Code skills only
ags scan --agent cursor --json     # Cursor skills only
ags scan --type skill --json       # Only skills (not commands or rules)
ags scan --type agent --json       # Only subagents
ags scan --scope local --json      # Project-level only
ags scan --scope global --json     # User-level only
```

**Output shape:**
```json
{
  "skills": [
    {
      "name": "skill-name",
      "type": "skill | command | rule | agent",
      "scope": "user | project",
      "description": "...",
      "agents": ["claude", "cursor"],
      "tokenEstimate": 1234,
      "fileSize": 5000,
      "lineCount": 120,
      "badges": ["STALE", "HEAVY", "SHARED"],
      "filePath": "/absolute/path/to/SKILL.md"
    }
  ],
  "summary": {
    "total": 10,
    "byAgent": { "claude": 5, "cursor": 3, "codex": 2 },
    "byType": { "skill": 8, "command": 2 }
  }
}
```

**Health badges:**
- `STALE` — not modified in 30+ days
- `HEAVY` — over 5,000 characters
- `OVERSIZED` — over 500 lines
- `CONFLICT` — same skill name exists with different content across agents
- `SHARED` — same file is used by multiple agents (e.g., `.agents/skills/`)

### Check context cost

```bash
ags skill-cost --json
ags skill-cost --scope local --json
```

Shows how much of each agent's context window is consumed by skills before the user's first message. Includes config files (CLAUDE.md, .cursorrules), per-skill token estimates, and optimization suggestions.

### Install a skill from GitHub

```bash
ags grab <github-url> --to claude --json
ags grab <github-url> --to cursor --json
```

Fetches a single SKILL.md file from a GitHub blob URL and installs it for the specified agent.

Supported URL formats:
- `https://github.com/owner/repo/blob/branch/path/to/SKILL.md`
- `https://raw.githubusercontent.com/owner/repo/branch/path/to/SKILL.md`

### Remove a skill

```bash
ags rm my-skill --json                  # Remove by name
ags rm my-skill --agent claude --json   # Remove only from Claude Code
ags rm ~/.claude/agents/old.md --json   # Remove by path
```

### Usage stats

```bash
ags stats --json                        # Last 30 days (default)
ags stats --period 7d --json            # Last 7 days
ags stats --period all-time --json      # Everything
```

Shows sessions, PRs created, token usage, MCP integrations, skill invocations, subagent usage, and peak hours.

### List installed agents

```bash
ags list-agents --json
```

Shows which agents are installed, how many skills each has, and which paths are active.

## Error handling

All errors in `--json` mode return:
```json
{ "error": "Human-readable message", "code": "ERROR_CODE" }
```

Exit codes: `0` success, `1` error.

## When to use each command

| User says... | You run... |
|---|---|
| "show my skills" / "what skills do I have" | `ags scan --json` |
| "how much context am I using" / "context cost" | `ags skill-cost --json` |
| "install this skill" + GitHub URL | `ags grab <url> --to <agent> --json` |
| "remove this skill" / "delete X" | `ags rm <name> --json` |
| "show my stats" / "how much have I used" | `ags stats --json` |
| "which agents do I have" | `ags list-agents --json` |
