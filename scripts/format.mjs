import { execFileSync } from "node:child_process";
import { readFile, writeFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import * as prettier from "prettier";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const write = process.argv.includes("--write");
const baseIndex = process.argv.indexOf("--base");
const base = baseIndex < 0 ? "origin/main" : process.argv[baseIndex + 1];
if (!base || base.startsWith("-"))
  throw new Error("--base requires a Git revision");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const ancestor = git("merge-base", "HEAD", base).trim();
const paths = new Set(
  [
    ...git("diff", "--name-only", "--diff-filter=ACMR", "-z", ancestor).split(
      "\0",
    ),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ].filter(Boolean),
);
let checked = 0;
let failures = 0;
for (const path of [...paths].sort()) {
  const info = await prettier.getFileInfo(path, {
    ignorePath: ".prettierignore",
  });
  if (info.ignored || !info.inferredParser || !(await lstat(path)).isFile())
    continue;
  const source = await readFile(path, "utf8");
  const options = {
    ...(await prettier.resolveConfig(path)),
    filepath: resolve(path),
  };
  checked++;
  if (await prettier.check(source, options)) continue;
  if (write) {
    await writeFile(path, await prettier.format(source, options));
    console.log(`Formatted ${path}`);
  } else {
    console.error(`Needs formatting: ${path}`);
    failures++;
  }
}
console.log(`Prettier: ${checked} changed files checked against ${base}.`);
if (failures) process.exitCode = 1;
