import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuildSnapshot } from "../build-info.js";

function checkout(t: { after: (cleanup: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "jev-docs-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  mkdirSync(join(root, "packages/jev-devtools"), { recursive: true });
  const write = (version: string, changelog: string) => {
    writeFileSync(join(root, "packages/jev-devtools/package.json"), JSON.stringify({ name: "jev-devtools", version }));
    writeFileSync(join(root, "CHANGELOG.md"), changelog);
  };
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=Docs fixture", "-c", "user.email=docs@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Docs snapshot");
    return git("rev-parse", "HEAD");
  };
  return { root, git, write, commit };
}

test("publication provenance follows the selected commit, including older detached releases", (t) => {
  const repo = checkout(t);
  const notes = "# Changelog\n\n## 1.2.3\n\n- Document this release.\n";
  repo.write("1.2.3", notes);
  const released = repo.commit();
  repo.write("1.3.0", "# Changelog\n\n## Unreleased\n\n- Future API.\n");
  repo.commit();
  repo.git("checkout", "--quiet", "--detach", released);
  const { manifest, changelog } = readBuildSnapshot(repo.root, "publication");
  assert.equal(manifest.source.commit, released);
  assert.equal(manifest.source.dirty, false);
  assert.equal(manifest.package.version, "1.2.3");
  assert.equal(manifest.build.mode, "publication");
  assert.equal(changelog, notes, "Do not substitute newer main-branch release notes");
  assert.equal(manifest.changelog.sha256, createHash("sha256").update(notes).digest("hex"));
  assert.equal(manifest.changelog.sourceUrl, `https://github.com/diegoag64/jev-devtools/blob/${released}/CHANGELOG.md`);
  assert.ok(Number.isFinite(Date.parse(manifest.build.createdAt)));
});

test("publication rejects staged, unstaged, and untracked source while local builds identify edits", (t) => {
  const repo = checkout(t);
  repo.write("1.2.3", "# Changelog\n\n## 1.2.3\n");
  repo.commit();
  const edited = "# Changelog\n\n## Unreleased\n\n- Local draft.\n";
  repo.write("1.2.4", edited);
  assert.throws(() => readBuildSnapshot(repo.root, "publication"), /clean checkout/);
  const local = readBuildSnapshot(repo.root, "working-tree");
  assert.equal(local.manifest.source.dirty, true);
  assert.equal(local.manifest.build.mode, "working-tree");
  assert.equal(local.manifest.package.version, "1.2.4");
  assert.equal(local.changelog, edited);
  repo.git("add", ".");
  assert.throws(() => readBuildSnapshot(repo.root, "publication"), /clean checkout/);
  repo.git("reset", "--hard", "HEAD");
  writeFileSync(join(repo.root, "new-guide.md"), "Unreviewed guide");
  assert.throws(() => readBuildSnapshot(repo.root, "publication"), /clean checkout/);
});
