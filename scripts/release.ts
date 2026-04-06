import { $ } from "bun";

const bump = process.argv[2] as "patch" | "minor" | "major" | undefined;

if (!bump || !["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: bun run release <patch|minor|major>");
  process.exit(1);
}

// Ensure working tree is clean
const status = await $`git status --porcelain`.text();
if (status.trim()) {
  console.error("Working tree is dirty. Commit or stash changes first.");
  process.exit(1);
}

// Bump version in package.json
const pkg = await Bun.file("package.json").json();
const [major, minor, patch] = pkg.version.split(".").map(Number);

const newVersion =
  bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log(`Bumped version: ${pkg.version.replace(newVersion, "")}${major}.${minor}.${patch} → ${newVersion}`);

// Commit, tag, push
await $`git add package.json`;
await $`git commit -m "release: v${newVersion}"`;
await $`git tag v${newVersion}`;
await $`git push origin main v${newVersion}`;

console.log(`\nv${newVersion} released! CI will handle the rest.`);
console.log(`Watch progress: https://github.com/moqa-studio/agents-cli/actions`);
