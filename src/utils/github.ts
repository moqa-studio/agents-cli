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

export async function fetchRawContent(info: GitHubFileInfo): Promise<string> {
  const response = await fetch(info.rawUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${info.rawUrl}: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}
