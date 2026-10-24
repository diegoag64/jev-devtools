import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { verificationPackage } from "./verification-package.mjs";

const script = resolve("scripts/release.mjs");
const hash = (data, algorithm, encoding) => createHash(algorithm).update(data).digest(encoding);

function candidate(t) {
  const cwd = mkdtempSync(join(tmpdir(), "jev-release-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "packages/jev-devtools"), { recursive: true });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
  writeFileSync(join(cwd, "packages/jev-devtools/package.json"), JSON.stringify({ name: "jev-devtools", version: "1.2.3", files: ["index.js"], publishConfig: { access: "public", registry: "https://registry.npmjs.org/" } }));
  writeFileSync(join(cwd, "packages/jev-devtools/index.js"), "export const answer = 42;\n");
  writeFileSync(join(cwd, "CHANGELOG.md"), "## Unreleased\n\nLater work.\n\n## 1.2.3 — Pending publication\n\nNot yet published.\n\n### Compatibility and upgrade\n\nInstall the SDK.\n\n### Changes\n\n- Add the feature.\n\n## 1.2.2 — Yesterday\n\nOlder work.\n");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q"); git("add", ".");
  git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  const commit = git("rev-parse", "HEAD");
  const env = { ...process.env, RELEASE_COMMIT: commit, npm_config_cache: join(cwd, "cache") };
  for (const key of ["GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "RELEASE_SHA256", "RELEASE_NOTES_SHA256"]) delete env[key];
  const folder = join(cwd, "artifact");
  const cli = (command, extra = {}) => spawnSync(process.execPath, [script, command, folder], { cwd, env: { ...env, ...extra }, encoding: "utf8" });
  const result = cli("prepare");
  assert.equal(result.status, 0, result.stderr);
  return { cwd, folder, commit, cli, meta: JSON.parse(readFileSync(join(folder, "release.json"), "utf8")) };
}

test("release candidate packs the selected commit and scopes notes to that version", (t) => {
  const { cwd, folder, commit, cli, meta } = candidate(t);
  assert.equal(meta.commit, commit);
  assert.equal(meta.version, "1.2.3");
  const notes = readFileSync(join(folder, "notes.md"), "utf8");
  assert.match(notes, /Install the SDK/);
  assert.match(notes, /Add the feature/);
  assert.doesNotMatch(notes, /Later work|Older work|Not yet published/);
  assert.equal(cli("check-artifact", { RELEASE_SHA256: meta.sha256 }).status, 0);
  writeFileSync(join(cwd, "packages/jev-devtools/index.js"), "export const answer = 99;\n");
  assert.match(cli("prepare").stderr, /Release checkout has tracked changes/);
});

test("approved artifact rejects changed archive bytes or notes", (t) => {
  const { folder, cli, meta } = candidate(t);
  const archive = join(folder, meta.filename);
  const original = readFileSync(archive);
  writeFileSync(archive, Buffer.concat([original, Buffer.from("changed")]));
  assert.match(cli("check-artifact").stderr, /Archive SHA-256 changed/);
  writeFileSync(archive, original);
  writeFileSync(join(folder, "notes.md"), "Different release notes");
  assert.match(cli("check-artifact").stderr, /Release notes changed/);
});

test("artifact validation rejects a different selected commit and mislabeled package version", (t) => {
  const { folder, cli, meta } = candidate(t);
  assert.match(cli("check-artifact", { RELEASE_COMMIT: "f".repeat(40) }).stderr, /Artifact commit differs from selected commit/);
  const changed = { ...meta, version: "1.2.4", filename: "jev-devtools-1.2.4.tgz" };
  writeFileSync(join(folder, changed.filename), readFileSync(join(folder, meta.filename)));
  writeFileSync(join(folder, "release.json"), JSON.stringify(changed));
  assert.match(cli("check-artifact").stderr, /Archive version differs from approved version/);
});

test("consumer tarball mode uses the supplied archive without invoking npm pack", (t) => {
  const { folder, meta } = candidate(t);
  const original = { archive: process.env.JEV_VERIFY_TARBALL, version: process.env.JEV_VERIFY_VERSION };
  t.after(() => {
    if (original.archive === undefined) delete process.env.JEV_VERIFY_TARBALL; else process.env.JEV_VERIFY_TARBALL = original.archive;
    if (original.version === undefined) delete process.env.JEV_VERIFY_VERSION; else process.env.JEV_VERIFY_VERSION = original.version;
  });
  const path = join(folder, meta.filename);
  process.env.JEV_VERIFY_TARBALL = path;
  delete process.env.JEV_VERIFY_VERSION;
  const result = verificationPackage(() => assert.fail("Must not repack the approved archive"), "/unused", "/unused");
  assert.equal(result.dependency, `file:${path}`);
  assert.ok(result.files.some(({ path }) => path === "index.js"));
  assert.equal(hash(readFileSync(path), "sha256", "hex"), meta.sha256);
  process.env.JEV_VERIFY_VERSION = "1.2.3";
  assert.throws(() => verificationPackage(() => {}, "/unused", "/unused"), /not both/);
});
