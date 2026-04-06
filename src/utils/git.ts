import { dirname } from "path";
import { statSync } from "fs";

export async function getLastModified(filePath: string): Promise<number> {
  // Try git in the file's own directory (not cwd)
  try {
    const proc = Bun.spawn(
      ["git", "log", "-1", "--format=%ct", "--", filePath],
      { stdout: "pipe", stderr: "pipe", cwd: dirname(filePath) }
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
