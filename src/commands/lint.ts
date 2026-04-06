import type { ParsedArgs } from "../types";
import { scanAll } from "../core/scanner";
import { getAgentConfig } from "../core/agents";
import {
  printJson,
  shortenPath,
  parseScopeFlag,
  parseAgentFlag,
  c,
} from "../utils/output";

// ── Types ────────────────────────────────────────────────────────

type Severity = "error" | "warning" | "info";

interface LintIssue {
  severity: Severity;
  rule: string;
  message: string;
  skill: string;
  filePath: string;
}

interface LintResult {
  issues: LintIssue[];
  scanned: number;
  errors: number;
  warnings: number;
  passed: number;
}

// ── Command ──────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;

  const agents = parseAgentFlag(args.flags.agent, json);

  const scopes = parseScopeFlag(args.flags.scope, json);
  const skills = await scanAll({ agents, scopes });
  const issues: LintIssue[] = [];

  for (const skill of skills) {
    // Rule: missing-frontmatter
    if (Object.keys(skill.frontmatter).length === 0) {
      issues.push({
        severity: "error",
        rule: "missing-frontmatter",
        message: "No YAML frontmatter found — agents may not discover or understand this skill",
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: missing-name
    if (!skill.frontmatter.name) {
      issues.push({
        severity: "warning",
        rule: "missing-name",
        message: `No "name" in frontmatter — falling back to filename "${skill.name}"`,
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: missing-description
    if (!skill.frontmatter.description) {
      issues.push({
        severity: "error",
        rule: "missing-description",
        message: "No \"description\" in frontmatter — agents use this to decide when to invoke the skill",
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: empty-description
    if (skill.frontmatter.description && String(skill.frontmatter.description).trim().length < 10) {
      issues.push({
        severity: "warning",
        rule: "short-description",
        message: `Description is very short (${String(skill.frontmatter.description).trim().length} chars) — be specific about when agents should use this`,
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: heavy (over 5k chars)
    if (skill.badges.includes("HEAVY")) {
      issues.push({
        severity: "warning",
        rule: "heavy",
        message: `File is ${skill.fileSize.toLocaleString()} chars — consider trimming to save context budget`,
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: oversized (over 500 lines)
    if (skill.badges.includes("OVERSIZED")) {
      issues.push({
        severity: "error",
        rule: "oversized",
        message: `File is ${skill.lineCount} lines — this dominates context and may crowd out other skills`,
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: name-conflict
    if (skill.badges.includes("CONFLICT")) {
      issues.push({
        severity: "error",
        rule: "name-conflict",
        message: `Another skill with name "${skill.name}" exists at a different path — agents may load the wrong one`,
        skill: skill.name,
        filePath: skill.filePath,
      });
    }

    // Rule: unsupported-frontmatter (check against agent's supported keys)
    for (const agent of skill.agents) {
      const config = getAgentConfig(agent);
      const supported = new Set(config.supportedFrontmatter);
      for (const key of Object.keys(skill.frontmatter)) {
        if (!supported.has(key)) {
          issues.push({
            severity: "info",
            rule: "unsupported-key",
            message: `Frontmatter key "${key}" is not recognized by ${config.displayName}`,
            skill: skill.name,
            filePath: skill.filePath,
          });
        }
      }
    }

    // Rule: empty-body
    if (skill.rawContent.replace(/^---[\s\S]*?---\s*/, "").trim().length === 0) {
      issues.push({
        severity: "error",
        rule: "empty-body",
        message: "Skill has no body content — just frontmatter with no instructions",
        skill: skill.name,
        filePath: skill.filePath,
      });
    }
  }

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const passed = skills.length - new Set(issues.filter((i) => i.severity === "error").map((i) => i.filePath)).size;

  const result: LintResult = {
    issues,
    scanned: skills.length,
    errors,
    warnings,
    passed,
  };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // Human output
  console.log(c.bold(`\nAGS Lint — ${skills.length} files scanned\n`));

  if (issues.length === 0) {
    console.log(c.green("  All clear — no issues found.\n"));
    return;
  }

  // Group issues by file
  const byFile = new Map<string, LintIssue[]>();
  for (const issue of issues) {
    const list = byFile.get(issue.filePath) || [];
    list.push(issue);
    byFile.set(issue.filePath, list);
  }

  for (const [filePath, fileIssues] of byFile) {
    const skillName = fileIssues[0].skill;
    console.log(`  ${c.bold(skillName)} ${c.dim(shortenPath(filePath))}`);

    for (const issue of fileIssues) {
      const icon = severityIcon(issue.severity);
      console.log(`    ${icon} ${issue.message} ${c.dim(`[${issue.rule}]`)}`);
    }
    console.log();
  }

  // Summary
  const parts: string[] = [];
  if (errors > 0) parts.push(c.red(`${errors} errors`));
  if (warnings > 0) parts.push(c.yellow(`${warnings} warnings`));
  const infos = issues.length - errors - warnings;
  if (infos > 0) parts.push(c.dim(`${infos} info`));

  console.log(`  ${parts.join("  ")}  |  ${passed}/${skills.length} files passed\n`);

  // Exit with error code if there are errors
  if (errors > 0) {
    process.exit(1);
  }
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case "error":   return c.red("✕");
    case "warning": return c.yellow("!");
    case "info":    return c.dim("·");
  }
}
