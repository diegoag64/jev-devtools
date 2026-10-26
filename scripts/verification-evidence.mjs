import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readlink,
  mkdir,
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export async function snapshotSource(root) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const files = new Set(
    git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      .split("\0")
      .filter(Boolean),
  );
  const hash = createHash("sha256");
  for (const path of [...files].sort()) {
    hash.update(path + "\0");
    try {
      const absolute = join(root, path);
      const info = await lstat(absolute);
      hash.update(String(info.mode) + "\0");
      hash.update(
        info.isSymbolicLink()
          ? await readlink(absolute)
          : await readFile(absolute),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
    hash.update("\0");
  }
  return {
    revision: git("rev-parse", "HEAD").trim(),
    sourceHash: hash.digest("hex"),
  };
}

export function assertSameSource(before, after) {
  if (
    before.revision !== after.revision ||
    before.sourceHash !== after.sourceHash
  )
    throw new Error(
      "Source revision or contents changed; rerun verification with the checkout unchanged.",
    );
}

export async function createEvidenceDirectory(root, category) {
  const parent = join(root, "benchmarks/results", category);
  await mkdir(parent, { recursive: true });
  return mkdtemp(
    join(parent, new Date().toISOString().replaceAll(":", "-") + "-"),
  );
}

export const saveReport = (path, report) =>
  writeFile(path, JSON.stringify(report, null, 2) + "\n");

// A current source fingerprint alone is insufficient: incomplete/failed/partial
// runs and reports from another reviewed commit cannot establish a full pass.
export function assertFreshReport(
  report,
  current,
  { mode = "full", reviewedHead } = {},
) {
  if (report.status !== "passed" || !report.finishedAt)
    throw new Error("Evidence is failed or incomplete.");
  if (report.mode !== mode)
    throw new Error(`Expected ${mode} evidence, received ${report.mode}.`);
  if (!/^[a-f0-9]{64}$/.test(report.sourceHash ?? "") || !report.revision)
    throw new Error("Evidence has no valid source fingerprint.");
  if (
    !report.steps?.length ||
    report.steps.some((step) => step.status !== "passed")
  )
    throw new Error("Evidence contains missing or unfinished steps.");
  assertSameSource(report, {
    revision: report.finalRevision,
    sourceHash: report.finalSourceHash,
  });
  assertSameSource(report, current);
  if (reviewedHead && reviewedHead !== current.revision)
    throw new Error("Reviewed HEAD does not match the current checkout.");
}
