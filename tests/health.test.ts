import { describe, expect, test } from "bun:test";
import { computeBadges, type BadgeContext } from "../src/core/health";
import type { DiscoveredSkill } from "../src/types";

function makeSkill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    name: "test-skill",
    type: "skill",
    scope: "user",
    description: "A test skill",
    agents: ["claude"],
    filePath: "/test/skill/SKILL.md",
    dirPath: "/test/skill",
    tokenEstimate: 100,
    fileSize: 400,
    lineCount: 20,
    lastModified: Math.floor(Date.now() / 1000), // fresh
    badges: [],
    frontmatter: {},
    rawContent: "Some content",
    ...overrides,
  };
}

describe("computeBadges", () => {
  test("returns empty badges for healthy skill", () => {
    const skill = makeSkill();
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).toEqual([]);
  });

  test("marks STALE for skills not modified in 30+ days", () => {
    const thirtyOneDaysAgo = Math.floor(Date.now() / 1000) - 31 * 24 * 60 * 60;
    const skill = makeSkill({ lastModified: thirtyOneDaysAgo });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).toContain("STALE");
  });

  test("does not mark STALE for 29-day-old skill", () => {
    const twentyNineDaysAgo = Math.floor(Date.now() / 1000) - 29 * 24 * 60 * 60;
    const skill = makeSkill({ lastModified: twentyNineDaysAgo });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).not.toContain("STALE");
  });

  test("marks HEAVY for skills with >5000 chars", () => {
    const skill = makeSkill({ rawContent: "x".repeat(5001) });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).toContain("HEAVY");
  });

  test("does not mark HEAVY for skills with exactly 5000 chars", () => {
    const skill = makeSkill({ rawContent: "x".repeat(5000) });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).not.toContain("HEAVY");
  });

  test("marks OVERSIZED for skills with >500 lines", () => {
    const skill = makeSkill({ lineCount: 501 });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).toContain("OVERSIZED");
  });

  test("marks CONFLICT when two skills share a name", () => {
    const skill1 = makeSkill({ filePath: "/path/a/SKILL.md" });
    const skill2 = makeSkill({ filePath: "/path/b/SKILL.md" });
    const ctx: BadgeContext = { allSkills: [skill1, skill2] };
    expect(computeBadges(skill1, ctx)).toContain("CONFLICT");
    expect(computeBadges(skill2, ctx)).toContain("CONFLICT");
  });

  test("does not mark CONFLICT when names differ", () => {
    const skill1 = makeSkill({ name: "a", filePath: "/a/SKILL.md" });
    const skill2 = makeSkill({ name: "b", filePath: "/b/SKILL.md" });
    const ctx: BadgeContext = { allSkills: [skill1, skill2] };
    expect(computeBadges(skill1, ctx)).not.toContain("CONFLICT");
  });

  test("marks SHARED for multi-agent skills", () => {
    const skill = makeSkill({ agents: ["claude", "cursor"] });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).toContain("SHARED");
  });

  test("does not mark SHARED for single-agent skills", () => {
    const skill = makeSkill({ agents: ["claude"] });
    const ctx: BadgeContext = { allSkills: [skill] };
    expect(computeBadges(skill, ctx)).not.toContain("SHARED");
  });

  test("can combine multiple badges", () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
    const skill = makeSkill({
      lastModified: old,
      rawContent: "x".repeat(6000),
      lineCount: 600,
      agents: ["claude", "cursor"],
    });
    const ctx: BadgeContext = { allSkills: [skill] };
    const badges = computeBadges(skill, ctx);
    expect(badges).toContain("STALE");
    expect(badges).toContain("HEAVY");
    expect(badges).toContain("OVERSIZED");
    expect(badges).toContain("SHARED");
  });
});
