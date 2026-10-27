import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { verificationPackage } from "./verification-package.mjs";

const script = resolve("scripts/release.mjs");
const hash = (data, algorithm, encoding) =>
  createHash(algorithm).update(data).digest(encoding);

function candidate(t) {
  const cwd = mkdtempSync(join(tmpdir(), "jev-release-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "packages/jev-devtools"), { recursive: true });
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  writeFileSync(
    join(cwd, "packages/jev-devtools/package.json"),
    JSON.stringify({
      name: "jev-devtools",
      version: "1.2.3",
      files: ["index.js"],
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
    }),
  );
  writeFileSync(
    join(cwd, "packages/jev-devtools/index.js"),
    "export const answer = 42;\n",
  );
  writeFileSync(
    join(cwd, "CHANGELOG.md"),
    "## Unreleased\n\nLater work.\n\n## 1.2.3 — Prepared release\n\nSee release notes for verified publication status.\n\n### Compatibility and upgrade\n\nInstall the SDK.\n\n### Changes\n\n#### Added\n\n- **Feature.** Add the feature.\n\n#### Fixed\n\n- **Cancellation.** Preserve the original error.\n\n## 1.2.2 — Yesterday\n\nOlder work.\n",
  );
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", ".");
  git(
    "-c",
    "user.name=Release fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  const commit = git("rev-parse", "HEAD");
  const env = {
    ...process.env,
    RELEASE_COMMIT: commit,
    npm_config_cache: join(cwd, "cache"),
  };
  for (const key of [
    "GITHUB_OUTPUT",
    "GITHUB_STEP_SUMMARY",
    "RELEASE_SHA256",
    "RELEASE_NOTES_SHA256",
  ])
    delete env[key];
  const folder = join(cwd, "artifact");
  const cli = (command, extra = {}, nodeArgs = []) =>
    spawnSync(process.execPath, [...nodeArgs, script, command, folder], {
      cwd,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  const result = cli("prepare");
  assert.equal(result.status, 0, result.stderr);
  return {
    cwd,
    folder,
    commit,
    cli,
    meta: JSON.parse(readFileSync(join(folder, "release.json"), "utf8")),
  };
}

test("release candidate packs the selected commit and scopes notes to that version", (t) => {
  const { cwd, folder, commit, cli, meta } = candidate(t);
  assert.equal(meta.commit, commit);
  assert.equal(meta.version, "1.2.3");
  const notes = readFileSync(join(folder, "notes.md"), "utf8");
  assert.match(notes, /Install the SDK/);
  assert.match(notes, /#### Added\n\n- \*\*Feature\.\*\* Add the feature/);
  assert.match(
    notes,
    /#### Fixed\n\n- \*\*Cancellation\.\*\* Preserve the original error/,
  );
  assert.doesNotMatch(
    notes,
    /Later work|Older work|See release notes for verified publication status/,
  );
  assert.equal(
    cli("check-artifact", { RELEASE_SHA256: meta.sha256 }).status,
    0,
  );
  writeFileSync(
    join(cwd, "packages/jev-devtools/index.js"),
    "export const answer = 99;\n",
  );
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
  assert.match(
    cli("check-artifact", { RELEASE_COMMIT: "f".repeat(40) }).stderr,
    /Artifact commit differs from selected commit/,
  );
  const changed = {
    ...meta,
    version: "1.2.4",
    filename: "jev-devtools-1.2.4.tgz",
  };
  writeFileSync(
    join(folder, changed.filename),
    readFileSync(join(folder, meta.filename)),
  );
  writeFileSync(join(folder, "release.json"), JSON.stringify(changed));
  assert.match(
    cli("check-artifact").stderr,
    /Archive version differs from approved version/,
  );
});

test("consumer tarball mode uses the supplied archive without invoking npm pack", (t) => {
  const { folder, meta } = candidate(t);
  const original = {
    archive: process.env.JEV_VERIFY_TARBALL,
    version: process.env.JEV_VERIFY_VERSION,
  };
  t.after(() => {
    if (original.archive === undefined) delete process.env.JEV_VERIFY_TARBALL;
    else process.env.JEV_VERIFY_TARBALL = original.archive;
    if (original.version === undefined) delete process.env.JEV_VERIFY_VERSION;
    else process.env.JEV_VERIFY_VERSION = original.version;
  });
  const path = join(folder, meta.filename);
  process.env.JEV_VERIFY_TARBALL = path;
  delete process.env.JEV_VERIFY_VERSION;
  const result = verificationPackage(
    () => assert.fail("Must not repack the approved archive"),
    "/unused",
    "/unused",
  );
  assert.equal(result.dependency, `file:${path}`);
  assert.ok(result.files.some(({ path }) => path === "index.js"));
  assert.equal(hash(readFileSync(path), "sha256", "hex"), meta.sha256);
  process.env.JEV_VERIFY_VERSION = "1.2.3";
  assert.throws(
    () => verificationPackage(() => {}, "/unused", "/unused"),
    /not both/,
  );
});

// Exercise the CLI's external boundary with real candidate bytes. The preload
// intercepts only registry/GitHub calls; no production test flags or exports.
function publicationFixture(t, failure = "") {
  const fixture = candidate(t);
  const { cwd, folder, meta, cli } = fixture;
  const publication = {
    ...meta,
    publishedAt: "2026-10-25T21:35:38.942Z",
    provenance:
      "https://registry.npmjs.org/-/npm/v1/attestations/jev-devtools@1.2.3",
  };
  writeFileSync(join(folder, "publication.json"), JSON.stringify(publication));
  const preload = join(cwd, "remote-fixture.mjs");
  const calls = join(cwd, "calls.jsonl");
  const body = join(cwd, "release-body.md");
  writeFileSync(
    preload,
    `
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const original=childProcess.execFileSync;
const failure=${JSON.stringify(failure)};
const body=${JSON.stringify(body)};
const release=()=>({id:123,tag_name:'v1.2.3',draft:false,prerelease:false,html_url:'https://github.com/diegoag64/jev-devtools/releases/tag/v1.2.3',body:readFileSync(body,'utf8')});
childProcess.execFileSync=(bin,args,options)=>{
 if(bin==='git'&&args[0]==='ls-remote') return failure==='existing-tag'?'existing-tag':'';
 if(bin!=='gh') return original(bin,args,options);
 appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
 if(args[0]==='release'&&(args[1]==='create'||args[1]==='edit')){
   if(args[1]==='edit'&&failure==='write-failure') throw new Error('GitHub notes update failed');
   const notes=readFileSync(args[args.indexOf('--notes-file')+1],'utf8');
   writeFileSync(body,args[1]==='edit'&&failure==='readback'?'old notes':notes);
   return '';
 }
 if(args[0]==='api'&&args[1].includes('/git/ref/tags/')) return JSON.stringify({object:{type:'commit',sha:failure==='tag-sha'?'f'.repeat(40):${JSON.stringify(meta.commit)}}});
 if(args[0]==='api'&&(args[1].endsWith('/releases/latest')||args[1].endsWith('/releases/123'))) return JSON.stringify(release());
 throw new Error('Unexpected GitHub operation: '+JSON.stringify(args));
};
syncBuiltinESMExports();
globalThis.fetch=async(url)=>{
 if(url!=='https://registry.npmjs.org/jev-devtools/latest') throw new Error('Unexpected network call: '+url);
 return {ok:true,status:200,json:async()=>({version:failure==='npm-latest'?'1.2.4':'1.2.3'})};
};
`,
  );
  return {
    ...fixture,
    publication,
    body,
    calls,
    run: () =>
      cli(
        "github-release",
        { GITHUB_REPOSITORY: "diegoag64/jev-devtools", GITHUB_RUN_ID: "456" },
        ["--import", preload],
      ),
  };
}

test("GitHub publication records observations in release notes without changing approved bytes", (t) => {
  const { folder, meta, run, body, calls } = publicationFixture(t);
  const notes = readFileSync(join(folder, "notes.md"));
  const archive = readFileSync(join(folder, meta.filename));
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const recorded = readFileSync(body, "utf8");
  assert.ok(recorded.startsWith(notes.toString().trimEnd()));
  assert.match(recorded, /## Publication verification/);
  assert.match(recorded, /2026-10-25T21:35:38.942Z/);
  assert.ok(
    recorded.includes(
      "https://github.com/diegoag64/jev-devtools/actions/runs/456",
    ),
  );
  assert.ok(
    recorded.includes(meta.commit) &&
      recorded.includes(meta.sha256) &&
      recorded.includes(meta.integrity),
  );
  assert.match(
    recorded,
    /Continue the matching docs deployment under the initial release request unless it excludes docs/,
  );
  assert.match(result.stdout, /Do not ask for another approval/);
  assert.match(result.stdout, /No receipt-only source PR is required/);
  assert.doesNotMatch(
    result.stdout,
    /update CHANGELOG.md and docs\/releases.md through a PR/,
  );
  assert.deepEqual(readFileSync(join(folder, "notes.md")), notes);
  assert.deepEqual(readFileSync(join(folder, meta.filename)), archive);
  const operations = readFileSync(calls, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.deepEqual(operations.at(-1), [
    "api",
    "repos/diegoag64/jev-devtools/releases/123",
  ]);
});

test("publication note failures stay partial instead of reporting success", async (t) => {
  for (const failure of ["write-failure", "readback"])
    await t.test(failure, (t) => {
      const { run } = publicationFixture(t, failure);
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        failure === "write-failure"
          ? /GitHub notes update failed/
          : /Release notes readback differs/,
      );
      assert.doesNotMatch(result.stdout, /## Package publication verified/);
    });
});

test("publication notes follow independent npm and exact-tag checks", async (t) => {
  for (const failure of ["npm-latest", "tag-sha", "existing-tag"])
    await t.test(failure, (t) => {
      const { run, calls } = publicationFixture(t, failure);
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        failure === "npm-latest"
          ? /npm latest advanced/
          : failure === "existing-tag"
            ? /Tag appeared after approval/
            : /AssertionError/,
      );
      const operations = existsSync(calls)
        ? readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse)
        : [];
      assert.ok(
        !operations.some((args) => args[0] === "release" && args[1] === "edit"),
      );
    });
});

test("publication facts must belong to the approved candidate", (t) => {
  const { folder, publication, run } = publicationFixture(t);
  writeFileSync(
    join(folder, "publication.json"),
    JSON.stringify({ ...publication, commit: "f".repeat(40) }),
  );
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Publication commit differs from approved artifact/,
  );
});

function environmentFixture(
  t,
  overrides = {},
  policies = [{ name: "main", type: "branch" }],
  customRules = [],
) {
  const cwd = mkdtempSync(join(tmpdir(), "jev-release-environment-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const environment = {
    name: "npm-release",
    can_admins_bypass: false,
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
    protection_rules: [{ type: "branch_policy" }],
    ...overrides,
  };
  const preload = join(cwd, "environment-fixture.mjs");
  const calls = join(cwd, "calls.jsonl");
  writeFileSync(
    preload,
    `
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
childProcess.execFileSync=(bin,args)=>{
 if(bin!=='gh'||args[0]!=='api'||args.length!==2) throw new Error('Only read-only GitHub API calls are allowed');
 appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
 if(args[1]==='repos/diegoag64/jev-devtools/environments/npm-release') return JSON.stringify(${JSON.stringify(environment)});
 if(args[1]==='repos/diegoag64/jev-devtools/environments/npm-release/deployment-branch-policies?per_page=100') return JSON.stringify(${JSON.stringify({ total_count: policies.length, branch_policies: policies })});
 if(args[1]==='repos/diegoag64/jev-devtools/environments/npm-release/deployment_protection_rules') return JSON.stringify(${JSON.stringify({ total_count: customRules.length, custom_deployment_protection_rules: customRules })});
 throw new Error('Unexpected GitHub endpoint: '+args[1]);
};
syncBuiltinESMExports();
`,
  );
  return {
    calls,
    run: () =>
      spawnSync(
        process.execPath,
        ["--import", preload, script, "check-environment"],
        { cwd, encoding: "utf8" },
      ),
  };
}

test("release environment accepts unattended main-only publishing using read-only API calls", (t) => {
  const { run, calls } = environmentFixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /no reviewers or delay, main branch only, administrator bypass disabled/,
  );
  assert.deepEqual(
    readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse),
    [
      ["api", "repos/diegoag64/jev-devtools/environments/npm-release"],
      [
        "api",
        "repos/diegoag64/jev-devtools/environments/npm-release/deployment-branch-policies?per_page=100",
      ],
      [
        "api",
        "repos/diegoag64/jev-devtools/environments/npm-release/deployment_protection_rules",
      ],
    ],
  );
});

test("release environment rejects human gates and broader publishing authority", async (t) => {
  for (const [name, overrides, policies, error, customRules] of [
    [
      "reviewer gate",
      {
        protection_rules: [
          {
            type: "required_reviewers",
            reviewers: [{ type: "User", reviewer: { login: "owner" } }],
          },
        ],
      },
      undefined,
      /requires reviewers/,
    ],
    [
      "wait timer",
      { protection_rules: [{ type: "wait_timer", wait_timer: 5 }] },
      undefined,
      /wait timer/,
    ],
    [
      "custom rule",
      { protection_rules: [{ type: "custom" }] },
      undefined,
      /Unexpected release protection rule/,
    ],
    [
      "administrator bypass",
      { can_admins_bypass: true },
      undefined,
      /disable administrator bypass/,
    ],
    [
      "unrestricted branches",
      { deployment_branch_policy: null },
      undefined,
      /selected main branch policy/,
    ],
    [
      "all protected branches",
      {
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false,
        },
      },
      undefined,
      /selected main branch policy/,
    ],
    [
      "extra branch",
      {},
      [
        { name: "main", type: "branch" },
        { name: "release/*", type: "branch" },
      ],
      /allow only main/,
    ],
    [
      "wildcard branch",
      {},
      [{ name: "*", type: "branch" }],
      /main branch only/,
    ],
    ["main tag", {}, [{ name: "main", type: "tag" }], /main branch only/],
    [
      "custom deployment app",
      {},
      undefined,
      /custom deployment protection rules/,
      [{ id: 3, enabled: true, app: { slug: "approval-app" } }],
    ],
  ])
    await t.test(name, (t) => {
      const { run } = environmentFixture(t, overrides, policies, customRules);
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
      assert.doesNotMatch(result.stdout, /npm-release verified/);
    });
});
