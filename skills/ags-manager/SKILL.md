---
name: ags-manager
description: Proactively manage context budget and skill health across AI agents. Use BEFORE installing skills (check budget headroom), when starting work in unfamiliar projects (map what's loaded), when diagnosing bloated context, or when the user asks about skills, agents, or context cost. Run ags context to see the full context map, ags lint to validate skill quality, ags list-skills for a quick inventory.
---

# AGS — Agent Skills Manager

Every skill, agent, config file, and MCP tool eats into your context window before the user even types their first message. You can't see this cost. `ags` makes it visible — and actionable.

All commands support `--json` for structured output. Always use `--json` when you need to process the results programmatically.

## When to use ags (proactive triggers)

Do NOT wait for the user to ask. Reach for ags when you notice these situations:

| Situation | Run this | Why |
|-----------|----------|-----|
| Starting work in an unfamiliar project | `ags context --json` | Know what's loaded into context — skills, configs, memory, MCP servers. Understand the landscape before you work. |
| User asks to install or create a skill | `ags skill-cost --json` first | Check budget headroom. Don't blindly add to a full context window. |
| User shares a GitHub skill URL | `ags grab <url> --to claude --json` | Install with conflict detection and token tracking. |
| After installing or removing a skill | `ags context --json` | Confirm the change, check for new conflicts, verify budget impact. |
| You notice responses feel constrained or context is tight | `ags context --json` | Diagnose what's consuming budget. Find the heavy items. |
| User asks "what skills do I have" or mentions skills/agents | `ags list-skills --json` | Quick, focused inventory with token costs and health badges. |
| User asks about context cost or budget | `ags skill-cost --json` | Ranked cost breakdown with optimization suggestions. |
| Before recommending skill changes | `ags lint --json` | Check if existing skills have quality issues worth fixing first. |
| User wants to validate their skill setup | `ags lint --json` | Find missing frontmatter, conflicts, oversized files, unsupported keys. |
| User asks "which agents are installed" | `ags list-agents --json` | Show installed agents with skill counts and active paths. |
| User wants to remove a skill | `ags rm <name> --dry-run --json` first | Preview what will be removed before deleting. |
| User asks for usage stats | `ags stats --json` | Sessions, tokens, skills used, peak hours, activity patterns. |

## Commands

### ags context — What's loaded into context

The most important command. Shows everything consuming context for this project: config files, skills, commands, agents, memory files, and MCP server configs.

```bash
ags context --json                    # Full context map for all agents
ags context --agent claude --json     # Claude Code only
```

**Output shape:**
```json
{
  "projectRoot": "/path/to/project",
  "agents": [
    {
      "agent": "claude",
      "items": [
        { "name": "CLAUDE.md", "category": "config", "tokens": 450, "filePath": "..." },
        { "name": "my-skill", "category": "skill", "tokens": 1200, "filePath": "..." },
        { "name": "memory/user_prefs.md", "category": "memory", "tokens": 300, "filePath": "..." }
      ],
      "totalTokens": 8500,
      "contextLimit": 200000,
      "percentage": 4.3
    }
  ],
  "grandTotal": 12000
}
```

**Categories:** config, skill, command, agent, memory, mcp

### ags lint — Validate skill quality

Checks all skill files for issues that hurt discoverability or waste context.

```bash
ags lint --json                       # Lint everything
ags lint --agent claude --json        # Claude skills only
ags lint --scope local --json         # Project-level only
```

**Rules checked:**
- `missing-frontmatter` — No YAML frontmatter (agents can't discover the skill)
- `missing-description` — No description (agents don't know when to use it)
- `missing-name` — No name field (falls back to filename)
- `short-description` — Description under 10 chars (not specific enough)
- `heavy` — Over 5,000 chars (context hog)
- `oversized` — Over 500 lines (dominates context)
- `name-conflict` — Same name at different paths (ambiguous)
- `unsupported-key` — Frontmatter key not recognized by the target agent
- `empty-body` — Frontmatter only, no instructions

**Output shape:**
```json
{
  "issues": [
    {
      "severity": "error",
      "rule": "missing-description",
      "message": "No description in frontmatter...",
      "skill": "my-skill",
      "filePath": "/path/to/SKILL.md"
    }
  ],
  "scanned": 12,
  "errors": 2,
  "warnings": 3,
  "passed": 10
}
```

Exits with code 1 if there are errors. Use this in CI or pre-commit hooks.

### ags list-skills — Quick skill inventory

Focused view of just skills (no commands, rules, or agents).

```bash
ags list-skills --json                    # All skills
ags list-skills --agent claude --json     # Claude only
ags list-skills --scope local --json      # Project-level only
```

### ags scan — Discover everything

All skills, commands, agents, and rules across all agents.

```bash
ags scan --json                    # Everything
ags scan --agent claude --json     # Claude Code only
ags scan --type agent --json       # Subagents only
ags scan --scope local --json      # Project-level only
ags scan --scope global --json     # User-level only
```

**Health badges in output:**
- `STALE` — not modified in 30+ days
- `HEAVY` — over 5,000 characters
- `OVERSIZED` — over 500 lines
- `CONFLICT` — same name exists at different paths
- `SHARED` — same file used by multiple agents

### ags skill-cost — Context budget breakdown

Per-skill token costs ranked by size, with optimization suggestions.

```bash
ags skill-cost --json
ags skill-cost --scope local --json
```

### ags grab — Install a skill from GitHub

```bash
ags grab <github-url> --to claude --json
ags grab <github-url> --to cursor --json
```

Supports GitHub blob URLs and raw.githubusercontent.com URLs.

### ags rm — Remove a skill

```bash
ags rm my-skill --dry-run --json          # Preview first
ags rm my-skill --json                    # Remove by name
ags rm my-skill --agent claude --json     # Remove only from Claude Code
ags rm ~/.claude/agents/old.md --json     # Remove by path
```

### ags stats — Usage analytics

```bash
ags stats --json                          # Last 30 days
ags stats --period 7d --json              # Last 7 days
ags stats --period all-time --json        # Everything
```

### ags list-agents — Installed agents

```bash
ags list-agents --json
```

## Error handling

All errors in `--json` mode return:
```json
{ "error": "Human-readable message", "code": "ERROR_CODE" }
```

Exit codes: `0` success, `1` error (or lint failures).
