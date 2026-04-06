import { describe, expect, test } from "bun:test";
import { estimateTokens, formatTokens } from "../src/core/tokens";

describe("estimateTokens", () => {
  test("empty → 0, non-empty → positive, longer → more", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
    expect(estimateTokens("a b c d e f g h")).toBeGreaterThan(estimateTokens("hello"));
  });
});

describe("formatTokens", () => {
  test("formats across ranges", () => {
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(200000)).toBe("200k");
  });
});
