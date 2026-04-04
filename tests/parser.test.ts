import { describe, expect, test } from "bun:test";
import { parseSkillFile, extractDescription, nameFromFilePath } from "../src/core/parser";

describe("parseSkillFile", () => {
  test("parses frontmatter with key-value pairs", () => {
    const content = `---
name: my-skill
description: A test skill
---
# Body here`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.description).toBe("A test skill");
    expect(result.body).toBe("# Body here");
  });

  test("handles missing frontmatter", () => {
    const content = "# Just a markdown file\n\nSome content.";
    const result = parseSkillFile(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content.trim());
  });

  test("parses boolean values", () => {
    const content = `---
user-invocable: true
disable-model-invocation: false
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["user-invocable"]).toBe(true);
    expect(result.frontmatter["disable-model-invocation"]).toBe(false);
  });

  test("parses numeric values", () => {
    const content = `---
version: 42
ratio: 3.14
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["version"]).toBe(42);
    expect(result.frontmatter["ratio"]).toBe(3.14);
  });

  test("parses inline arrays", () => {
    const content = `---
allowed-tools: [Read, Write, Edit]
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["allowed-tools"]).toEqual(["Read", "Write", "Edit"]);
  });

  test("parses list items", () => {
    const content = `---
paths:
  - src/
  - lib/
  - tests/
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["paths"]).toEqual(["src/", "lib/", "tests/"]);
  });

  test("parses quoted strings", () => {
    const content = `---
name: "my-skill"
description: 'A skill with: colons'
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.description).toBe("A skill with: colons");
  });

  test("parses multi-line literal block (|)", () => {
    const content = `---
description: |
  This is a multi-line
  description that spans
  multiple lines.
name: test
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.description).toBe(
      "This is a multi-line\ndescription that spans\nmultiple lines."
    );
    expect(result.frontmatter.name).toBe("test");
  });

  test("parses multi-line folded block (>)", () => {
    const content = `---
description: >
  This is a folded
  description that joins
  lines together.
name: test
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.description).toBe(
      "This is a folded description that joins lines together."
    );
    expect(result.frontmatter.name).toBe("test");
  });

  test("handles key with no value followed by list", () => {
    const content = `---
metadata:
  - item1
  - item2
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["metadata"]).toEqual(["item1", "item2"]);
  });

  test("ignores comments", () => {
    const content = `---
# This is a comment
name: my-skill
# Another comment
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter.name).toBe("my-skill");
  });

  test("handles empty inline array", () => {
    const content = `---
allowed-tools: []
---`;
    const result = parseSkillFile(content);
    expect(result.frontmatter["allowed-tools"]).toEqual([]);
  });
});

describe("extractDescription", () => {
  test("prefers frontmatter description", () => {
    const parsed = parseSkillFile(`---
description: From frontmatter
---
# Title
From body paragraph.`);
    expect(extractDescription(parsed)).toBe("From frontmatter");
  });

  test("falls back to first body paragraph", () => {
    const parsed = parseSkillFile(`---
name: test
---
# My Skill
This is the first paragraph describing the skill.

More content here.`);
    expect(extractDescription(parsed)).toBe(
      "This is the first paragraph describing the skill."
    );
  });

  test("truncates long descriptions to 250 chars", () => {
    const longDesc = "A".repeat(300);
    const parsed = parseSkillFile(`---
description: ${longDesc}
---`);
    const desc = extractDescription(parsed);
    expect(desc.length).toBe(250);
    expect(desc.endsWith("...")).toBe(true);
  });

  test("returns empty string when no description available", () => {
    const parsed = parseSkillFile(`---
name: test
---
# Title Only`);
    expect(extractDescription(parsed)).toBe("");
  });
});

describe("nameFromFilePath", () => {
  test("extracts parent dir name for SKILL.md", () => {
    expect(nameFromFilePath("/home/user/.claude/skills/my-skill/SKILL.md")).toBe("my-skill");
  });

  test("strips .md extension for regular files", () => {
    expect(nameFromFilePath("/home/user/.claude/commands/deploy.md")).toBe("deploy");
  });

  test("strips .mdc extension", () => {
    expect(nameFromFilePath("/home/user/.cursor/rules/lint.mdc")).toBe("lint");
  });

  test("returns unknown for SKILL.md at root", () => {
    expect(nameFromFilePath("SKILL.md")).toBe("unknown");
  });
});
