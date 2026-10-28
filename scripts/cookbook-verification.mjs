import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import {
  snapshotSource,
  assertSameSource,
  createEvidenceDirectory,
  saveReport,
} from "./verification-evidence.mjs";

export async function discoverBrowserChecks(root) {
  const checks = [
    { name: "captures", script: "scripts/verify-cookbook-captures.mjs" },
    { name: "collection", script: "scripts/verify-cookbook-collection.mjs" },
  ];
  for (const entry of await readdir(join(root, "cookbooks"), {
    withFileTypes: true,
  })) {
    const script = `cookbooks/${entry.name}/verify-browser.mjs`;
    if (
      entry.isDirectory() &&
      (await stat(join(root, script)).then(
        (s) => s.isFile(),
        (e) => {
          if (e.code === "ENOENT") return false;
          throw e;
        },
      ))
    )
      checks.push({ name: entry.name, script });
  }
  for (const file of await readdir(join(root, "apps/playground/tests")))
    if (file.endsWith(".browser.mjs"))
      checks.push({
        name: file.slice(0, -".browser.mjs".length),
        script: `apps/playground/tests/${file}`,
      });
  if (new Set(checks.map((c) => c.name)).size !== checks.length)
    throw new Error("Duplicate cookbook browser check names");
  return checks.sort((a, b) => a.name.localeCompare(b.name));
}

export async function acquireBrowserLock(path, owner) {
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(join(path, "owner.json"), "utf8").catch(
      () => "owner initializing",
    );
    throw new Error(
      `Cookbook browser lock occupied: ${existing}. Retry when its owner finishes; do not remove an active lock.`,
    );
  }
  try {
    await writeFile(join(path, "owner.json"), JSON.stringify(owner));
  } catch (error) {
    await rm(path, { recursive: true });
    throw error;
  }
  return () => rm(path, { recursive: true });
}

async function requireFreePort() {
  const server = createServer();
  server.listen(4182, "127.0.0.1");
  await once(server, "listening");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

export async function runLoggedProcess(
  command,
  args,
  { cwd, env, logPath, signal, timeoutMs = 300_000 },
) {
  signal?.throwIfAborted();
  const log = createWriteStream(logPath);
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let reason, forceTimer;
  const kill = (signal) => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stop = (message) => {
    reason ??= message;
    kill("SIGTERM");
    forceTimer ??= setTimeout(() => kill("SIGKILL"), 2000);
  };
  const abort = () => stop("Browser verification interrupted");
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(
    () => stop("Browser verification timed out"),
    timeoutMs,
  );
  let tail = "";
  const remember = (chunk) => {
    tail = (tail + chunk.toString()).slice(-8192);
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  try {
    const [code, exitSignal] = await once(child, "close");
    if (reason || code !== 0) {
      if (tail)
        console.error(
          `Browser failure output (last 8192 characters):\n${tail}`,
        );
      throw new Error(
        `${reason ?? `Browser check failed (${exitSignal ?? code})`}; see ${logPath}`,
      );
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(forceTimer);
    signal?.removeEventListener("abort", abort);
    // Remove any surviving descendants of this owned process group, including
    // Vite servers, before releasing the lock or starting another check.
    kill("SIGKILL");
    const closed = once(log, "close");
    log.end();
    await closed;
  }
}

export async function runBrowserSuite(
  root,
  {
    only,
    signal,
    checks,
    lockPath = join(tmpdir(), "jev-cookbook-browser.lock"),
    checkPort = true,
    timeoutMs,
  } = {},
) {
  checks ??= await discoverBrowserChecks(root);
  if (only) {
    checks = checks.filter((check) => check.name === only);
    if (!checks.length)
      throw new Error(`Unknown cookbook browser check: ${only}`);
  }
  const output = await createEvidenceDirectory(root, "cookbook-browser");
  const initial = await snapshotSource(root);
  const report = {
    mode: only ? "cookbook-browser-selected" : "cookbook-browser",
    ...initial,
    status: "running",
    startedAt: new Date().toISOString(),
    node: process.version,
    checks: checks.map((c) => c.name),
    steps: [],
  };
  const path = join(output, "summary.json");
  const save = () => saveReport(path, report);
  await save();
  console.log(`Cookbook browser evidence: ${output}`);
  let release;
  try {
    signal?.throwIfAborted();
    release = await acquireBrowserLock(lockPath, {
      pid: process.pid,
      root,
      output,
      startedAt: report.startedAt,
    });
    if (checkPort) await requireFreePort();
    for (const check of checks) {
      signal?.throwIfAborted();
      const directory = join(output, check.name);
      await mkdir(directory);
      const step = {
        name: check.name,
        script: check.script,
        evidence: relative(output, directory),
        ...(await snapshotSource(root)),
        status: "running",
        startedAt: new Date().toISOString(),
      };
      report.steps.push(step);
      await save();
      try {
        assertSameSource(initial, step);
        console.log(`Running cookbook browser: ${check.name}`);
        const guard = pathToFileURL(
          join(root, "scripts/cookbook-sample-only.mjs"),
        ).href;
        await runLoggedProcess(process.execPath, [check.script], {
          cwd: root,
          logPath: join(directory, "runner.log"),
          signal,
          timeoutMs,
          env: {
            ...process.env,
            TYPESAFE_API_KEY: "",
            JEV_COOKBOOK_OUTPUT: directory,
            NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${guard}`,
          },
        });
        const violations = await readFile(
          join(directory, "external-fetch.log"),
          "utf8",
        ).catch((e) => {
          if (e.code === "ENOENT") return "";
          throw e;
        });
        if (violations)
          throw new Error(`Unexpected external fetch: ${violations}`);
        const final = await snapshotSource(root);
        step.finalRevision = final.revision;
        step.finalSourceHash = final.sourceHash;
        assertSameSource(step, final);
        step.status = "passed";
      } catch (error) {
        step.status = "failed";
        step.error = error.message;
        throw error;
      } finally {
        step.finishedAt = new Date().toISOString();
        await saveReport(join(directory, "verification.json"), step);
        await save();
      }
    }
    const final = await snapshotSource(root);
    report.finalRevision = final.revision;
    report.finalSourceHash = final.sourceHash;
    assertSameSource(initial, final);
    signal?.throwIfAborted();
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    try {
      await release?.();
    } catch (error) {
      report.status = "failed";
      report.error = error.message;
      throw error;
    } finally {
      report.finishedAt = new Date().toISOString();
      await save();
      console.log(`Cookbook browsers ${report.status}: ${path}`);
    }
  }
  return { output, report };
}
