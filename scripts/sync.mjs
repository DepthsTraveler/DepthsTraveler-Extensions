// Copies the extensions listed in sources.json from their repos into src/.
// Each listed path is replaced with the current copy from its repo and branch,
// so edits belong in the source repos (your forks), not in this repo.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const tmp = join(root, ".sync-tmp");
const { sources } = JSON.parse(readFileSync(join(root, "sources.json"), "utf8"));

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp);

for (const source of sources) {
  const dir = join(tmp, source.name);
  console.log(`Fetching ${source.repo} (${source.branch})`);
  execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", source.branch, source.repo, dir], {
    stdio: "inherit",
  });
  const commit = execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"]).toString().trim();

  for (const path of source.paths) {
    const from = join(dir, path);
    if (!existsSync(from)) throw new Error(`${path} not found in ${source.repo} (${source.branch})`);
    rmSync(join(root, path), { recursive: true, force: true });
    cpSync(from, join(root, path), { recursive: true });
    console.log(`  ${path} <- ${source.name}@${commit}`);
  }
}

rmSync(tmp, { recursive: true, force: true });
