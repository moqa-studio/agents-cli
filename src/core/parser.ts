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

/**
 * Minimal YAML parser for skill frontmatter.
 *
 * Supports: flat key:value pairs, lists (- items), inline arrays [a, b],
 * quoted strings, booleans, numbers, and multi-line strings (| and >).
 *
 * Limitations:
 * - No nested objects (sub-keys are collected as flat list items)
 * - No anchors/aliases, flow mappings, or tagged types
 * - Multi-line strings use simple indentation detection
 *
 * For complex frontmatter, consider using a full YAML parser.
 */
function parseYaml(yaml: string): Frontmatter {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentList: string[] | null = null;
  let multiLineMode: "|" | ">" | null = null;
  let multiLineLines: string[] = [];
  let multiLineIndent = -1;

  function flushMultiLine() {
    if (currentKey && multiLineMode) {
      const joined = multiLineMode === "|"
        ? multiLineLines.join("\n")
        : multiLineLines.join(" ");
      result[currentKey] = joined.trim();
    }
    multiLineMode = null;
    multiLineLines = [];
    multiLineIndent = -1;
  }

  function flushList() {
    if (currentKey && currentList) {
      result[currentKey] = currentList;
    }
    currentKey = null;
    currentList = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Accumulate multi-line string content
    if (multiLineMode && currentKey) {
      if (trimmed === "") {
        multiLineLines.push("");
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (multiLineIndent < 0) multiLineIndent = indent;
      if (indent >= multiLineIndent) {
        multiLineLines.push(line.slice(multiLineIndent));
        continue;
      }
      // De-indented line → end of multi-line block, re-process this line
      flushMultiLine();
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    // List item under current key
    if (trimmed.startsWith("- ") && currentKey && currentList) {
      currentList.push(String(parseValue(trimmed.slice(2).trim())));
      continue;
    }

    // Flush any pending list
    flushList();

    // Key: value pair
    const colonIdx = trimmed.indexOf(": ");
    const colonEnd = trimmed.indexOf(":");

    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 2).trim();

      if (rawValue === "|" || rawValue === ">") {
        currentKey = key;
        multiLineMode = rawValue as "|" | ">";
        multiLineLines = [];
        multiLineIndent = -1;
        continue;
      }

      if (rawValue === "") {
        // Could be start of a list
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

  // Flush final pending state
  if (multiLineMode) flushMultiLine();
  flushList();

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
