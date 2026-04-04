import type { Frontmatter } from "../types";

export interface ParsedSkillFile {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

export function parseSkillFile(content: string): ParsedSkillFile {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      frontmatter: {},
      body: content.trim(),
      raw: content,
    };
  }

  const yamlBlock = match[1];
  const body = content.slice(match[0].length).trim();
  const frontmatter = parseYaml(yamlBlock);

  return { frontmatter, body, raw: content };
}

function parseYaml(yaml: string): Frontmatter {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    // List item under current key
    if (trimmed.startsWith("- ") && currentKey && currentList) {
      currentList.push(String(parseValue(trimmed.slice(2).trim())));
      continue;
    }

    // Flush any pending list
    if (currentKey && currentList) {
      result[currentKey] = currentList;
      currentKey = null;
      currentList = null;
    }

    // Key: value pair
    const colonIdx = trimmed.indexOf(": ");
    const colonEnd = trimmed.indexOf(":");

    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 2).trim();

      if (rawValue === "" || rawValue === "|" || rawValue === ">") {
        // Could be start of a list or multi-line
        currentKey = key;
        currentList = [];
        continue;
      }

      result[key] = parseValue(rawValue);
    } else if (colonEnd === trimmed.length - 1) {
      // Key with no value (e.g., "metadata:")
      const key = trimmed.slice(0, -1).trim();
      currentKey = key;
      currentList = [];
    }
  }

  // Flush final list
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result as Frontmatter;
}

function parseValue(raw: string): string | number | boolean | string[] {
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  // Inline array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => {
      const v = s.trim();
      return stripQuotes(v);
    });
  }

  // Quoted string
  return stripQuotes(raw);
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

export function extractDescription(parsed: ParsedSkillFile): string {
  if (parsed.frontmatter.description) {
    const desc = String(parsed.frontmatter.description);
    return desc.length > 250 ? desc.slice(0, 247) + "..." : desc;
  }

  // Fall back to first paragraph of body
  const firstPara = parsed.body.split(/\n\n/)[0] || "";
  const cleaned = firstPara.replace(/^#+\s+.*\n?/, "").trim();
  if (cleaned) {
    return cleaned.length > 250 ? cleaned.slice(0, 247) + "..." : cleaned;
  }

  return "";
}

export function nameFromFilePath(filePath: string): string {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];

  // SKILL.md → use parent directory name
  if (fileName === "SKILL.md") {
    return parts[parts.length - 2] || "unknown";
  }

  // some-command.md → "some-command"
  return fileName.replace(/\.(md|mdc)$/, "");
}
