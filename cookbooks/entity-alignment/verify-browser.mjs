// Run after npm run build:package. Serialize with the other cookbook checks.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const root = fileURLToPath(new URL("../../", import.meta.url));
const lock = "/private/tmp/jev-cookbook-verification.lock";
const output = new URL(
  "../../benchmarks/results/entity-alignment/",
  import.meta.url,
);
try {
  await mkdir(lock);
} catch (error) {
  if (error.code === "EEXIST")
    console.error(
      await readFile(`${lock}/owner.json`, "utf8").catch(
        () => "Verification lock occupied",
      ),
    );
  throw error;
}
let server, browser;
try {
  await writeFile(
    `${lock}/owner.json`,
    JSON.stringify({
      thread: "01a17664-50db-7923-b964-051785213355",
      branch: "codex/cookbook-entity-alignment",
      worktree: root,
      pid: process.pid,
    }),
  );
  await mkdir(output, { recursive: true });
  const log = createWriteStream(new URL("server.log", output));
  server = spawn(
    process.execPath,
    [
      `${root}node_modules/vite/bin/vite.js`,
      "--host",
      "127.0.0.1",
      "--strictPort",
    ],
    {
      cwd: `${root}apps/playground`,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // Vite is hoisted at the workspace root.
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  const origin = "http://127.0.0.1:4182";
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Server exited: ${server.exitCode}`);
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    if (attempt === 100) throw new Error("Playground did not start");
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${origin}/?cookbook=entity-alignment`);
  await page
    .getByRole("heading", { name: "Compare records. Inspect the match." })
    .waitFor();
  assert.equal(await page.locator("#scenario").inputValue(), "flow-entity");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({
    path: fileURLToPath(new URL("before-run.png", output)),
    fullPage: true,
  });
  const cases = [
    ["same", "Proposed sameAs"],
    ["different", "Leave unlinked"],
    ["style", "Curator review"],
    ["variant", "Curator review"],
    ["belowLower", "Leave unlinked"],
    ["atLower", "Curator review"],
    ["aboveLower", "Curator review"],
    ["belowUpper", "Curator review"],
    ["atUpper", "Proposed sameAs"],
    ["aboveUpper", "Proposed sameAs"],
  ];
  for (const [id, outcome] of cases) {
    await page.locator("#entity-case").selectOption(id);
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    await page
      .getByRole("region", { name: "Entity alignment result" })
      .getByRole("heading", { name: outcome, exact: true })
      .waitFor();
  }
  await page.locator("#entity-case").selectOption("atUpper");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("region", { name: "Entity alignment result" })
    .getByRole("heading", { name: "Proposed sameAs", exact: true })
    .waitFor();
  await page
    .getByText("Score distribution and confidence · synthetic", { exact: true })
    .click();
  await page.screenshot({
    path: fileURLToPath(new URL("after-boundary.png", output)),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  await page
    .getByRole("button", {
      name: "Step proposed-same-as, output, completed",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Step assess-pair, jev, completed",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await page.getByText("same_brewery", { exact: true }).first().waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("inspector.png", output)),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", output)),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No mobile horizontal overflow",
  );
  // Exercise the HTTP authorization boundary rather than relying on readonly UI.
  const rejections = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-entity",
      mode: "sample",
      entityCase: "same",
      message: "Compare official example pair c446 with synthetic judgments.",
    };
    const statuses = [];
    for (const patch of [
      { message: "changed" },
      { entityCase: "unknown" },
      { mode: "live" },
    ]) {
      const response = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, ...patch, runId: crypto.randomUUID() }),
      });
      statuses.push(response.status);
    }
    return statuses;
  });
  assert.deepEqual(rejections.slice(0, 2), [400, 400]);
  assert.ok([400, 409].includes(rejections[2]));
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify(
      {
        cases: cases.length,
        desktop: "1440×1000",
        mobile: "390×844",
        httpRejections: rejections,
        pageErrors: errors,
        source: "synthetic; no live inference",
      },
      null,
      2,
    ),
  );
  console.log(
    `Entity browser checks passed. Evidence: ${fileURLToPath(output)}`,
  );
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, "SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await rm(lock, { recursive: true });
}
