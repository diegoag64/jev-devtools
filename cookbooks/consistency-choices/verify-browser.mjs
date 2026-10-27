import { browserOutputURL } from "../../scripts/cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only consistency-choices.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const root = new URL("../../", import.meta.url);
const evidence = browserOutputURL();
await mkdir(evidence, { recursive: true });
const env = { ...process.env, TYPESAFE_API_KEY: "" };
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "apps/playground",
    "--config",
    "apps/playground/vite.config.ts",
  ],
  { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "",
  browser;
server.stdout.on("data", (data) => (log += data));
server.stderr.on("data", (data) => (log += data));
const errors = [];
try {
  for (let i = 0; ; i++) {
    if (i === 120 || server.exitCode !== null)
      throw Error(`Playground failed: ${log}`);
    try {
      if ((await fetch("http://127.0.0.1:4182")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: new URL("video/", evidence).pathname },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    "http://127.0.0.1:4182/?legacy=1&cookbook=consistency-choices",
  );
  await page
    .getByRole("heading", {
      name: "Repeat the rubric. Inspect every decision.",
    })
    .waitFor();
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({
    path: new URL("before.png", evidence).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("region", { name: "Choice consistency result" })
    .waitFor();
  assert.equal(await page.locator(".consistency-cell").count(), 120);
  await page
    .locator(".consistency-result")
    .screenshot({ path: new URL("varying.png", evidence).pathname });
  await page.locator("#consistency-case").selectOption("boundaries");
  assert.equal(await page.locator(".consistency-result").count(), 0);
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("region", { name: "Choice consistency result" })
    .waitFor();
  const exact = page.getByRole("button", {
    name: "category, repeat 2: Violence, top probability 0.6",
    exact: true,
  });
  await exact.focus();
  await page.keyboard.press("Enter");
  assert.equal(await exact.getAttribute("aria-pressed"), "true");
  assert.match(
    await page.locator(".consistency-detail[aria-live]").innerText(),
    /repeat 2/,
  );
  assert.match(
    await page.locator(".consistency-detail[aria-live]").innerText(),
    /API confidence: 0.1/,
  );
  await page.getByText("Raw response for this repeat", { exact: true }).click();
  assert.match(
    await page.locator(".consistency-detail[aria-live] pre").innerText(),
    /"confidence": 0.1/,
  );
  await page
    .locator(".consistency-result")
    .screenshot({ path: new URL("boundaries.png", evidence).pathname });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View Flow", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Step gate-category, if, completed/ })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page.screenshot({ path: new URL("flow.png", evidence).pathname });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".consistency-scroll").scrollIntoViewIfNeeded();
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    table: document.querySelector(".consistency-scroll").scrollWidth,
  }));
  assert.ok(widths.document <= widths.viewport, JSON.stringify(widths));
  assert.ok(widths.table > widths.viewport);
  await page.locator(".consistency-scroll").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.screenshot({ path: new URL("mobile.png", evidence).pathname });
  // Server boundary: forged selectors/edited input/live mode cannot reach sampling.
  const rejected = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-consistency-choices",
      mode: "sample",
      consistencyCase: "boundaries",
      message: document.querySelector("#context").value,
    };
    const outcomes = [];
    for (const patch of [
      { message: "edited" },
      { consistencyCase: "__proto__" },
      { mode: "live" },
    ]) {
      const response = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, ...patch, runId: crypto.randomUUID() }),
      });
      outcomes.push(response.status);
    }
    return outcomes;
  });
  assert.deepEqual(rejected.slice(0, 2), [400, 400]);
  assert.ok([400, 409].includes(rejected[2]));
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("browser.json", evidence),
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "deep link",
          "120 cells",
          "sample reset",
          "exact boundary and confidence",
          "keyboard selection",
          "raw answers",
          "expanded per-question flow",
          "mobile scroll without page overflow",
          "server input and live rejection",
        ],
        widths,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  await writeFile(new URL("server.log", evidence), log);
}
