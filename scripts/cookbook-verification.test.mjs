import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireBrowserLock,
  discoverBrowserChecks,
  runBrowserSuite,
  runLoggedProcess,
} from "./cookbook-verification.mjs";

test("discovery includes new cookbook and playground browser entry points and rejects duplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-discovery-"));
  try {
    await mkdir(join(root, "cookbooks/new-recipe"), { recursive: true });
    await mkdir(join(root, "apps/playground/tests"), { recursive: true });
    await writeFile(join(root, "cookbooks/new-recipe/verify-browser.mjs"), "");
    await writeFile(
      join(root, "apps/playground/tests/existing.browser.mjs"),
      "",
    );
    assert.deepEqual(
      (await discoverBrowserChecks(root)).map((c) => c.name),
      ["captures", "collection", "existing", "new-recipe"],
    );
    await writeFile(
      join(root, "apps/playground/tests/new-recipe.browser.mjs"),
      "",
    );
    await assert.rejects(discoverBrowserChecks(root), /Duplicate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lock contention never removes another owner's lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-lock-test-")),
    path = join(root, "lock");
  try {
    const release = await acquireBrowserLock(path, { pid: 123 });
    await assert.rejects(acquireBrowserLock(path, { pid: 456 }), /occupied/);
    assert.equal(JSON.parse(await readFile(join(path, "owner.json"))).pid, 123);
    await release();
    const second = await acquireBrowserLock(path, { pid: 456 });
    await second();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("suite records fresh pass, source changes and process failure separately and releases lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-suite-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    await mkdir(join(root, "scripts"));
    await writeFile(join(root, ".gitignore"), "benchmarks/results/\n");
    await copyFile(
      new URL("./cookbook-sample-only.mjs", import.meta.url),
      join(root, "scripts/cookbook-sample-only.mjs"),
    );
    await writeFile(join(root, "pass.mjs"), "console.log('pass');");
    await writeFile(join(root, "fail.mjs"), "process.exit(7);");
    await writeFile(
      join(root, "edit.mjs"),
      "import { writeFileSync } from 'node:fs'; writeFileSync('changed.txt','changed');",
    );
    await writeFile(
      join(root, "network.mjs"),
      "try { await fetch('https://example.invalid'); } catch {};",
    );
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("add", ".");
    git("commit", "-m", "fixture");
    const options = {
      checkPort: false,
      lockPath: join(root, "benchmarks/results/test.lock"),
    };
    const passed = await runBrowserSuite(root, {
      ...options,
      checks: [{ name: "pass", script: "pass.mjs" }],
    });
    assert.equal(passed.report.status, "passed");
    assert.equal(passed.report.sourceHash, passed.report.finalSourceHash);
    for (const [name, pattern] of [
      ["fail", /failed/],
      ["edit", /changed/],
      ["network", /external fetch/],
    ]) {
      await assert.rejects(
        runBrowserSuite(root, {
          ...options,
          checks: [{ name, script: name + ".mjs" }],
        }),
        pattern,
      );
      await assert.rejects(readFile(join(options.lockPath, "owner.json")), {
        code: "ENOENT",
      });
    }
    const directories = await readdir(
      join(root, "benchmarks/results/cookbook-browser"),
    );
    const reports = await Promise.all(
      directories.map((d) =>
        readFile(
          join(root, "benchmarks/results/cookbook-browser", d, "summary.json"),
          "utf8",
        ).then(JSON.parse),
      ),
    );
    assert.equal(reports.filter((r) => r.status === "passed").length, 1);
    assert.equal(reports.filter((r) => r.status === "failed").length, 3);
    for (const report of reports) assert.ok(report.finishedAt);
    assert.equal(
      JSON.parse(await readFile(join(passed.output, "summary.json"))).status,
      "passed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hung and interrupted browser children fail with logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-process-test-"));
  try {
    const options = {
      cwd: root,
      env: process.env,
      logPath: join(root, "timeout.log"),
      timeoutMs: 100,
    };
    await assert.rejects(
      runLoggedProcess(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        options,
      ),
      /timed out/,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    await assert.rejects(
      runLoggedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        ...options,
        timeoutMs: 5000,
        signal: controller.signal,
      }),
      /interrupted/,
    );
    clearTimeout(timer);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
