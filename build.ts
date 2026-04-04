import { $ } from "bun";
import { mkdirSync, existsSync, copyFileSync } from "fs";

const targets = [
  { name: "ags-darwin-arm64", target: "bun-darwin-arm64" },
  { name: "ags-darwin-x64", target: "bun-darwin-x64" },
  { name: "ags-linux-x64", target: "bun-linux-x64" },
] as const;

const outDir = "./dist";

async function build() {
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Build binaries
  console.log("Building AGS binaries...\n");

  for (const { name, target } of targets) {
    const outPath = `${outDir}/${name}`;
    console.log(`  Building ${name}...`);

    try {
      await $`bun build --compile --target=${target} --outfile=${outPath} ./src/index.ts`.quiet();
      console.log(`  ✓ ${outPath}`);

      const proc = Bun.spawn(["shasum", "-a", "256", outPath], {
        stdout: "pipe",
      });
      await proc.exited;
      const sha = (await new Response(proc.stdout).text()).trim();
      await Bun.write(`${outPath}.sha256`, sha + "\n");
      console.log(`  ✓ ${outPath}.sha256`);
    } catch (err) {
      console.error(`  ✗ Failed to build ${name}:`, err);
    }

    console.log();
  }

  // Copy completions to dist
  mkdirSync(`${outDir}/completions`, { recursive: true });
  copyFileSync("completions/_ags", `${outDir}/completions/_ags`);
  copyFileSync("completions/ags.bash", `${outDir}/completions/ags.bash`);
  console.log("  ✓ dist/completions/ (for Homebrew formula)\n");

  console.log("Done!");
}

build();
