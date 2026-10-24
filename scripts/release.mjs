import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [command, directory = "benchmarks/results/release"] = process.argv.slice(2);
const folder = resolve(directory);
const run = (bin, args) => {
  // Match the consumer scripts: Node cannot spawn npm.cmd directly on Windows.
  if (bin === "npm" && process.platform === "win32") {
    const cli = /npm-cli\.js$/.test(process.env.npm_execpath ?? "")
      ? process.env.npm_execpath
      : join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    return execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" }).trim();
  }
  return execFileSync(bin, args, { encoding: "utf8" }).trim();
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding);
const repository = "diegoag64/jev-devtools";

function artifact() {
  const meta = json(join(folder, "release.json"));
  assert.match(meta.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.match(meta.commit, /^[a-f0-9]{40}$/);
  assert.equal(meta.filename, `jev-devtools-${meta.version}.tgz`);
  const archive = join(folder, meta.filename);
  const bytes = readFileSync(archive);
  assert.equal(digest(bytes, "sha256", "hex"), meta.sha256, "Archive SHA-256 changed");
  assert.equal(`sha512-${digest(bytes, "sha512", "base64")}`, meta.integrity, "Archive integrity changed");
  const manifest = JSON.parse(run("tar", ["-xOf", archive, "package/package.json"]));
  assert.equal(manifest.name, "jev-devtools");
  assert.equal(manifest.version, meta.version, "Archive version differs from approved version");
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.publishConfig?.access, "public");
  assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
  assert.equal(digest(readFileSync(join(folder, "notes.md")), "sha256", "hex"), meta.notesSha256, "Release notes changed");
  if (process.env.RELEASE_COMMIT) assert.equal(meta.commit, process.env.RELEASE_COMMIT, "Artifact commit differs from selected commit");
  if (process.env.RELEASE_SHA256) assert.equal(meta.sha256, process.env.RELEASE_SHA256);
  if (process.env.RELEASE_NOTES_SHA256) assert.equal(meta.notesSha256, process.env.RELEASE_NOTES_SHA256);
  return { ...meta, archive };
}

async function registry(path, optional = false) {
  const response = await fetch(`https://registry.npmjs.org/jev-devtools${path}`);
  if (optional && response.status === 404) return null;
  assert.ok(response.ok, `npm registry returned ${response.status}`);
  return response.json();
}

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, { flag: "a" });
}

if (command === "prepare") {
  const commit = run("git", ["rev-parse", "HEAD"]);
  assert.equal(commit, process.env.RELEASE_COMMIT, "Checkout must match the selected release commit");
  assert.equal(run("git", ["status", "--porcelain", "--untracked-files=no"]), "", "Release checkout has tracked changes");
  const { name, version } = json("packages/jev-devtools/package.json");
  assert.equal(name, "jev-devtools");
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "This workflow publishes stable versions to latest only");
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const section = changelog.split(/^## /m).find((part) => part.startsWith(`${version} — `));
  assert.ok(section?.includes("\n### Compatibility and upgrade\n") && section.includes("\n### Changes\n"), "Release changelog needs Compatibility and upgrade, and Changes subsections");
  mkdirSync(folder, { recursive: true });
  // Checks have already built the package. Pack once without rebuilding it.
  const [packed] = JSON.parse(run("npm", ["pack", "--workspace", "jev-devtools", "--ignore-scripts", "--json", "--pack-destination", folder]));
  assert.equal(packed.filename, `jev-devtools-${version}.tgz`);
  const bytes = readFileSync(join(folder, packed.filename));
  // The pending/publication preamble is record-keeping, not shipped release notes.
  const notes = `Jev DevTools ${version}\n\nPublished from \`${commit}\`.\n\n${section.slice(section.indexOf("\n### ") + 1).trim()}\n\n[npm package](https://www.npmjs.com/package/jev-devtools/v/${version})\n`;
  writeFileSync(join(folder, "notes.md"), notes);
  const meta = { version, commit, filename: packed.filename, sha256: digest(bytes, "sha256", "hex"), integrity: `sha512-${digest(bytes, "sha512", "base64")}`, notesSha256: digest(notes, "sha256", "hex") };
  writeFileSync(join(folder, "release.json"), `${JSON.stringify(meta, null, 2)}\n`);
  artifact();
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nsha256=${meta.sha256}\nnotes_sha256=${meta.notesSha256}\n`, { flag: "a" });
  }
  summary(`## Release candidate ${version}\n\nCommit: \`${commit}\`\n\nArchive SHA-256: \`${meta.sha256}\`\n\nInspect the release-candidate artifact and notes before approving npm-release.`);
} else if (command === "check-artifact") {
  const meta = artifact();
  console.log(`Verified ${meta.filename} at ${meta.commit}`);
} else if (command === "preflight") {
  const meta = artifact();
  const published = await registry(`/${meta.version}`, true);
  assert.equal(published, null, "Version already exists on npm. Recover remaining release steps manually; do not republish.");
  const latest = await registry("/latest");
  const compare = (a, b) => {
    const left = a.split(".").map(Number), right = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  };
  assert.match(latest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(compare(meta.version, latest.version) > 0, "Release must advance npm latest");
  const refs = run("git", ["ls-remote", "--tags", "origin", `refs/tags/v${meta.version}`]);
  assert.equal(refs, "", "Tag already exists. Inspect and recover the release manually.");
  console.log(`New release ${meta.version}; npm latest is ${latest.version}`);
} else if (command === "verify-npm") {
  const meta = artifact();
  // npm can accept an upload before its processing and registry propagation finish.
  // Allow nearly ten minutes within the publish job's twenty-minute timeout.
  // Exhaustion remains a partial release; never retry the upload here.
  const maxAttempts = 120;
  let verified;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const published = await registry(`/${meta.version}`, true);
    if (published) {
      assert.equal(published.dist.integrity, meta.integrity, "Published archive differs from approved archive");
      assert.ok(published.dist.attestations?.url, "Published package is missing provenance attestations");
      const latest = await registry("/latest");
      if (latest.version === meta.version) { verified = published; break; }
    }
    if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  assert.ok(verified, "npm version/latest verification is pending; do not republish");
  const record = await registry("");
  assert.ok(record.time?.[meta.version], "Missing npm publication timestamp");
  const evidence = { ...meta, archive: undefined, publishedAt: record.time[meta.version], npm: `https://www.npmjs.com/package/jev-devtools/v/${meta.version}`, provenance: verified.dist.attestations.url };
  writeFileSync(join(folder, "publication.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  summary(`npm ${meta.version} verified at ${evidence.publishedAt}; integrity and provenance match. GitHub release and registry consumers still need verification.`);
} else if (command === "github-release") {
  const meta = artifact();
  assert.equal(json(join(folder, "publication.json")).integrity, meta.integrity);
  assert.equal((await registry("/latest")).version, meta.version, "npm latest advanced; do not replace GitHub Latest with an older version");
  // Preflight forbids existing tags; GitHub creates the new tag at this SHA.
  assert.equal(run("git", ["ls-remote", "--tags", "origin", `refs/tags/v${meta.version}`]), "", "Tag appeared after approval; inspect before proceeding");
  run("gh", ["release", "create", `v${meta.version}`, "--repo", repository, "--target", meta.commit, "--title", `Jev DevTools ${meta.version}`, "--notes-file", join(folder, "notes.md"), "--latest"]);
  const ref = JSON.parse(run("gh", ["api", `repos/${repository}/git/ref/tags/v${meta.version}`]));
  assert.equal(ref.object.type, "commit");
  assert.equal(ref.object.sha, meta.commit);
  const latest = JSON.parse(run("gh", ["api", `repos/${repository}/releases/latest`]));
  assert.equal(latest.tag_name, `v${meta.version}`);
  assert.equal(latest.draft, false);
  assert.equal(latest.prerelease, false);
  summary(`## Publication verified\n\n[npm ${meta.version}](https://www.npmjs.com/package/jev-devtools/v/${meta.version}) · [GitHub release](${latest.html_url})\n\nCommit: \`${meta.commit}\`\n\n**Follow-up pending:** update CHANGELOG.md and docs/releases.md through a PR with publication.json, both release links, and the verified UTC timestamp. Do not republish this version.`);
} else {
  throw new Error("Usage: node scripts/release.mjs prepare|check-artifact|preflight|verify-npm|github-release [artifact-directory]");
}
