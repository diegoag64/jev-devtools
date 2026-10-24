import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";

// Release verification must exercise the inspected archive, then the registry
// version, rather than silently rebuilding a different package for each check.
export function verificationPackage(npm, root, temp) {
  const archive = process.env.JEV_VERIFY_TARBALL;
  const version = process.env.JEV_VERIFY_VERSION;
  assert.ok(!(archive && version), "Choose a tarball or registry version, not both");
  if (archive) {
    const tarball = resolve(archive);
    const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
      .trim().split("\n").filter((path) => !path.endsWith("/"))
      .map((path) => {
        assert.ok(path.startsWith("package/"), `Unexpected archive path: ${path}`);
        return { path: path.slice("package/".length) };
      });
    return { tarball, files, dependency: `file:${tarball}` };
  }
  if (version) assert.match(version, /^\d+\.\d+\.\d+$/, "Use an exact registry version");
  const [packed] = JSON.parse(npm([
    "pack", ...(version ? [`jev-devtools@${version}`, "--ignore-scripts"] : []),
    "--json", "--pack-destination", temp,
  ], { cwd: join(root, "packages/jev-devtools"), encoding: "utf8" }));
  const tarball = join(temp, packed.filename);
  return { tarball, files: packed.files, dependency: version || `file:${tarball}` };
}
