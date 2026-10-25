import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = "https://github.com/diegoag64/jev-devtools";
const site = {
  url: "https://docs.jevtools.dev",
  projectId: "appgprj_6add5705dbec8191b56b1c9555078a2d",
};
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export function hashFiles(directory) {
  const result = new Map();
  function visit(folder, prefix = "") {
    assert.ok(
      lstatSync(folder).isDirectory(),
      `Expected a real directory: ${folder}`,
    );
    for (const name of readdirSync(folder).sort()) {
      const file = join(folder, name);
      const key = prefix + name;
      const stat = lstatSync(file);
      if (stat.isDirectory()) visit(file, key + "/");
      else {
        assert.ok(
          stat.isFile(),
          `Publication files must not be symlinks or special files: ${file}`,
        );
        result.set(key, sha(readFileSync(file)));
      }
    }
  }
  visit(directory);
  return Object.fromEntries(result);
}

function validateManifest(manifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source.repository, repository);
  assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(
    manifest.source.url,
    `${repository}/commit/${manifest.source.commit}`,
  );
  assert.equal(
    manifest.source.dirty,
    false,
    "Publication source must be clean",
  );
  assert.equal(
    manifest.build.mode,
    "publication",
    "Use build:docs:publish, not a working-tree build",
  );
  assert.ok(Number.isFinite(Date.parse(manifest.build.createdAt)));
  assert.equal(manifest.package.name, "jev-devtools");
  assert.match(manifest.package.version, /^\d+\.\d+\.\d+$/);
  assert.equal(
    manifest.changelog.sourceUrl,
    `${repository}/blob/${manifest.source.commit}/CHANGELOG.md`,
  );
  assert.deepEqual(manifest.site, site, "Unexpected docs Site identity or URL");
}

export function inspectArtifact({
  source = root,
  artifact = join(source, "apps/docs/dist"),
  commit,
}) {
  assert.match(
    commit ?? "",
    /^[a-f0-9]{40}$/,
    "Supply the reviewed full --commit SHA",
  );
  assert.equal(
    git(source, "rev-parse", "HEAD"),
    commit,
    "Checkout differs from selected commit",
  );
  assert.equal(
    git(source, "status", "--porcelain", "--untracked-files=all"),
    "",
    "Publication inspection requires a clean checkout",
  );
  git(source, "merge-base", "--is-ancestor", commit, "origin/main");
  const files = hashFiles(artifact);
  for (const path of [
    "version.json",
    "raw/changelog.md",
    "index.html",
    "getting-started/index.html",
    "api/reference/index.html",
    "changelog/index.html",
  ])
    assert.ok(files[path], `Missing publication file: ${path}`);
  const manifest = json(join(artifact, "version.json"));
  validateManifest(manifest);
  assert.equal(
    manifest.source.commit,
    commit,
    "Artifact is from a different source commit",
  );
  const pkg = json(join(source, "packages/jev-devtools/package.json"));
  assert.equal(
    manifest.package.version,
    pkg.version,
    "Artifact package version differs from source",
  );
  assert.equal(
    manifest.changelog.sha256,
    files["raw/changelog.md"],
    "Embedded changelog hash differs",
  );
  assert.equal(
    manifest.changelog.sha256,
    sha(readFileSync(join(source, "CHANGELOG.md"))),
    "Source changelog differs",
  );
  return {
    schemaVersion: 1,
    inspectedAt: new Date().toISOString(),
    artifact: realpathSync(artifact),
    manifest,
    files,
  };
}

function validateInspection(inspection) {
  assert.equal(inspection.schemaVersion, 1);
  validateManifest(inspection.manifest);
  assert.ok(
    isAbsolute(inspection.artifact),
    "Inspection must identify an absolute artifact path",
  );
  assert.deepEqual(
    hashFiles(inspection.artifact),
    inspection.files,
    "Artifact files changed after inspection",
  );
  assert.deepEqual(
    json(join(inspection.artifact, "version.json")),
    inspection.manifest,
    "Inspected manifest changed",
  );
  assert.equal(
    inspection.files["raw/changelog.md"],
    inspection.manifest.changelog.sha256,
  );
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function stageArtifact(inspection, destination) {
  validateInspection(inspection);
  const checkout = realpathSync(destination);
  assert.equal(
    realpathSync(git(checkout, "rev-parse", "--show-toplevel")),
    checkout,
    "Use the Sites checkout root, not a subdirectory",
  );
  assert.equal(
    git(checkout, "status", "--porcelain", "--untracked-files=all"),
    "",
    "Sites checkout has changes; inspect them before staging",
  );
  const hostingFile = join(checkout, ".openai/hosting.json");
  assert.ok(
    lstatSync(join(checkout, ".openai")).isDirectory() &&
      lstatSync(hostingFile).isFile(),
    "Hosting config must not use symlinks",
  );
  const hosting = json(hostingFile);
  assert.equal(hosting.project_id, site.projectId, "Wrong destination Site");
  assert.equal(
    hosting.static?.directory,
    "dist",
    "Expected the existing static dist deployment",
  );
  const target = join(checkout, "dist");
  const artifact = realpathSync(inspection.artifact);
  assert.ok(
    !inside(artifact, checkout) && !inside(checkout, artifact),
    "Artifact and destination must not overlap",
  );
  if (existsSync(target)) hashFiles(target); // Reject symlinks before replacing generated files.
  const provenance = join(checkout, "source-provenance.json");
  // lstat also sees dangling symlinks; existsSync follows them and reports absence.
  const provenanceInfo = lstatSync(provenance, { throwIfNoEntry: false });
  assert.ok(
    !provenanceInfo || provenanceInfo.isFile(),
    "Provenance must be a regular file",
  );
  const staging = mkdtempSync(join(checkout, ".docs-staging-"));
  try {
    cpSync(inspection.artifact, join(staging, "dist"), { recursive: true });
    assert.deepEqual(
      hashFiles(join(staging, "dist")),
      inspection.files,
      "Copied artifact differs",
    );
    if (existsSync(target)) renameSync(target, join(staging, "previous"));
    try {
      renameSync(join(staging, "dist"), target);
    } catch (error) {
      if (existsSync(join(staging, "previous")))
        renameSync(join(staging, "previous"), target);
      throw error;
    }
    const { manifest } = inspection;
    writeFileSync(
      join(staging, "source-provenance.json"),
      JSON.stringify(
        {
          repository,
          branch: "main",
          commit: manifest.source.commit,
          build: "npm run build:docs:publish",
          package_version: manifest.package.version,
          changelog_source: manifest.changelog.sourceUrl,
          changelog_sha256: manifest.changelog.sha256,
        },
        null,
        2,
      ) + "\n",
    );
    // Replace the entry without following a link introduced after validation.
    renameSync(join(staging, "source-provenance.json"), provenance);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return {
    checkout,
    canonicalCommit: inspection.manifest.source.commit,
    files: Object.keys(inspection.files).length,
  };
}

export async function verifyLive(inspection, origin = site.url) {
  validateInspection(inspection);
  const get = async (path) => {
    const response = await fetch(new URL(path, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return response;
  };
  const manifest = await (await get("/version.json")).json();
  assert.deepEqual(
    manifest,
    inspection.manifest,
    "Live manifest differs from inspected artifact",
  );
  const changelog = Buffer.from(
    await (await get("/raw/changelog.md")).arrayBuffer(),
  );
  assert.equal(
    sha(changelog),
    manifest.changelog.sha256,
    "Live changelog differs",
  );
  const pages = ["/", "/getting-started/", "/api/reference/", "/changelog/"];
  for (const path of pages) {
    const html = await (await get(path)).text();
    assert.match(html, /<html\b/i, `${path}: expected HTML`);
    if (path === "/api/reference/")
      assert.match(html, /id="flow-jev"/, "Missing flow-jev deep link");
  }
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    origin,
    manifest,
    changelogMatches: true,
    pages,
  };
}

function saveEvidence(path, value) {
  const output = resolve(path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      commit: { type: "string" },
      artifact: { type: "string" },
      output: { type: "string" },
      inspection: { type: "string" },
      checkout: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "docs-publication inspect --commit FULL_SHA [--artifact DIR] --output NEW_JSON\ndocs-publication stage --inspection JSON --checkout SITES_ROOT\ndocs-publication verify-live --inspection JSON --output NEW_JSON\nLocal preparation/readback only. Use the Sites skill for open, package, save and explicitly authorized deployment. Run from any directory; default source/artifact resolve from this script.",
    );
  } else {
    assert.equal(
      positionals.length,
      1,
      "Choose inspect, stage, or verify-live; see --help",
    );
    const [command] = positionals;
    if (command === "inspect") {
      assert.ok(values.output, "--output is required");
      const result = inspectArtifact({
        commit: values.commit,
        ...(values.artifact ? { artifact: resolve(values.artifact) } : {}),
      });
      saveEvidence(values.output, result);
      console.log(
        `Inspected ${Object.keys(result.files).length} files at ${result.manifest.source.commit}; ${resolve(values.output)}`,
      );
    } else {
      assert.ok(values.inspection, "--inspection is required");
      const inspection = json(resolve(values.inspection));
      if (command === "stage") {
        assert.ok(values.checkout, "--checkout is required");
        console.log(
          JSON.stringify(stageArtifact(inspection, resolve(values.checkout))),
        );
      } else {
        assert.equal(command, "verify-live", "Unknown command; see --help");
        assert.ok(values.output, "--output is required");
        const result = await verifyLive(inspection);
        saveEvidence(values.output, result);
        console.log(
          `Live docs match ${result.manifest.source.commit}; ${resolve(values.output)}`,
        );
      }
    }
  }
}
