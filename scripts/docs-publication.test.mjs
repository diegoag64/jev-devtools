import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashFiles,
  inspectArtifact,
  stageArtifact,
  verifyLive,
} from "./docs-publication.mjs";

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), "jev-docs-publication-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, "source"),
    artifact = join(temp, "artifact"),
    checkout = join(temp, "site");
  const write = (file, data) => {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
  };
  const git = (cwd, ...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commitAt = (cwd) => {
    git(cwd, "add", ".");
    git(
      cwd,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    return git(cwd, "rev-parse", "HEAD");
  };
  write(join(source, "packages/jev-devtools/package.json"), {
    name: "jev-devtools",
    version: "0.5.2",
  });
  const changelog = "# Changelog\n\n## 0.5.2\nPublished.\n";
  write(join(source, "CHANGELOG.md"), changelog);
  write(
    join(source, "scripts/docs-publication.mjs"),
    readFileSync(new URL("./docs-publication.mjs", import.meta.url), "utf8"),
  );
  git(source, "init", "-q");
  const commit = commitAt(source);
  git(source, "update-ref", "refs/remotes/origin/main", commit);
  const manifest = {
    schemaVersion: 1,
    package: { name: "jev-devtools", version: "0.5.2" },
    source: {
      repository: "https://github.com/diegoag64/jev-devtools",
      commit,
      dirty: false,
      url: `https://github.com/diegoag64/jev-devtools/commit/${commit}`,
    },
    build: { mode: "publication", createdAt: "2026-10-25T21:54:01Z" },
    changelog: {
      sourceUrl: `https://github.com/diegoag64/jev-devtools/blob/${commit}/CHANGELOG.md`,
      sha256: createHash("sha256").update(changelog).digest("hex"),
    },
    site: {
      url: "https://docs.jevtools.dev",
      projectId: "appgprj_6add5705dbec8191b56b1c9555078a2d",
    },
  };
  write(join(artifact, "version.json"), manifest);
  write(join(artifact, "raw/changelog.md"), changelog);
  for (const path of [
    "index.html",
    "getting-started/index.html",
    "api/reference/index.html",
    "changelog/index.html",
  ])
    write(join(artifact, path), '<html><h1 id="flow-jev">Docs</h1></html>');
  write(join(checkout, ".openai/hosting.json"), {
    project_id: manifest.site.projectId,
    static: { directory: "dist" },
    retained: true,
  });
  write(join(checkout, "README.md"), "Retain this source README.\n");
  write(join(checkout, "dist/old.html"), "Old generated file");
  git(checkout, "init", "-q");
  commitAt(checkout);
  const inspect = () => inspectArtifact({ source, artifact, commit });
  return {
    source,
    artifact,
    checkout,
    manifest,
    inspect,
    write,
    git,
    commitAt,
  };
}

test("CLI inspection works outside the source directory and preserves existing evidence", (t) => {
  const f = fixture(t);
  const output = join(f.artifact, "..", "inspection.json");
  const args = [
    join(f.source, "scripts/docs-publication.mjs"),
    "inspect",
    "--commit",
    f.manifest.source.commit,
    "--artifact",
    f.artifact,
    "--output",
    output,
  ];
  const run = () =>
    spawnSync(process.execPath, args, { cwd: tmpdir(), encoding: "utf8" });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const bytes = readFileSync(output);
  assert.equal(
    JSON.parse(bytes).manifest.source.commit,
    f.manifest.source.commit,
  );
  assert.notEqual(
    run().status,
    0,
    "Existing inspection evidence must not be overwritten",
  );
  assert.deepEqual(readFileSync(output), bytes);
});

test("inspection binds the artifact to a clean selected main commit and its source changelog", (t) => {
  const f = fixture(t);
  assert.equal(Object.keys(f.inspect().files).length, 6);
  assert.throws(
    () => inspectArtifact({ ...f, commit: "0".repeat(40) }),
    /differs from selected commit/,
  );
  f.write(join(f.source, "unreviewed.md"), "new");
  assert.throws(f.inspect, /clean checkout/);
  rmSync(join(f.source, "unreviewed.md"));
  f.write(join(f.source, "CHANGELOG.md"), "Changed source");
  const commit = f.commitAt(f.source);
  assert.throws(() => inspectArtifact({ ...f, commit }), /Command failed/);
  f.git(f.source, "update-ref", "refs/remotes/origin/main", commit);
  const changed = {
    ...f.manifest,
    source: {
      ...f.manifest.source,
      commit,
      url: `https://github.com/diegoag64/jev-devtools/commit/${commit}`,
    },
    changelog: {
      ...f.manifest.changelog,
      sourceUrl: `https://github.com/diegoag64/jev-devtools/blob/${commit}/CHANGELOG.md`,
    },
  };
  f.write(join(f.artifact, "version.json"), changed);
  assert.throws(
    () => inspectArtifact({ ...f, commit }),
    /Source changelog differs/,
  );
});

test("inspection rejects working-tree builds, wrong site/version and changed embedded changelogs", (t) => {
  const f = fixture(t);
  for (const [field, value, message] of [
    [
      "build",
      { ...f.manifest.build, mode: "working-tree" },
      /build:docs:publish/,
    ],
    [
      "site",
      { ...f.manifest.site, projectId: "another-site" },
      /Site identity/,
    ],
    ["package", { name: "jev-devtools", version: "0.5.1" }, /package version/],
  ]) {
    f.write(join(f.artifact, "version.json"), {
      ...f.manifest,
      [field]: value,
    });
    assert.throws(f.inspect, message);
  }
  f.write(join(f.artifact, "version.json"), f.manifest);
  f.write(join(f.artifact, "raw/changelog.md"), "Changed");
  assert.throws(f.inspect, /Embedded changelog/);
});

test("staging preserves inspected bytes and hosting settings, removes obsolete output, and refuses dirty reuse", (t) => {
  const f = fixture(t),
    inspection = f.inspect();
  const hosting = readFileSync(
    join(f.checkout, ".openai/hosting.json"),
    "utf8",
  );
  assert.equal(stageArtifact(inspection, f.checkout).files, 6);
  assert.deepEqual(hashFiles(join(f.checkout, "dist")), inspection.files);
  assert.equal(
    readFileSync(join(f.checkout, ".openai/hosting.json"), "utf8"),
    hosting,
  );
  assert.equal(
    readFileSync(join(f.checkout, "README.md"), "utf8"),
    "Retain this source README.\n",
  );
  assert.equal(
    JSON.parse(readFileSync(join(f.checkout, "source-provenance.json"))).commit,
    f.manifest.source.commit,
  );
  assert.throws(
    () => stageArtifact(inspection, f.checkout),
    /checkout has changes/,
  );
});

test("staging rejects changed artifacts, wrong checkout roots and wrong destinations before writing", (t) => {
  const f = fixture(t),
    inspection = f.inspect(),
    original = hashFiles(f.checkout + "/dist");
  f.write(join(f.artifact, "index.html"), "Unexpected rebuilt output");
  assert.throws(
    () => stageArtifact(inspection, f.checkout),
    /changed after inspection/,
  );
  assert.deepEqual(hashFiles(f.checkout + "/dist"), original);
  f.write(
    join(f.artifact, "index.html"),
    '<html><h1 id="flow-jev">Docs</h1></html>',
  );
  assert.throws(
    () => stageArtifact(inspection, f.checkout + "/dist"),
    /checkout root/,
  );
  f.write(join(f.checkout, ".openai/hosting.json"), {
    project_id: "wrong",
    static: { directory: "dist" },
  });
  f.commitAt(f.checkout);
  assert.throws(
    () => stageArtifact(inspection, f.checkout),
    /Wrong destination/,
  );
  assert.deepEqual(hashFiles(f.checkout + "/dist"), original);
});

test("publication artifacts reject symlinks and staging refuses overlapping source/destination", (t) => {
  const f = fixture(t);
  symlinkSync(join(f.source, "CHANGELOG.md"), join(f.artifact, "linked.md"));
  assert.throws(f.inspect, /symlinks/);
  rmSync(join(f.artifact, "linked.md"));
  // A valid inspected artifact inside the deployment checkout must never be replaced in place.
  f.write(join(f.checkout, ".gitignore"), "candidate/\n");
  f.commitAt(f.checkout);
  const inspection = f.inspect();
  const inside = join(f.checkout, "candidate");
  for (const path of Object.keys(inspection.files))
    f.write(join(inside, path), readFileSync(join(f.artifact, path), "utf8"));
  assert.throws(
    () => stageArtifact({ ...inspection, artifact: inside }, f.checkout),
    /must not overlap/,
  );
});

test("live readback fails on stale manifests, mismatched changelog, missing pages and deep links", async (t) => {
  const f = fixture(t),
    inspection = f.inspect();
  let fault = "";
  const server = createServer((req, res) => {
    let file = req.url.endsWith("/") ? req.url + "index.html" : req.url;
    if (fault === "missing" && req.url === "/getting-started/")
      return res.writeHead(404).end();
    let bytes = readFileSync(join(f.artifact, file));
    if (fault === "manifest" && req.url === "/version.json")
      bytes = Buffer.from(
        JSON.stringify({
          ...f.manifest,
          package: { name: "jev-devtools", version: "0.5.1" },
        }),
      );
    if (fault === "changelog" && req.url === "/raw/changelog.md")
      bytes = Buffer.from("Old notes");
    if (fault === "anchor" && req.url === "/api/reference/")
      bytes = Buffer.from("<html>Missing anchor</html>");
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await verifyLive(inspection, origin)).changelogMatches, true);
  for (const [name, error] of [
    ["manifest", /Live manifest/],
    ["changelog", /Live changelog/],
    ["missing", /HTTP 404/],
    ["anchor", /deep link/],
  ]) {
    fault = name;
    await assert.rejects(verifyLive(inspection, origin), error);
  }
});
