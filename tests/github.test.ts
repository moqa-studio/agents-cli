import { describe, expect, test } from "bun:test";
import { parseGitHubUrl } from "../src/utils/github";

describe("parseGitHubUrl", () => {
  test("parses blob URL into components and rawUrl", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo/blob/main/skills/foo/SKILL.md")!;
    expect(r.owner).toBe("owner");
    expect(r.repo).toBe("repo");
    expect(r.branch).toBe("main");
    expect(r.path).toBe("skills/foo/SKILL.md");
    expect(r.rawUrl).toContain("raw.githubusercontent.com");
  });

  test("parses raw.githubusercontent.com URL", () => {
    const url = "https://raw.githubusercontent.com/o/r/main/SKILL.md";
    expect(parseGitHubUrl(url)!.rawUrl).toBe(url);
  });

  test("rejects non-GitHub and incomplete URLs", () => {
    expect(parseGitHubUrl("https://example.com/foo")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo")).toBeNull();
  });
});
