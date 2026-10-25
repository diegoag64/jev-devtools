import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertReceiptChange,
  checkReceiptScope,
  checkLocalLinks,
  assertDurableReceiptWording,
} from "./receipt-scope.mjs";

const changelog =
  "# Changelog\n\n## Unreleased\n\n### Changes\n\n#### Documentation\n\n- **0.5.2 publication records.** Receipt pending.\n\n## 0.5.2 — October 25, 2026 (experimental)\n\nPublished at noon.\n\n### Compatibility and upgrade\n\nKeep Node support.\n\n### Changes\n\n- **Fixed.** Preserve cameras.\n";
const releases =
  "# Releases\n\n## Release checklist\n\nApproval required.\n\n## Release 0.5.2 — published October 25, 2026\n\nPublished at noon.\n\n## Release 0.5.1 — published October 25, 2026\n\nEarlier.\n\n### Upgrade\n\nKeep this contract.\n";

test("receipt wording rejects self-expiring review claims and retains permanent references", () => {
  assertDurableReceiptWording(
    "Deployment receipt: [PR #99](https://github.com/example/repo/pull/99).",
  );
  for (const line of [
    "[receipt PR #99](url) needs review/merge",
    "[Receipt PR #76](url) still needs review/merge",
  ])
    assert.throws(
      () => assertDurableReceiptWording(line),
      /permanent receipt PR link/,
    );
});

test("receipt edits are allowed while release instructions, headings, compatibility and changes remain protected", () => {
  assertReceiptChange(
    "CHANGELOG.md",
    changelog,
    changelog
      .replace("Published at noon.", "Published at 12:01 UTC.")
      .replace("Receipt pending.", "Receipt: #99."),
  );
  assertReceiptChange(
    "docs/releases.md",
    releases,
    releases.replace(
      "Published at noon.",
      "Verified publication at 12:01 UTC.",
    ),
  );
  for (const [path, before, after] of [
    [
      "CHANGELOG.md",
      changelog,
      changelog.replace("Keep Node support.", "Drop Node support."),
    ],
    [
      "CHANGELOG.md",
      changelog,
      changelog.replace("Preserve cameras.", "Reset cameras."),
    ],
    ["CHANGELOG.md", changelog, changelog.replace("## 0.5.2", "## 0.5.3")],
    [
      "docs/releases.md",
      releases,
      releases.replace("Approval required.", "Publish automatically."),
    ],
    [
      "docs/releases.md",
      releases,
      releases.replace("Keep this contract.", "Change it."),
    ],
    ["README.md", "old", "new"],
  ])
    assert.throws(() => assertReceiptChange(path, before, after), /verify:all/);
});

test("deployment receipts allow existing history edits but protect publication policy and require full checks for new receipt sections", () => {
  const source =
    "# Publishing\n\nExplicit approval.\n\n| Published (UTC) | Source |\n| --- | --- |\n| noon | old |\n\nVersion 22 provenance:\n\nSource old.\n";
  assertReceiptChange(
    "docs/docs-publishing.md",
    source,
    source
      .replace("noon", "12:01 UTC")
      .replace("Source old.", "Source verified."),
  );
  assert.throws(
    () =>
      assertReceiptChange(
        "docs/docs-publishing.md",
        source,
        source.replace("Explicit approval.", "Automatic publication."),
      ),
    /verify:all/,
  );
  assert.throws(
    () =>
      assertReceiptChange(
        "docs/docs-publishing.md",
        source,
        source + "\nVersion 23 provenance:\n\nNew source.\n",
      ),
    /verify:all/,
  );
});

test("scope includes branch commits, staged/unstaged edits, deletions, mode changes and untracked files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "jev-receipt-scope-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = () => {
    git("add", ".");
    git(
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
  };
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  writeFileSync(join(root, "code.js"), "original");
  git("init", "-q");
  commit();
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  assert.throws(() => checkReceiptScope(root), /No receipt edits/);
  writeFileSync(
    join(root, "CHANGELOG.md"),
    changelog.replace("noon", "midnight"),
  );
  assert.deepEqual(checkReceiptScope(root).files, ["CHANGELOG.md"]);
  git("add", "CHANGELOG.md");
  assert.equal(checkReceiptScope(root).files.length, 1);
  commit();
  assert.equal(checkReceiptScope(root).files.length, 1);
  writeFileSync(join(root, "code.js"), "changed");
  assert.throws(() => checkReceiptScope(root), /code.js/);
  git("add", "code.js");
  writeFileSync(join(root, "code.js"), "original");
  assert.throws(
    () => checkReceiptScope(root),
    /code.js/,
    "A reversed working file must not hide a staged code change",
  );
  git("reset", "--quiet", "HEAD", "code.js");
  git("restore", "code.js");
  writeFileSync(
    join(root, "CHANGELOG.md"),
    changelog.replace("Keep Node support.", "Drop Node support."),
  );
  git("add", "CHANGELOG.md");
  writeFileSync(
    join(root, "CHANGELOG.md"),
    changelog.replace("noon", "midnight"),
  );
  assert.throws(
    () => checkReceiptScope(root),
    /outside existing receipt/,
    "A valid receipt edit must not hide staged compatibility changes",
  );
  git("reset", "--quiet", "HEAD", "CHANGELOG.md");
  writeFileSync(join(root, "new.js"), "new");
  assert.throws(() => checkReceiptScope(root), /new.js/);
  rmSync(join(root, "new.js"));
  git("update-index", "--chmod=+x", "CHANGELOG.md");
  assert.throws(() => checkReceiptScope(root), /file mode|mode changes/);
  git("reset", "--quiet", "HEAD", "CHANGELOG.md");
  rmSync(join(root, "CHANGELOG.md"));
  assert.throws(() => checkReceiptScope(root));
});

test("receipt links reject missing local targets and anchors", (t) => {
  const root = mkdtempSync(join(tmpdir(), "jev-receipt-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "target.md"),
    "# Heading\n\n## Release 0.5.2 — published\n",
  );
  checkLocalLinks(
    root,
    "CHANGELOG.md",
    "[ok](target.md#release-052--published)",
  );
  assert.throws(
    () => checkLocalLinks(root, "CHANGELOG.md", "[bad](missing.md)"),
    /missing link target/,
  );
  assert.throws(
    () => checkLocalLinks(root, "CHANGELOG.md", "[bad](target.md#wrong)"),
    /missing anchor/,
  );
});
