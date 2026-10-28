import { withTemporaryProject } from "../temporary-project.mjs";
import { writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";

const mode = process.argv[2];
await withTemporaryProject("jev-fixture-test-", async (directory) => {
  writeFileSync(join(directory, "fixture"), "owned fixture");
  if (mode === "setup-failure") throw new Error("original setup failure");
  if (mode.startsWith("cleanup-")) {
    chmodSync(directory, 0);
    if (mode === "cleanup-failure")
      throw new Error("original verification failure");
    return;
  }
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    const { existsSync } = require('node:fs');
    process.on('SIGTERM', () => {
      console.log('CHILD_STOP_EXISTS ' + existsSync(${JSON.stringify(directory)}));
    });
    console.log('CHILD_READY ' + process.pid);
    process.send('ready');
    setInterval(() => {}, 1000);
  `,
    ],
    { stdio: ["ignore", "inherit", "inherit", "ipc"] },
  );
  await new Promise((resolve) => child.once("message", resolve));
  console.log("WORKER_READY " + process.pid);
  if (mode === "test-failure") throw new Error("original test failure");
  if (mode === "abrupt-exit") process.exit(7);
  if (mode === "interrupt") {
    // Block this worker's event loop just like npm install/build does.
    execFileSync(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "inherit",
    });
  }
});
