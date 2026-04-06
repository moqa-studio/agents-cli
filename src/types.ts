// ── Agent identity ──────────────────────────────────────────────

export type AgentName = "claude" | "cursor" | "codex";

export type SkillType = "skill" | "command" | "rule" | "agent";

export type SkillScope = "user" | "project" | "admin" | "system";

export type HealthBadge = "STALE" | "HEAVY" | "OVERSIZED" | "CONFLICT" | "SHARED";

// ── Frontmatter (superset of all agents) ────────────────────────

export interface Frontmatter {
  name?: string;
  description?: string;

  // Claude Code specific
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
  "allowed-tools"?: string | string[];
  model?: string;
  effort?: string;
  context?: string;
  agent?: string;
  hooks?: Record<string, unknown>;
  paths?: string | string[];
  shell?: string;
  "argument-hint"?: string;

  // Cursor specific
  license?: string;
  compatibility?: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;

  // Catch-all for unknown fields
  [key: string]: unknown;
}

// ── Discovered skill ────────────────────────────────────────────

export interface DiscoveredSkill {
  name: string;
  type: SkillType;
  scope: SkillScope;
  description: string;
  agents: AgentName[];
  filePath: string;
  dirPath: string;
  tokenEstimate: number;
  fileSize: number;
  lineCount: number;
  lastModified: number;
  badges: HealthBadge[];
  frontmatter: Frontmatter;
  rawContent: string;
}

// ── Agent configuration ─────────────────────────────────────────

export interface AgentPathConfig {
  scope: SkillScope;
  pattern: string;
  format: SkillType;
}

export interface AgentConfig {
  name: AgentName;
  displayName: string;
  paths: AgentPathConfig[];
  binaryNames: string[];
  configFiles: string[];
  supportedFrontmatter: string[];
}

// ── Command output schemas ──────────────────────────────────────

export interface ScanResult {
  skills: DiscoveredSkill[];
  summary: {
    total: number;
    totalTokens: number;
    byAgent: Partial<Record<AgentName, number>>;
    byType: Partial<Record<SkillType, number>>;
    byScope: Partial<Record<SkillScope, number>>;
    badges: Partial<Record<HealthBadge, number>>;
  };
}

export interface BudgetConfigFile {
  name: string;
  tokens: number;
  filePath: string;
}

export interface BudgetEntry {
  name: string;
  agent: AgentName;
  tokens: number;
  percentage: number;
  filePath: string;
}

export interface BudgetAgentSummary {
  tokens: number;
  count: number;
}

export interface BudgetContextLimit {
  limit: number;
  used: number;
  percentage: number;
}

export interface BudgetResult {
  totalTokens: number;
  configFiles: BudgetConfigFile[];
  skills: BudgetEntry[];
  byAgent: Partial<Record<AgentName, BudgetAgentSummary>>;
  contextLimits: Partial<Record<AgentName, BudgetContextLimit>>;
  suggestions: string[];
}

export interface GrabResult {
  name: string;
  source: string;
  destination: string;
  tokens: number;
  agent: AgentName;
}

// ── CLI output wrapper ──────────────────────────────────────────

export interface CliSuccess<T> {
  ok: true;
  data: T;
}

export interface CliError {
  ok: false;
  error: string;
  code: string;
}

export type CliOutput<T> = CliSuccess<T> | CliError;

// ── Parsed CLI arguments ────────────────────────────────────────

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}
