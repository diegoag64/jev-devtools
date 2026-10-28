import { fork, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const workerFlag = "--jev-temporary-project-worker";

// The supervisor stays responsive while the worker runs synchronous npm/build
// commands. Only the supervisor owns deletion; worker descendants share a group.
export async function withTemporaryProject(prefix, work) {
  if (process.argv.includes(workerFlag) && process.send) {
    const temp = await new Promise((resolve) => {
      process.once("message", ({ directory }) => resolve(directory));
      process.send({ ready: true });
    });
    // Keep the group leader alive until the supervisor stops the whole tree,
    // including descendants that outlive a successful or failed callback.
    process.on("message", () => {});
    try {
      await work(temp);
      process.send({ result: process.exitCode ?? 0 });
    } catch (error) {
      console.error(error);
      process.send({ result: 1 });
    }
    return;
  }

  let temp, child, closed, interrupted, stopPromise;
  let code = 1;
  const stop = () => (stopPromise ??= stopTree(child, closed));
  const handlers = new Map(
    ["SIGINT", "SIGTERM"].map((signal) => [
      signal,
      () => {
        if (interrupted) return;
        interrupted = signal;
        // Wait for the worker outcome below, then join this same stop operation.
        if (child) void stop().catch(() => {});
      },
    ]),
  );
  const interrupt = (message) => handlers.get(message?.interrupt)?.();
  process.on("message", interrupt);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  try {
    temp = await mkdtemp(join(tmpdir(), prefix));
    console.log(`Temporary verification project: ${temp}`);
    if (!interrupted) {
      child = fork(process.argv[1], [...process.argv.slice(2), workerFlag], {
        detached: process.platform !== "win32",
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      console.log(
        `Temporary verification worker: ${child.pid}; supervisor: ${process.pid}`,
      );
      closed = new Promise((resolve) => child.once("close", resolve));
      code = await new Promise((resolve, reject) => {
        let resultReceived = false;
        child.once("error", reject);
        child.once("exit", (status, signal) => {
          if (signal && !resultReceived)
            console.error(`Verification worker exited on ${signal}`);
          resolve(status ?? 1);
        });
        child.on("message", (message) => {
          if (message.ready) child.send({ directory: temp });
          if (Number.isInteger(message.result)) {
            resultReceived = true;
            resolve(message.result);
          }
        });
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    try {
      await stop();
      if (temp) {
        await rm(temp, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
        console.log(`Removed temporary verification project: ${temp}`);
      }
    } catch (error) {
      // Keep the original failure/status visible; cleanup must never turn a
      // failed check into success or hide the path that needs manual attention.
      console.error(
        `Temporary project cleanup failed (${temp ?? "not created"}):`,
        error,
      );
      if (code === 0) code = 1;
    } finally {
      if (interrupted) {
        console.error(`Verification interrupted by ${interrupted}`);
        code = interrupted === "SIGINT" ? 130 : 143;
      }
      for (const [signal, handler] of handlers) process.off(signal, handler);
      process.off("message", interrupt);
      if (process.connected) process.disconnect();
      process.exitCode = code;
    }
  }
}

async function stopTree(child, closed) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    // child.kill only stops the immediate process on Windows. Keep the worker
    // alive until this tree operation so taskkill can find its descendants.
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    await new Promise((resolve, reject) => {
      killer.once("error", reject);
      killer.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`taskkill failed (${code})`)),
      );
    });
    await closed;
    return;
  }
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  };
  signal("SIGTERM");
  const deadline = Date.now() + 2000;
  while (signal(0) && Date.now() < deadline) await delay(25);
  if (signal(0)) signal("SIGKILL");
  await closed;
  const killedDeadline = Date.now() + 5000;
  while (signal(0) && Date.now() < killedDeadline) await delay(25);
  if (signal(0))
    throw new Error(
      `Worker process group ${child.pid} did not stop; fixture retained`,
    );
}
