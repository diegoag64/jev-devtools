import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("./", import.meta.url));
async function run(t, script, args = [], onReady, ipc = false) {
  const root = await mkdtemp(join(tmpdir(), "jev-lifetime-test-"));
  t.after(async () => {
    for (const name of await readdir(root))
      await chmod(join(root, name), 0o700);
    await rm(root, { recursive: true, force: true });
  });
  const child = spawn(process.execPath, [join(scripts, script), ...args], {
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      TMPDIR: root,
      TMP: root,
      TEMP: root,
      JEV_VERIFY_TARBALL: join(root, "missing.tgz"),
      JEV_VERIFY_VERSION: "",
    },
    stdio: ["ignore", "pipe", "pipe", ...(ipc ? ["ipc"] : [])],
  });
  let output = "",
    ready = false;
  const collect = (data) => {
    output += data;
    if (!ready && output.includes("WORKER_READY")) {
      ready = true;
      onReady?.(child);
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // A broken supervisor must not make this regression itself leak workers.
      const worker = output.match(/Temporary verification worker: (\d+)/)?.[1];
      if (worker) {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/pid", worker, "/T", "/F"]);
        else {
          try {
            process.kill(-Number(worker), "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
      }
      child.kill("SIGKILL");
      reject(new Error(`Fixture timed out: ${output}`));
    }, 20_000);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  return { root, output, code };
}

for (const [mode, expected] of [
  ["success", 0],
  ["setup-failure", 1],
  ["test-failure", 1],
  ["abrupt-exit", 7],
]) {
  test(
    `temporary project removes its tree after ${mode}`,
    { skip: mode === "abrupt-exit" && process.platform === "win32" },
    async (t) => {
      const result = await run(t, "fixtures/temporary-project.mjs", [mode]);
      assert.equal(result.code, expected, result.output);
      assert.match(result.output, /Removed temporary verification project:/);
      assert.deepEqual(await readdir(result.root), []);
      if (mode !== "setup-failure" && process.platform !== "win32")
        assert.match(result.output, /CHILD_STOP_EXISTS true/);
      if (mode.endsWith("failure"))
        assert.match(result.output, /original .* failure/);
      for (const [, pid] of result.output.matchAll(
        /(?:CHILD|WORKER)_READY (\d+)/g,
      )) {
        assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
      }
    },
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  for (const group of [false, true]) {
    test(
      `temporary project handles ${signal} sent to ${group ? "suite process group" : "standalone supervisor"}`,
      { skip: process.platform === "win32" },
      async (t) => {
        const result = await run(
          t,
          "fixtures/temporary-project.mjs",
          ["interrupt"],
          (child) => process.kill(group ? -child.pid : child.pid, signal),
        );
        assert.equal(
          result.code,
          signal === "SIGINT" ? 130 : 143,
          result.output,
        );
        assert.deepEqual(await readdir(result.root), []);
        assert.match(result.output, /CHILD_STOP_EXISTS true/);
        for (const [, pid] of result.output.matchAll(
          /(?:CHILD|WORKER)_READY (\d+)/g,
        )) {
          assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
        }
      },
    );
  }
}

test(
  "cleanup failure reports the retained path without hiding the verification error",
  { skip: process.platform === "win32" || process.getuid?.() === 0 },
  async (t) => {
    const result = await run(t, "fixtures/temporary-project.mjs", [
      "cleanup-failure",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.output, /original verification failure/);
    assert.match(
      result.output,
      /Temporary project cleanup failed \(.*jev-fixture-test-/,
    );
    assert.equal((await readdir(result.root)).length, 1);
  },
);

for (const script of ["verify-package.mjs", "verify-nextjs.mjs"]) {
  test(`actual ${script} removes its fixture when archive setup fails`, async (t) => {
    const result = await run(t, script);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /missing.tgz/);
    assert.deepEqual(await readdir(result.root), []);
  });
}

test(
  "cleanup failure turns successful verification into failure",
  { skip: process.platform === "win32" || process.getuid?.() === 0 },
  async (t) => {
    const result = await run(t, "fixtures/temporary-project.mjs", [
      "cleanup-success",
    ]);
    assert.equal(result.code, 1);
    assert.match(result.output, /Temporary project cleanup failed/);
    assert.equal((await readdir(result.root)).length, 1);
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`temporary project handles suite IPC ${signal}`, async (t) => {
    const result = await run(
      t,
      "fixtures/temporary-project.mjs",
      ["interrupt"],
      (child) => child.send({ interrupt: signal }),
      true,
    );
    assert.equal(result.code, signal === "SIGINT" ? 130 : 143, result.output);
    assert.deepEqual(await readdir(result.root), []);
    for (const [, pid] of result.output.matchAll(
      /(?:CHILD|WORKER)_READY (\d+)/g,
    )) {
      assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
    }
  });
}
