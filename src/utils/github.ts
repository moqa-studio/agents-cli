export interface GitHubFileInfo {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  rawUrl: string;
  fileName: string;
}

// Matches: https://github.com/owner/repo/blob/branch/path/to/file.md
const BLOB_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;

// Matches: https://raw.githubusercontent.com/owner/repo/branch/path/to/file.md
const RAW_RE =
  /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;

export function parseGitHubUrl(url: string): GitHubFileInfo | null {
  const isBlob = url.match(BLOB_RE);
  const match = isBlob || url.match(RAW_RE);
  if (!match) return null;

  const [, owner, repo, branch, path] = match;
  const fileName = path.split("/").pop() || "SKILL.md";
  const rawUrl = isBlob
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    : url;

  return { owner, repo, branch, path, rawUrl, fileName };
}

const MAX_FETCH_SIZE = 1_024 * 1_024; // 1MB
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchRawContent(info: GitHubFileInfo): Promise<string> {
  const response = await fetch(info.rawUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${info.rawUrl}: ${response.status} ${response.statusText}`
    );
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_FETCH_SIZE) {
    throw new Error(`File too large (${contentLength} bytes, max ${MAX_FETCH_SIZE})`);
  }

  return response.text();
}
