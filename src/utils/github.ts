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
  let match = url.match(BLOB_RE);
  if (match) {
    const [, owner, repo, branch, path] = match;
    const fileName = path.split("/").pop() || "SKILL.md";
    return {
      owner,
      repo,
      branch,
      path,
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
      fileName,
    };
  }

  match = url.match(RAW_RE);
  if (match) {
    const [, owner, repo, branch, path] = match;
    const fileName = path.split("/").pop() || "SKILL.md";
    return {
      owner,
      repo,
      branch,
      path,
      rawUrl: url,
      fileName,
    };
  }

  return null;
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
