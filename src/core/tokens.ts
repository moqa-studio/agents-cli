export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 100_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
}

export function tokenBar(
  tokens: number,
  maxTokens: number,
  width = 30
): string {
  const ratio = Math.min(tokens / maxTokens, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  const pct = (ratio * 100).toFixed(1);
  return `${bar} ${pct}%`;
}
