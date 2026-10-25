import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DocsBuildMode = "working-tree" | "publication";
const repository = "https://github.com/diegoag64/jev-devtools";

// The publisher and CI consume this manifest; no Git or build metadata code
// is shipped to the browser. Production must identify one clean checkout.
export function readBuildSnapshot(root: string, mode: DocsBuildMode) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain", "--untracked-files=normal") !== "";
  if (mode === "publication" && dirty)
    throw new Error("Docs publication requires a clean checkout. Commit or isolate changes, then build the reviewed commit again.");
  const pkg = JSON.parse(readFileSync(resolve(root, "packages/jev-devtools/package.json"), "utf8")) as { name: string; version: string };
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const sourceUrl = `${repository}/blob/${mode === "publication" ? commit : "main"}/CHANGELOG.md`;
  const manifest = {
    schemaVersion: 1,
    package: { name: pkg.name, version: pkg.version },
    source: { repository, commit, dirty, url: `${repository}/commit/${commit}` },
    build: { mode, createdAt: new Date().toISOString() },
    changelog: { sourceUrl, sha256: createHash("sha256").update(changelog).digest("hex") },
    site: { url: "https://docs.jevtools.dev", projectId: "appgprj_6add5705dbec8191b56b1c9555078a2d" },
  };
  return { manifest, changelog };
}
