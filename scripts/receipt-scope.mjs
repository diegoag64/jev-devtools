import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const files = new Set([
  "CHANGELOG.md",
  "docs/releases.md",
  "docs/docs-publishing.md",
]);

// Preserve headings, compatibility/change lists, and workflow instructions.
// Only existing publication prose and the deployment-history table may vary.
export function receiptSkeleton(path, source) {
  if (path === "CHANGELOG.md") {
    return source
      .replace(
        /(^## \d+\.\d+\.\d+ — (?!Pending publication)[^\n]+\n)([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm,
        "$1<publication>\n",
      )
      .replace(
        /^- \*\*\d+\.\d+\.\d+ publication records\.\*\*[^\n]*$/gm,
        "<publication-record-entry>",
      );
  }
  if (path === "docs/releases.md") {
    return source.replace(
      /(^## Release \d+\.\d+\.\d+ — published[^\n]+\n)([\s\S]*?)(?=^## |^### |$(?![\s\S]))/gm,
      "$1<publication>\n",
    );
  }
  if (path === "docs/docs-publishing.md") {
    return source
      .replace(
        /(^\| Published \(UTC\)[^\n]*\n\|[- |]+\n)(?:\|[^\n]*\n)+/m,
        "$1<deployments>\n",
      )
      .replace(
        /(^Version \d+ provenance:\n)([\s\S]*?)(?=^Version \d+ provenance:|^## |$(?![\s\S]))/gm,
        "$1<deployment>\n",
      );
  }
  throw new Error(`Not a receipt file: ${path}`);
}

export function assertReceiptChange(path, before, after) {
  assert.ok(files.has(path), `${path}: use npm run verify:all`);
  assert.notEqual(before, after, `${path}: no receipt change`);
  assert.equal(
    receiptSkeleton(path, after),
    receiptSkeleton(path, before),
    `${path}: edits outside existing receipt sections require verify:all`,
  );
}

export function checkReceiptScope(root) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const base = git("merge-base", "HEAD", "origin/main").trim();
  const paths = [
    ...new Set(
      [
        ...git("diff", "--name-only", "--no-renames", "-z", base).split("\0"),
        ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
      ].filter(Boolean),
    ),
  ];
  assert.ok(
    paths.length,
    "No receipt edits found; use verify:all for publication source verification",
  );
  for (const path of paths) {
    assert.ok(files.has(path), `${path}: use npm run verify:all`);
    assert.ok(
      lstatSync(resolve(root, path)).isFile(),
      `${path}: receipt must be a regular file`,
    );
    const mode = git("ls-files", "--stage", "--", path).split(" ")[0];
    assert.equal(mode, "100644", `${path}: unexpected file mode`);
    assert.equal(
      git("diff", "--summary", base, "--", path).trim(),
      "",
      `${path}: file additions, deletions, renames or mode changes require verify:all`,
    );
    const before = git("show", `${base}:${path}`);
    const after = readFileSync(resolve(root, path), "utf8");
    assertReceiptChange(path, before, after);
    checkLocalLinks(root, path, after);
  }
  return { base, files: paths };
}

export function checkLocalLinks(root, path, source) {
  for (const [, href] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue;
    const [file, anchor] = href.split("#");
    const target = resolve(root, dirname(path), decodeURIComponent(file));
    assert.ok(existsSync(target), `${path}: missing link target ${href}`);
    if (!anchor || !target.endsWith(".md")) continue;
    const text = readFileSync(target, "utf8");
    const slugs = [...text.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
      heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\- ]/gu, "")
        .replace(/ /g, "-"),
    );
    assert.ok(
      slugs.includes(decodeURIComponent(anchor)) ||
        text.includes(`id="${anchor}"`),
      `${path}: missing anchor ${href}`,
    );
  }
}

export function assertDurableReceiptWording(source) {
  for (const line of source.split("\n")) {
    assert.ok(
      !/\[[^\]]*receipt[^\]]*\]\([^)]*\)\s+(?:still\s+)?(?:needs?|awaits?|is awaiting)\s+(?:review|merge)/i.test(
        line,
      ),
      "Use a permanent receipt PR link; report its live review/merge state separately",
    );
  }
}

export function checkReceiptRecords(root) {
  for (const path of files) {
    const source = readFileSync(resolve(root, path), "utf8");
    assertDurableReceiptWording(source);
    checkLocalLinks(root, path, source);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  checkReceiptRecords(fileURLToPath(new URL("../", import.meta.url)));
  console.log("Release record wording and local links verified.");
}
