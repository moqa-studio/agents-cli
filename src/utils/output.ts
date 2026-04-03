import type { AgentName, CliOutput, HealthBadge, SkillType } from "../types";

// ── ANSI colors ─────────────────────────────────────────────────

function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === "dumb") return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

const enabled = supportsColor();

function wrap(code: string, text: string): string {
  if (!enabled) return text;
  return `${code}${text}\x1b[0m`;
}

export const c = {
  bold: (s: string) => wrap("\x1b[1m", s),
  dim: (s: string) => wrap("\x1b[2m", s),
  red: (s: string) => wrap("\x1b[31m", s),
  green: (s: string) => wrap("\x1b[32m", s),
  yellow: (s: string) => wrap("\x1b[33m", s),
  blue: (s: string) => wrap("\x1b[34m", s),
  magenta: (s: string) => wrap("\x1b[35m", s),
  cyan: (s: string) => wrap("\x1b[36m", s),
  gray: (s: string) => wrap("\x1b[90m", s),
  // 256-color for brand colors
  rgb: (r: number, g: number, b: number, s: string) =>
    wrap(`\x1b[38;2;${r};${g};${b}m`, s),
};

// ── JSON output ─────────────────────────────────────────────────

export function printJson<T>(output: CliOutput<T>): never {
  console.log(JSON.stringify(output.ok ? output.data : output, null, 2));
  process.exit(output.ok ? 0 : 1);
}

export function printSuccess<T>(data: T, json: boolean): void {
  if (json) {
    printJson({ ok: true, data });
  }
}

export function printError(
  message: string,
  code: string,
  json: boolean
): never {
  if (json) {
    printJson({ ok: false, error: message, code });
  }
  console.error(c.red(`Error: ${message}`));
  process.exit(1);
}

// ── Table rendering ─────────────────────────────────────────────

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => {
    const colValues = rows.map((r) => stripAnsi(r[i] || "").length);
    return Math.max(stripAnsi(h).length, ...colValues);
  });

  const sep = "  ";
  const headerLine = headers
    .map((h, i) => pad(h, widths[i]))
    .join(sep);
  const divider = widths.map((w) => "─".repeat(w)).join(sep);
  const body = rows
    .map((row) =>
      row.map((cell, i) => pad(cell, widths[i])).join(sep)
    )
    .join("\n");

  return `${c.bold(headerLine)}\n${c.dim(divider)}\n${body}`;
}

function pad(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  const needed = Math.max(0, width - visible);
  return text + " ".repeat(needed);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Badge formatting ────────────────────────────────────────────

export function formatBadge(badge: HealthBadge): string {
  switch (badge) {
    case "STALE": return c.yellow("STALE");
    case "HEAVY": return c.magenta("HEAVY");
    case "OVERSIZED": return c.red("OVERSIZED");
    case "CONFLICT": return c.red(c.bold("CONFLICT"));
    case "SHARED": return c.cyan("SHARED");
  }
}

export function formatBadges(badges: HealthBadge[]): string {
  if (badges.length === 0) return "";
  return badges.map(formatBadge).join(" ");
}

// ── Agent formatting ────────────────────────────────────────────

const AGENT_STYLE: Record<AgentName, { icon: string; color: (s: string) => string }> = {
  claude: {
    icon: "◈",
    color: (s) => c.rgb(217, 119, 87, s),   // Claude terracotta/orange
  },
  cursor: {
    icon: "⌘",
    color: (s) => c.rgb(0, 112, 243, s),     // Cursor blue
  },
  codex: {
    icon: "◆",
    color: (s) => c.rgb(16, 163, 127, s),    // OpenAI green
  },
};

export function formatAgent(name: AgentName): string {
  const style = AGENT_STYLE[name];
  if (!style) return name;
  return style.color(`${style.icon} ${name}`);
}

export function formatAgents(names: AgentName[]): string {
  return names.map(formatAgent).join(c.dim(","));
}

// ── Type formatting ─────────────────────────────────────────────

export function formatType(type: SkillType): string {
  switch (type) {
    case "skill":   return c.green("skill");
    case "command": return c.yellow("command");
    case "rule":    return c.magenta("rule");
    case "agent":   return c.cyan("agent");
    default:        return type;
  }
}

// ── Headings ────────────────────────────────────────────────────

export function heading(text: string): string {
  return c.bold(text);
}

export function subheading(text: string): string {
  return c.dim(text);
}
