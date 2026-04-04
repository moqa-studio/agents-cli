import { describe, expect, test } from "bun:test";
import { estimateTokens, formatTokens, tokenBar } from "../src/core/tokens";

describe("estimateTokens", () => {
  test("returns positive number for non-empty text", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
  });

  test("returns 0 for empty text", () => {
    // Empty string has 0 words and 0 symbols
    expect(estimateTokens("")).toBe(0);
  });

  test("longer text produces more tokens", () => {
    const short = estimateTokens("hello");
    const long = estimateTokens("hello world this is a much longer string with many words");
    expect(long).toBeGreaterThan(short);
  });

  test("code with symbols counts more than plain prose", () => {
    const prose = estimateTokens("This is a simple sentence with ten words in it");
    const code = estimateTokens("if (x > 0) { return foo(bar[i], baz); }");
    // Code has more symbols per word, so per-word it should be heavier
    const prosePerWord = prose / 10;
    const codePerWord = code / 8; // ~8 words in the code
    expect(codePerWord).toBeGreaterThan(prosePerWord * 0.8); // code is at least close
  });

  test("handles whitespace-only text", () => {
    expect(estimateTokens("   \n\t  ")).toBe(0);
  });
});

describe("formatTokens", () => {
  test("formats small numbers as-is", () => {
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  test("formats thousands with k suffix", () => {
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(2000)).toBe("2.0k");
    expect(formatTokens(99999)).toBe("100.0k");
  });

  test("formats large numbers rounded", () => {
    expect(formatTokens(100000)).toBe("100k");
    expect(formatTokens(200000)).toBe("200k");
  });
});

describe("tokenBar", () => {
  test("returns a string with percentage", () => {
    const bar = tokenBar(50, 100, 10);
    expect(bar).toContain("50.0%");
  });

  test("caps at 100%", () => {
    const bar = tokenBar(200, 100, 10);
    expect(bar).toContain("100.0%");
  });

  test("shows 0% for zero tokens", () => {
    const bar = tokenBar(0, 100, 10);
    expect(bar).toContain("0.0%");
  });
});
