import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { npm, npmCommand, runtimeEnv } from "./runtime.mjs";
import {
  snapshotSource,
  assertSameSource,
  createEvidenceDirectory,
} from "./verification-evidence.mjs";
import { checkReceiptScope } from "./receipt-scope.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--receipts"))
  throw new Error("Usage: verify-all.mjs [--receipts]");
const receipts = args.includes("--receipts");
// Gate before any build/test. Include committed, staged, unstaged and untracked
// changes since the merge base, so a clean index cannot hide broader work.
const scope = receipts ? checkReceiptScope(root) : undefined;
const output = await createEvidenceDirectory(root, "verification");
const initialSource = await snapshotSource(root);
const report = {
  mode: receipts ? "receipts" : "full",
  ...(scope ? { scope } : {}),
  ...initialSource,
  node: { version: process.versions.node, executable: process.execPath },
  npm: npm(["--version"], { encoding: "utf8" }).trim(),
  typescript: JSON.parse(
    await readFile("node_modules/typescript/package.json", "utf8"),
  ).version,
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
};
const save = () =>
  writeFile(
    join(output, "summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
await save();
console.log(`Verification evidence: ${output}`);
let interrupted;
let activeChild;
let killTimer;
function signalChild(signal) {
  if (!activeChild?.pid) return;
  try {
    // npm launches nested servers; terminate the whole step's process group.
    if (process.platform === "win32") activeChild.kill(signal);
    else process.kill(-activeChild.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = signal;
    signalChild(signal);
    killTimer = setTimeout(() => signalChild("SIGKILL"), 5000);
    killTimer.unref();
  });
}
async function run(name, command, args, env = process.env) {
  if (interrupted)
    throw new Error(`Verification interrupted by ${interrupted}`);
  const step = {
    name,
    command: [command, ...args],
    log: `${name}.log`,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  report.steps.push(step);
  await save();
  console.log(`Running ${name}…`);
  const log = createWriteStream(join(output, step.log));
  try {
    const child = spawn(command, args, {
      cwd: root,
      env: runtimeEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    activeChild = child;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const [code, signal] = await once(child, "close");
    step.exitCode = code;
    step.signal = signal;
    if (code !== 0 || interrupted)
      throw new Error(
        `${name} failed (${signal ?? code}); see ${join(output, step.log)}`,
      );
    step.status = "passed";
  } catch (error) {
    step.status = "failed";
    throw error;
  } finally {
    clearTimeout(killTimer);
    activeChild = undefined;
    const closed = once(log, "close");
    log.end();
    await closed;
    step.finishedAt = new Date().toISOString();
    await save();
  }
  console.log(`Passed ${name}`);
}
const runNpm = (name, args, env) => run(name, ...npmCommand(args), env);
try {
  // Full verification builds and packs this checkout. Release overrides belong to
  // the standalone consumer commands, not this source verification report.
  const env = { ...process.env };
  delete env.JEV_VERIFY_TARBALL;
  delete env.JEV_VERIFY_VERSION;
  if (receipts) {
    for (const name of [
      "format:check",
      "check:release-records",
      "test:release-tools",
      "build:package",
    ]) {
      await runNpm(name.replaceAll(":", "-"), ["run", name], env);
    }
    await runNpm(
      "docs-check",
      ["run", "check", "-w", "@jev-devtools/docs"],
      env,
    );
    await runNpm("docs-test", ["run", "test", "-w", "@jev-devtools/docs"], env);
    await runNpm("verify-docs", ["run", "verify:docs"], env);
  } else {
    for (const name of [
      "format:check",
      "check",
      "test",
      "build",
      "check:playground",
    ]) {
      await runNpm(name.replaceAll(":", "-"), ["run", name], env);
    }
    await runNpm(
      "pack",
      ["pack", "-w", "jev-devtools", "--pack-destination", output],
      env,
    );
    const archives = (await readdir(output)).filter((name) =>
      name.endsWith(".tgz"),
    );
    if (archives.length !== 1)
      throw new Error("Expected exactly one packed archive");
    const tarball = join(output, archives[0]);
    report.archive = {
      path: tarball,
      sha256: createHash("sha256")
        .update(await readFile(tarball))
        .digest("hex"),
    };
    await save();
    for (const name of [
      "verify:package",
      "verify:nextjs",
      "verify:drawer",
      "verify:flows",
      "verify:cookbooks",
      "verify:docs",
    ]) {
      await runNpm(name.replaceAll(":", "-"), ["run", name], {
        ...env,
        JEV_VERIFY_TARBALL: tarball,
      });
    }
  }
  await run("diff-check", "git", ["diff", "--check"]);
  const finalSource = await snapshotSource(root);
  report.finalSourceHash = finalSource.sourceHash;
  report.finalRevision = finalSource.revision;
  assertSameSource(initialSource, finalSource);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`Verification ${report.status}: ${join(output, "summary.json")}`);
}
