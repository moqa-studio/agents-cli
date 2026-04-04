import type { DiscoveredSkill, HealthBadge } from "../types";

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const HEAVY_THRESHOLD = 5000;    // chars
const OVERSIZED_THRESHOLD = 500; // lines

export interface BadgeContext {
  allSkills: DiscoveredSkill[];
}

export function computeBadges(
  skill: DiscoveredSkill,
  ctx: BadgeContext
): HealthBadge[] {
  const badges: HealthBadge[] = [];
  const now = Math.floor(Date.now() / 1000);

  // STALE: not modified in 30+ days
  if (now - skill.lastModified > THIRTY_DAYS) {
    badges.push("STALE");
  }

  // HEAVY: over 5k chars
  if (skill.rawContent.length > HEAVY_THRESHOLD) {
    badges.push("HEAVY");
  }

  // OVERSIZED: over 500 lines
  if (skill.lineCount > OVERSIZED_THRESHOLD) {
    badges.push("OVERSIZED");
  }

  // CONFLICT: another skill has the same name but different file path
  const hasConflict = ctx.allSkills.some(
    (other) =>
      other.name === skill.name &&
      other.filePath !== skill.filePath
  );
  if (hasConflict) {
    badges.push("CONFLICT");
  }

  // SHARED: skill is used by multiple agents (same path, e.g., .agents/skills/)
  if (skill.agents.length > 1) {
    badges.push("SHARED");
  }

  return badges;
}