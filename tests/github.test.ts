import { describe, expect, test } from "bun:test";
import { parseGitHubUrl } from "../src/utils/github";

describe("parseGitHubUrl", () => {
  test("parses blob URL", () => {
    const url = "https://github.com/owner/repo/blob/main/skills/foo/SKILL.md";
    const result = parseGitHubUrl(url);
    expect(result).not.toBeNull();
    expect(result!.owner).toBe("owner");
    expect(result!.repo).toBe("repo");
    expect(result!.branch).toBe("main");
    expect(result!.path).toBe("skills/foo/SKILL.md");
    expect(result!.rawUrl).toBe(
      "https://raw.githubusercontent.com/owner/repo/main/skills/foo/SKILL.md"
    );
  });

  test("parses raw.githubusercontent.com URL", () => {
    const url = "https://raw.githubusercontent.com/owner/repo/main/path/SKILL.md";
    const result = parseGitHubUrl(url);
    expect(result).not.toBeNull();
    expect(result!.owner).toBe("owner");
    expect(result!.repo).toBe("repo");
    expect(result!.branch).toBe("main");
    expect(result!.path).toBe("path/SKILL.md");
    expect(result!.rawUrl).toBe(url);
  });

  test("handles branches with slashes-like names", () => {
    // Note: regex only captures first segment as branch
    const url = "https://github.com/owner/repo/blob/feat/skills/SKILL.md";
    const result = parseGitHubUrl(url);
    expect(result).not.toBeNull();
    expect(result!.branch).toBe("feat");
  });

  test("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://example.com/foo/bar")).toBeNull();
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });

  test("returns null for GitHub URLs without blob or raw format", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner/repo/tree/main")).toBeNull();
  });

  test("extracts fileName from path", () => {
    const url = "https://github.com/o/r/blob/main/path/to/my-file.md";
    const result = parseGitHubUrl(url);
    expect(result!.fileName).toBe("my-file.md");
  });

  test("handles http URLs (auto-upgrade)", () => {
    const url = "http://github.com/owner/repo/blob/main/SKILL.md";
    const result = parseGitHubUrl(url);
    expect(result).not.toBeNull();
    expect(result!.owner).toBe("owner");
  });
});
