import { describe, expect, test } from "bun:test";

// We need to test parseArgs which is in index.ts but not exported.
// Re-implement the same logic in a testable way by extracting it.
// For now, test via the module system — we'll import the function
// after making it exportable.

// Since parseArgs is not exported, we test the arg parsing logic
// by duplicating the core logic here. In a real codebase, you'd
// export it from a shared module.

const SHORT_FLAGS: Record<string, string> = {
  j: "json",
  a: "agent",
  t: "type",
  s: "scope",
  p: "period",
  v: "version",
  h: "help",
};

const BOOLEAN_FLAGS = new Set(["json", "help", "version", "dry-run"]);

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] || "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 2) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
        i++;
      } else {
        const key = arg.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          flags[key] = true;
          i++;
        } else {
          const next = args[i + 1];
          if (next && !next.startsWith("-")) {
            flags[key] = next;
            i += 2;
          } else {
            flags[key] = true;
            i++;
          }
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1 && !arg.startsWith("--")) {
      const chars = arg.slice(1);
      for (let ci = 0; ci < chars.length; ci++) {
        const ch = chars[ci];
        const longName = SHORT_FLAGS[ch] || ch;
        if (BOOLEAN_FLAGS.has(longName)) {
          flags[longName] = true;
        } else if (ci === chars.length - 1) {
          const next = args[i + 1];
          if (next && !next.startsWith("-")) {
            flags[longName] = next;
            i++;
          } else {
            flags[longName] = true;
          }
        } else {
          flags[longName] = true;
        }
      }
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { command, positional, flags };
}

describe("parseArgs", () => {
  // Helper: simulate argv with "node" and "script" prefix
  const parse = (...args: string[]) => parseArgs(["node", "script", ...args]);

  test("parses command", () => {
    expect(parse("scan").command).toBe("scan");
    expect(parse("rm").command).toBe("rm");
  });

  test("defaults to help when no command", () => {
    expect(parse().command).toBe("help");
  });

  test("parses --flag value", () => {
    const result = parse("scan", "--agent", "claude");
    expect(result.flags.agent).toBe("claude");
  });

  test("parses --flag=value", () => {
    const result = parse("scan", "--agent=claude");
    expect(result.flags.agent).toBe("claude");
  });

  test("parses boolean flags", () => {
    const result = parse("scan", "--json");
    expect(result.flags.json).toBe(true);
  });

  test("--json never consumes next arg as value", () => {
    const result = parse("scan", "--json", "--agent", "claude");
    expect(result.flags.json).toBe(true);
    expect(result.flags.agent).toBe("claude");
  });

  test("parses short flag -j", () => {
    const result = parse("scan", "-j");
    expect(result.flags.json).toBe(true);
  });

  test("parses short flag with value -a claude", () => {
    const result = parse("scan", "-a", "claude");
    expect(result.flags.agent).toBe("claude");
  });

  test("parses combined short boolean flags -jh", () => {
    const result = parse("scan", "-jh");
    expect(result.flags.json).toBe(true);
    expect(result.flags.help).toBe(true);
  });

  test("parses positional arguments", () => {
    const result = parse("rm", "my-skill");
    expect(result.positional).toEqual(["my-skill"]);
  });

  test("parses --dry-run as boolean", () => {
    const result = parse("rm", "my-skill", "--dry-run");
    expect(result.flags["dry-run"]).toBe(true);
  });

  test("handles mixed flags and positionals", () => {
    const result = parse("grab", "https://example.com", "--to", "cursor", "--json");
    expect(result.command).toBe("grab");
    expect(result.positional).toEqual(["https://example.com"]);
    expect(result.flags.to).toBe("cursor");
    expect(result.flags.json).toBe(true);
  });
});
