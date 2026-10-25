import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runtimeEnv } from "./runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const output = join(
  root,
  "benchmarks/results/flows",
  `${Date.now()}-${process.pid}`,
);
await mkdir(output, { recursive: true });
const log = createWriteStream(join(output, "server.log"));
const server = fork("benchmarks/flow-server.mjs", [], {
  cwd: root,
  execArgv: ["--import", "tsx"],
  env: runtimeEnv({
    ...process.env,
    FLOW_PORT: "0",
    FLOW_OUT: join(output, "dist"),
  }),
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
let checks;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
const shutdown = async () => {
  await stop(checks);
  await stop(server);
};
process.once("SIGINT", () => void shutdown().finally(() => process.exit(130)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(143)));
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Flow harness startup timed out")),
      60_000,
    );
    server.once("error", reject);
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Flow harness exited before readiness"));
    });
    server.once("message", (message) => {
      clearTimeout(timer);
      resolve(message.origin);
    });
  });
  checks = spawn(process.execPath, ["scripts/verify-flows.mjs"], {
    cwd: root,
    env: runtimeEnv({ ...process.env, FLOW_URL: origin, FLOW_RESULTS: output }),
    stdio: "inherit",
  });
  const [code, signal] = await once(checks, "close");
  if (code !== 0)
    throw new Error(`Flow browser checks failed (${signal ?? code})`);
} catch (error) {
  console.error(`${error.message}. Evidence: ${output}`);
  process.exitCode = 1;
} finally {
  await shutdown();
  const closed = once(log, "close");
  log.end();
  await closed;
  console.log(`Flow browser evidence: ${output}`);
}
