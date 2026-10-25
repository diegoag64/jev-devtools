import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSupportedNode, npm } from "./runtime.mjs";

test("runtime preflight rejects unsupported Node before verification", () => {
  for (const version of ["20.8.0", "22.11.0"])
    assert.throws(() => assertSupportedNode(version), /unsupported/);
  for (const version of ["22.12.0", "24.21.0", "26.7.0"])
    assert.doesNotThrow(() => assertSupportedNode(version));
});

test(
  "isolated npm scripts retain the selected Node despite a conflicting PATH",
  { skip: process.platform === "win32" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-runtime-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "node"), "#!/bin/sh\nexit 71\n", { mode: 0o755 });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ scripts: { probe: 'node -p "process.execPath"' } }),
      );
      const result = npm(["run", "--silent", "probe"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
      assert.equal(result.trim(), process.execPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
