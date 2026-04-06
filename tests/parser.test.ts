import { describe, expect, test } from "bun:test";
import { parseSkillFile, extractDescription, nameFromFilePath } from "../src/core/parser";

describe("parseSkillFile", () => {
  test("parses frontmatter key-values, booleans, lists, and body", () => {
    const content = `---
name: my-skill
user-invocable: true
paths:
  - src/
  - lib/
---
# Body here`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter["user-invocable"]).toBe(true);
    expect(result.frontmatter["paths"]).toEqual(["src/", "lib/"]);
    expect(result.body).toBe("# Body here");
  });

  test("handles missing frontmatter", () => {
    const result = parseSkillFile("# Just markdown");
    expect(result.frontmatter).toEqual({});
  });

  test("parses multi-line literal (|) and folded (>) blocks", () => {
    const content = `---
literal: |
  line one
  line two
folded: >
  word one
  word two
name: test
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.literal).toBe("line one\nline two");
    expect(result.frontmatter.folded).toBe("word one word two");
    expect(result.frontmatter.name).toBe("test");
  });
});

describe("extractDescription", () => {
  test("prefers frontmatter, falls back to body, truncates at 250", () => {
    expect(extractDescription(parseSkillFile(`---\ndescription: hello\n---\nBody`))).toBe("hello");
    expect(extractDescription(parseSkillFile(`---\nname: x\n---\n# Title\nFirst para.`))).toBe("First para.");
    const long = extractDescription(parseSkillFile(`---\ndescription: ${"A".repeat(300)}\n---`));
    expect(long.length).toBe(250);
  });
});

describe("nameFromFilePath", () => {
  test("SKILL.md uses parent dir, others strip extension", () => {
    expect(nameFromFilePath("/skills/my-skill/SKILL.md")).toBe("my-skill");
    expect(nameFromFilePath("/commands/deploy.md")).toBe("deploy");
  });
});
