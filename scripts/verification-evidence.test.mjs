import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  snapshotSource,
  assertSameSource,
  assertFreshReport,
  createEvidenceDirectory,
} from "./verification-evidence.mjs";

test("fingerprints detect edits, untracked additions, deletions and commit changes but exclude ignored evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-evidence-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    await writeFile(join(root, ".gitignore"), "benchmarks/results/\n");
    await writeFile(join(root, "source.txt"), "original");
    git("add", ".");
    git("commit", "-m", "fixture");
    const original = await snapshotSource(root);
    const a = await createEvidenceDirectory(root, "browser"),
      b = await createEvidenceDirectory(root, "browser");
    assert.notEqual(a, b);
    await writeFile(join(a, "summary.json"), "{}");
    assert.deepEqual(await snapshotSource(root), original);
    await writeFile(join(root, "source.txt"), "edited");
    assert.throws(
      () => assertSameSource(original, { ...original, sourceHash: "other" }),
      /changed/,
    );
    assert.notEqual(
      (await snapshotSource(root)).sourceHash,
      original.sourceHash,
    );
    await writeFile(join(root, "source.txt"), "original");
    await writeFile(join(root, "new.txt"), "untracked");
    assert.notEqual(
      (await snapshotSource(root)).sourceHash,
      original.sourceHash,
    );
    await rm(join(root, "new.txt"));
    await rm(join(root, "source.txt"));
    assert.notEqual(
      (await snapshotSource(root)).sourceHash,
      original.sourceHash,
    );
    await writeFile(join(root, "source.txt"), "original");
    if (process.platform !== "win32") {
      await chmod(join(root, "source.txt"), 0o755);
      assert.notEqual(
        (await snapshotSource(root)).sourceHash,
        original.sourceHash,
      );
      await chmod(join(root, "source.txt"), 0o644);
      await symlink("source.txt", join(root, "link"));
      const link = await snapshotSource(root);
      await rm(join(root, "link"));
      await symlink("missing", join(root, "link"));
      assert.notEqual((await snapshotSource(root)).sourceHash, link.sourceHash);
      await rm(join(root, "link"));
    }
    git("commit", "--allow-empty", "-m", "new revision");
    const next = await snapshotSource(root);
    assert.equal(next.sourceHash, original.sourceHash);
    assert.throws(() => assertSameSource(original, next), /changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("handoff rejects failed, running, partial, stale-source and differently reviewed evidence", () => {
  const current = { revision: "a".repeat(40), sourceHash: "b".repeat(64) };
  const report = {
    ...current,
    finalRevision: current.revision,
    finalSourceHash: current.sourceHash,
    mode: "full",
    status: "passed",
    finishedAt: "2026-10-26",
    steps: [{ status: "passed" }],
  };
  assert.doesNotThrow(() =>
    assertFreshReport(report, current, { reviewedHead: current.revision }),
  );
  for (const changed of [
    { status: "failed" },
    { status: "running" },
    { finishedAt: null },
    { mode: "receipts" },
    { steps: [] },
    { steps: [{ status: "running" }] },
    { finalSourceHash: "c".repeat(64) },
    { finalRevision: "d".repeat(40) },
    { sourceHash: null },
  ])
    assert.throws(() => assertFreshReport({ ...report, ...changed }, current));
  assert.throws(
    () => assertFreshReport(report, { ...current, sourceHash: "c".repeat(64) }),
    /changed/,
  );
  assert.throws(
    () => assertFreshReport(report, current, { reviewedHead: "d".repeat(40) }),
    /Reviewed HEAD/,
  );
  assert.throws(
    () =>
      assertFreshReport(
        { ...report, mode: "cookbook-browser-selected" },
        current,
        { mode: "cookbook-browser" },
      ),
    /Expected/,
  );
});
