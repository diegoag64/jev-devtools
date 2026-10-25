import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  readlink,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { npm, npmCommand, runtimeEnv } from "./runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
async function sourceHash() {
  const files = new Set(
    git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      .split("\0")
      .filter(Boolean),
  );
  const hash = createHash("sha256");
  for (const path of [...files].sort()) {
    hash.update(path + "\0");
    try {
      const info = await lstat(path);
      hash.update(String(info.mode) + "\0");
      hash.update(
        info.isSymbolicLink() ? await readlink(path) : await readFile(path),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}
const output = join(
  root,
  "benchmarks/results/verification",
  `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`,
);
await mkdir(output, { recursive: true });
const report = {
  revision: git("rev-parse", "HEAD").trim(),
  sourceHash: await sourceHash(),
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
  // Always build and pack this checkout. Release-specific overrides belong to
  // the standalone consumer commands, not this source verification report.
  const env = { ...process.env };
  delete env.JEV_VERIFY_TARBALL;
  delete env.JEV_VERIFY_VERSION;
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
    "verify:docs",
  ]) {
    await runNpm(name.replaceAll(":", "-"), ["run", name], {
      ...env,
      JEV_VERIFY_TARBALL: tarball,
    });
  }
  await run("diff-check", "git", ["diff", "--check"]);
  report.finalSourceHash = await sourceHash();
  if (
    report.finalSourceHash !== report.sourceHash ||
    git("rev-parse", "HEAD").trim() !== report.revision
  ) {
    throw new Error(
      "Source revision or contents differ between the start and end of verification; rerun with the checkout unchanged.",
    );
  }
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
