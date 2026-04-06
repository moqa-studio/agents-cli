const bump = process.argv[2] as "patch" | "minor" | "major" | undefined;

if (!bump || !["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: bun run release <patch|minor|major>");
  process.exit(1);
}

function run(cmd: string[]): string {
  const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    console.error(`Command failed: ${cmd.join(" ")}`);
    process.exit(1);
  }
  return proc.stdout.toString().trim();
}

// Ensure working tree is clean
const status = run(["git", "status", "--porcelain"]);
if (status) {
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

console.log(`Bumped version: ${major}.${minor}.${patch} → ${newVersion}`);

// Commit, tag, push
run(["git", "add", "package.json"]);
run(["git", "commit", "-m", `release: v${newVersion}`]);
run(["git", "tag", `v${newVersion}`]);
run(["git", "push", "origin", "main", `v${newVersion}`]);

console.log(`\nv${newVersion} released! CI will handle the rest.`);
console.log(`Watch progress: https://github.com/moqa-studio/agents-cli/actions`);
