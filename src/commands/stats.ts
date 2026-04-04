import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import type { ParsedArgs, AgentName } from "../types";
import { formatTokens } from "../core/tokens";
import { printJson, printError, pad, formatAgent, c } from "../utils/output";

// ── Types ───────────────────────────────────────────────────────

interface ProjectStats {
  dirName: string;
  displayName: string;
  sessionCount: number;
  lastActive: Date;
}

interface DayActivity {
  date: string;
  sessions: number;
}

interface StatsResult {
  agent: string;
  period: { from: string; to: string; activeDays: number };
  overview: {
    totalSessions: number;
    totalProjects: number;
    totalPRs: number;
    totalUserMessages: number;
    totalAssistantMessages: number;
  };
  tokens: {
    input: number;
    output: number;
    model: string;
  };
  topProjects: { name: string; sessions: number }[];
  integrations: { name: string; calls: number }[];
  skills: { name: string; calls: number }[];
  subagents: { name: string; calls: number }[];
  web: { searches: number; fetches: number };
  apiErrors: number;
  hourCounts: Record<number, number>;
  dailyActivity: DayActivity[];
}

// ── Spinner ─────────────────────────────────────────────────────

class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private idx = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private text = "";

  start(text: string) {
    this.text = text;
    if (!process.stdout.isTTY) return;
    this.interval = setInterval(() => {
      const frame = c.cyan(this.frames[this.idx % this.frames.length]);
      process.stdout.write(`\r  ${frame} ${c.dim(this.text)}`);
      this.idx++;
    }, 80);
  }

  update(text: string) {
    this.text = text;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write("\r" + " ".repeat(this.text.length + 10) + "\r");
    }
  }
}

// ── Command ─────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
  const json = args.flags.json === true;
  const home = process.env.HOME || "";
  const projectsDir = resolve(home, ".claude/projects");

  if (!existsSync(projectsDir)) {
    return printError("No stats found. ~/.claude/projects/ not found.", "NO_STATS", json);
  }

  // Parse --period flag (default: 30d)
  const rawPeriod = args.flags.period as string | undefined;
  const period = rawPeriod || "30d";
  const cutoff = parsePeriod(period);
  const periodLabel = getPeriodLabel(period);

  const spinner = new Spinner();
  if (!json) spinner.start("Scanning sessions...");

  // ── Phase 1: Scan project directories for session counts ────

  const allDirs = readdirSync(projectsDir);
  const projects: ProjectStats[] = [];
  const dailyMap = new Map<string, number>();
  const sessionJsonls: string[] = []; // top-level only, no subagents
  let totalSessions = 0;
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const dirName of allDirs) {
    if (dirName.includes("-claude-worktrees-")) continue;

    const dirPath = resolve(projectsDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch {
      continue;
    }

    let sessionCount = 0;
    let lastActive = new Date(0);

    try {
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith(".jsonl")) continue;

        const filePath = resolve(dirPath, file);
        try {
          const mtime = statSync(filePath).mtime;

          // Filter by period
          if (cutoff && mtime < cutoff) continue;

          sessionCount++;
          if (mtime > lastActive) lastActive = mtime;
          if (!earliest || mtime < earliest) earliest = mtime;
          if (!latest || mtime > latest) latest = mtime;

          const day = mtime.toISOString().split("T")[0];
          dailyMap.set(day, (dailyMap.get(day) || 0) + 1);

          sessionJsonls.push(filePath);
        } catch {
          // skip
        }
      }
    } catch {
      continue;
    }

    totalSessions += sessionCount;
    projects.push({ dirName, displayName: cleanDirName(dirName), sessionCount, lastActive });
  }

  const merged = mergeProjects(projects);
  const topProjects = merged
    .filter((p) => p.sessionCount > 0)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 8);

  const dailyActivity = Array.from(dailyMap.entries())
    .map(([date, sessions]) => ({ date, sessions }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  // ── Phase 2: Single pass through all session jsonls ─────────

  if (!json) spinner.update(`Analyzing ${sessionJsonls.length} sessions...`);

  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalPRs = 0;
  let apiErrors = 0;
  let webSearches = 0;
  let webFetches = 0;
  const modelCounts: Record<string, number> = {};
  const mcpServices: Record<string, number> = {};
  const skillCounts: Record<string, number> = {};
  const subagentCounts: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};

  for (const jsonlPath of sessionJsonls) {
    try {
      const content = readFileSync(jsonlPath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line) continue;

        try {
          const d = JSON.parse(line);
          const type = d.type;

          if (type === "user") {
            totalUserMessages++;
            // Extract hours from timestamps
            const ts = d.message?.timestamp || d.timestamp;
            if (ts) {
              const h = new Date(ts).getHours();
              if (!isNaN(h)) hourCounts[h] = (hourCounts[h] || 0) + 1;
            }
          } else if (type === "assistant") {
            totalAssistantMessages++;
            const msg = d.message || {};

            // Model
            const model = msg.model;
            if (model && model !== "<synthetic>") {
              modelCounts[model] = (modelCounts[model] || 0) + 1;
            }

            // Tokens
            const usage = msg.usage;
            if (usage) {
              totalInputTokens += usage.input_tokens || 0;
              totalOutputTokens += usage.output_tokens || 0;
            }

            // Tool use blocks
            const blocks = msg.content;
            if (Array.isArray(blocks)) {
              for (const block of blocks) {
                if (!block || block.type !== "tool_use") continue;
                const name = block.name || "";
                const input = block.input || {};

                if (name === "Skill") {
                  let skill = input.skill || input.name || "unknown";
                  if (skill.includes(":")) skill = skill.split(":").pop()!;
                  skillCounts[skill] = (skillCounts[skill] || 0) + 1;
                } else if (name === "Agent") {
                  const agent = input.subagent_type || "general-purpose";
                  subagentCounts[agent] = (subagentCounts[agent] || 0) + 1;
                } else if (name === "WebSearch") {
                  webSearches++;
                } else if (name === "WebFetch") {
                  webFetches++;
                } else if (name.startsWith("mcp__")) {
                  // Group by service: mcp__claude_ai_Linear__foo → Linear
                  const service = extractMcpService(name);
                  mcpServices[service] = (mcpServices[service] || 0) + 1;
                }
              }
            }
          } else if (type === "pr-link") {
            totalPRs++;
          } else if (type === "system" && d.subtype === "api_error") {
            apiErrors++;
          }
        } catch {
          // skip bad line
        }
      }
    } catch {
      // skip bad file
    }
  }

  spinner.stop();

  // ── Build result ────────────────────────────────────────────

  const primaryModel = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

  const topIntegrations = Object.entries(mcpServices)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, calls]) => ({ name, calls }));

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, calls]) => ({ name, calls }));

  const topSubagents = Object.entries(subagentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, calls]) => ({ name, calls }));

  const activeDays = dailyMap.size;
  const firstDate = earliest ? earliest.toISOString().split("T")[0] : "unknown";
  const lastDate = latest ? latest.toISOString().split("T")[0] : "unknown";

  const result: StatsResult = {
    agent: "claude",
    period: { from: firstDate, to: lastDate, activeDays },
    overview: {
      totalSessions,
      totalProjects: projects.length,
      totalPRs,
      totalUserMessages,
      totalAssistantMessages,
    },
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      model: shortenModel(primaryModel),
    },
    topProjects: topProjects.map((p) => ({ name: p.displayName, sessions: p.sessionCount })),
    integrations: topIntegrations,
    skills: topSkills,
    subagents: topSubagents,
    web: { searches: webSearches, fetches: webFetches },
    apiErrors,
    hourCounts,
    dailyActivity,
  };

  if (json) {
    printJson({ ok: true, data: result });
  }

  // ── Human output ────────────────────────────────────────────

  const earliest_str = earliest ? formatDate(earliest.toISOString().split("T")[0]) : "unknown";
  const periodSuffix = periodLabel === "all time"
    ? `  ${c.dim(`all time (earliest data: ${earliest_str})`)}`
    : `  ${c.dim(periodLabel || "last 30 days")}`;
  console.log(c.bold(`\nAGS Stats — ${formatAgent("claude" as AgentName)}`) + periodSuffix);
  console.log();

  // Overview line
  const nums = [
    `${c.bold(String(totalSessions))} sessions`,
    `${c.bold(String(projects.length))} projects`,
    `${c.bold(String(totalPRs))} PRs`,
    `${c.bold(String(activeDays))} active days`,
  ];
  console.log(`  ${nums.join(c.dim("  ·  "))}`);

  // Tokens + model + web + errors on one line
  const totalTokens = totalInputTokens + totalOutputTokens;
  const meta = [
    `${formatTokens(totalTokens)} tokens ${c.dim(`(${formatTokens(totalOutputTokens)} output)`)}`,
    `model: ${c.bold(shortenModel(primaryModel))}`,
    `${webSearches + webFetches} web calls`,
    apiErrors > 0 ? `${c.yellow(String(apiErrors))} API errors` : null,
  ].filter(Boolean);
  console.log(`  ${c.dim(meta.join("  ·  "))}`);
  console.log();

  // ── Projects & Integrations side by side ────────────────────
  const COL_LEFT = 46;

  if (topProjects.length > 0 || topIntegrations.length > 0) {
    console.log(`  ${c.bold("Projects")}${" ".repeat(COL_LEFT - 10)}${c.bold("Integrations")}`);
    console.log();
    const maxRows = Math.max(topProjects.length, topIntegrations.length);
    const maxSessions = topProjects[0]?.sessionCount || 1;
    const maxIntCalls = topIntegrations[0]?.calls || 1;

    for (let i = 0; i < maxRows; i++) {
      const left = i < topProjects.length
        ? pad(renderBar(topProjects[i].displayName, topProjects[i].sessionCount, maxSessions, 6, 26), COL_LEFT)
        : " ".repeat(COL_LEFT);

      const right = i < topIntegrations.length
        ? renderBar(topIntegrations[i].name, topIntegrations[i].calls, maxIntCalls, 6, 12)
        : "";

      console.log(`${left}${right}`);
    }
    console.log();
  }

  // ── Skills & Subagents side by side ─────────────────────────

  if (topSkills.length > 0 || topSubagents.length > 0) {
    const hasSkills = topSkills.length > 0;
    const hasAgents = topSubagents.length > 0;

    let header = "";
    if (hasSkills && hasAgents) {
      header = `  ${c.bold("Skills")}${" ".repeat(COL_LEFT - 8)}${c.bold("Subagents")}`;
    } else if (hasSkills) {
      header = `  ${c.bold("Skills")}`;
    } else {
      header = `  ${c.bold("Subagents")}`;
    }
    console.log(header);
    console.log();

    const maxRows = Math.max(topSkills.length, topSubagents.length);
    const maxSkill = topSkills[0]?.calls || 1;
    const maxAgent = topSubagents[0]?.calls || 1;

    for (let i = 0; i < maxRows; i++) {
      let left = " ".repeat(COL_LEFT);
      if (hasSkills && i < topSkills.length) {
        left = pad(renderBar(topSkills[i].name, topSkills[i].calls, maxSkill, 4, 28), COL_LEFT);
      } else if (!hasSkills && i < topSubagents.length) {
        left = `  ${renderBar(topSubagents[i].name, topSubagents[i].calls, maxAgent, 4, 28)}`;
      }

      let right = "";
      if (hasSkills && hasAgents && i < topSubagents.length) {
        right = renderBar(topSubagents[i].name, topSubagents[i].calls, maxAgent, 4, 16);
      }

      console.log(`${left}${right}`);
    }
    console.log();
  }

  // ── Hours heatmap ───────────────────────────────────────────

  if (Object.keys(hourCounts).length > 0) {
    const maxH = Math.max(...Object.values(hourCounts), 1);
    const blocks = ["░", "▒", "▓", "█"];
    let heatmap = "";
    for (let h = 0; h < 24; h++) {
      const count = hourCounts[h] || 0;
      const intensity = Math.min(Math.floor((count / maxH) * 4), 3);
      heatmap += count > 0 ? c.cyan(blocks[intensity]) : c.dim("·");
    }
    console.log(`  ${c.dim("Hours:")}   ${heatmap}`);
    console.log(`            ${c.dim("0     6     12    18    23")}`);
    console.log();
  }

}

// ── Helpers ─────────────────────────────────────────────────────

function renderBar(name: string, value: number, max: number, barWidth: number, nameWidth: number): string {
  const bar = miniBar(value, max, barWidth);
  const label = name.padEnd(nameWidth).slice(0, nameWidth);
  const count = String(value).padStart(4);
  return `  ${bar} ${label} ${c.dim(count)}`;
}

const MCP_FRIENDLY_NAMES: [RegExp, string][] = [
  [/linear/i, "Linear"],
  [/context7/i, "Context7"],
  [/notion/i, "Notion"],
  [/revenuecat/i, "RevenueCat"],
  [/chrome/i, "Chrome"],
  [/astro/i, "Astro"],
];

function extractMcpService(toolName: string): string {
  const raw = toolName.replace("mcp__", "").split("__")[0] || toolName;
  return MCP_FRIENDLY_NAMES.find(([re]) => re.test(raw))?.[1] || raw;
}

function cleanDirName(dirName: string): string {
  // Dir names encode paths: -Users-robin-Projects-foo → /Users/robin/Projects/foo
  // We strip the HOME prefix segments to get a short display name.
  const home = process.env.HOME || "";
  const homeSegments = new Set(home.split("/").filter(Boolean));

  // Common path segments that aren't meaningful project names
  const skipWords = new Set([
    "", ...homeSegments,
    "Documents", "Projects", "Code", "Workspace", "Developer",
    "repos", "src", "dev", "work", "git",
    // Common macOS/Linux parent dirs in project paths
    "Mac", "React", "Native", "Desktop", "Downloads",
  ]);

  const segments = dirName.split("-");
  let startIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (skipWords.has(segments[i])) {
      startIdx = i + 1;
    } else {
      break;
    }
  }

  return segments.slice(startIdx).join("-") || dirName;
}

function mergeProjects(projects: ProjectStats[]): ProjectStats[] {
  const sorted = [...projects].sort((a, b) => a.displayName.length - b.displayName.length);
  const merged: ProjectStats[] = [];

  for (const proj of sorted) {
    const parent = merged.find((m) =>
      proj.displayName === m.displayName ||
      proj.displayName.startsWith(m.displayName + "-") ||
      proj.displayName.startsWith(m.displayName + "/")
    );
    if (parent) {
      parent.sessionCount += proj.sessionCount;
      if (proj.lastActive > parent.lastActive) parent.lastActive = proj.lastActive;
    } else {
      merged.push({ ...proj });
    }
  }

  return merged;
}

function parsePeriod(period: string | undefined): Date | null {
  if (!period) return null;
  const now = new Date();

  // Shortcuts: 7d, 14d, 30d, 90d, 6m, 1y
  const match = period.match(/^(\d+)(d|w|m|y)$/);
  if (match) {
    const n = parseInt(match[1]);
    const unit = match[2];
    const cutoff = new Date(now);
    switch (unit) {
      case "d": cutoff.setDate(cutoff.getDate() - n); break;
      case "w": cutoff.setDate(cutoff.getDate() - n * 7); break;
      case "m": cutoff.setMonth(cutoff.getMonth() - n); break;
      case "y": cutoff.setFullYear(cutoff.getFullYear() - n); break;
    }
    return cutoff;
  }

  // Named periods
  switch (period) {
    case "week": return new Date(now.getTime() - 7 * 86400000);
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year": return new Date(now.getFullYear(), 0, 1);
    case "all": return null;
    case "all-time": return null;
  }

  // Try as date string
  const d = new Date(period);
  return isNaN(d.getTime()) ? null : d;
}

function getPeriodLabel(period: string | undefined): string | null {
  if (!period || period === "all" || period === "all-time") return "all time";

  const match = period.match(/^(\d+)(d|w|m|y)$/);
  if (match) {
    const n = parseInt(match[1]);
    const units: Record<string, string> = { d: "day", w: "week", m: "month", y: "year" };
    const unit = units[match[2]];
    return `last ${n} ${unit}${n > 1 ? "s" : ""}`;
  }

  switch (period) {
    case "week": return "last 7 days";
    case "month": return "this month";
    case "year": return "this year";
  }

  return `since ${period}`;
}

function shortenModel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function miniBar(value: number, max: number, width: number): string {
  const blocks = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
  const ratio = Math.min(value / max, 1);
  const totalEighths = Math.round(ratio * width * 8);
  const fullBlocks = Math.floor(totalEighths / 8);
  const remainder = totalEighths % 8;
  let bar = "█".repeat(fullBlocks);
  if (remainder > 0 && fullBlocks < width) bar += blocks[remainder];
  const empty = Math.max(0, width - bar.length);
  return c.cyan(bar) + c.dim("░".repeat(empty));
}
