import { statSync } from "fs";

export async function getLastModified(filePath: string): Promise<number> {
  // Try git first
  try {
    const proc = Bun.spawn(
      ["git", "log", "-1", "--format=%ct", "--", filePath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const text = await new Response(proc.stdout).text();
      const ts = parseInt(text.trim(), 10);
      if (!isNaN(ts) && ts > 0) return ts;
    }
  } catch {
    // git not available or not a git repo
  }

  // Fallback to filesystem mtime
  try {
    const stat = statSync(filePath);
    return Math.floor(stat.mtimeMs / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["git", "rev-parse", "--git-dir"],
      { stdout: "pipe", stderr: "pipe", cwd: dir }
    );
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}
