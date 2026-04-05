import { describe, expect, test } from "bun:test";
import { computeBadges, type BadgeContext } from "../src/core/health";
import type { DiscoveredSkill } from "../src/types";

function makeSkill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    name: "test-skill", type: "skill", scope: "user", description: "",
    agents: ["claude"], filePath: "/test/SKILL.md", dirPath: "/test",
    tokenEstimate: 100, fileSize: 400, lineCount: 20,
    lastModified: Math.floor(Date.now() / 1000),
    badges: [], frontmatter: {}, rawContent: "content",
    ...overrides,
  };
}

describe("computeBadges", () => {
  test("healthy skill gets no badges", () => {
    const s = makeSkill();
    expect(computeBadges(s, { allSkills: [s] })).toEqual([]);
  });

  test("STALE at 31 days for project-scope, not for user-scope", () => {
    const day = 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    // Project-scope: STALE at 31 days, not at 29
    expect(computeBadges(makeSkill({ scope: "project", lastModified: now - 31 * day }), { allSkills: [] })).toContain("STALE");
    expect(computeBadges(makeSkill({ scope: "project", lastModified: now - 29 * day }), { allSkills: [] })).not.toContain("STALE");
    // User-scope: never STALE (mtime reflects install date, not relevance)
    expect(computeBadges(makeSkill({ scope: "user", lastModified: now - 31 * day }), { allSkills: [] })).not.toContain("STALE");
  });

  test("HEAVY at 5001 chars, OVERSIZED at 501 lines", () => {
    expect(computeBadges(makeSkill({ rawContent: "x".repeat(5001) }), { allSkills: [] })).toContain("HEAVY");
    expect(computeBadges(makeSkill({ lineCount: 501 }), { allSkills: [] })).toContain("OVERSIZED");
  });

  test("CONFLICT when same name different path", () => {
    const a = makeSkill({ filePath: "/a/SKILL.md" });
    const b = makeSkill({ filePath: "/b/SKILL.md" });
    expect(computeBadges(a, { allSkills: [a, b] })).toContain("CONFLICT");
  });

  test("SHARED when multi-agent", () => {
    expect(computeBadges(makeSkill({ agents: ["claude", "cursor"] }), { allSkills: [] })).toContain("SHARED");
  });
});
