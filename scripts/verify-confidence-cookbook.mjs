import { browserOutput } from "./cookbook-browser-context.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Run via npm run verify:cookbooks -- --only confidence-fallback.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = browserOutput();
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [`${root}node_modules/vite/bin/vite.js`, "--host", "127.0.0.1"],
  {
    cwd: `${root}apps/playground`,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
let browser;
async function cleanup() {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  await writeFile(`${output}/browser-server.log`, log);
}
process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));
process.once("SIGTERM", () => void cleanup().finally(() => process.exit(143)));
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt === 120)
      throw new Error(`Server failed: ${log}`);
    try {
      if ((await fetch("http://127.0.0.1:4182/")).ok) break;
    } catch {
      // Vite has not started listening yet. Readiness does not depend on ANSI logs.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    "http://127.0.0.1:4182/?legacy=1&cookbook=confidence-fallback",
  );
  await page
    .getByRole("heading", { name: "Choose how specific to be." })
    .waitFor();
  assert.equal(await page.locator("#scenario").inputValue(), "flow-confidence");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({ path: `${output}/before-run.png`, fullPage: true });
  let captured;
  for (const [caseId, label, confidence] of [
    ["below", "Division: manufacturing", 0.899],
    ["equal", "Industry group 60", 0.9],
    ["above", "Industry group 20", 0.901],
    ["services", "Division: services", 0.22],
  ]) {
    await page.locator("#confidence-case").selectOption(caseId);
    const response = page.waitForResponse(
      (response) =>
        response.url().includes("/__jev/run") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    captured = await response;
    assert.equal(captured.status(), 200);
    const body = await captured.json();
    assert.equal(body.flow.value.confidence, confidence);
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    if (caseId === "below" || caseId === "equal")
      await page.screenshot({
        path: `${output}/${caseId}-result.png`,
        fullPage: true,
      });
  }
  await page.getByText("All 75 class probabilities", { exact: true }).click();
  assert.equal(await page.locator(".rag-passage[open] dt").count(), 75);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `${output}/mobile-probabilities.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  await page
    .getByRole("article", { name: "Request classify-industry", exact: true })
    .waitFor();
  await page.getByText("API confidence ≥ 0.90?", { exact: true }).waitFor();
  await page.screenshot({
    path: `${output}/flow-inspector.png`,
    fullPage: false,
  });
  // Exercise restrictions at the HTTP boundary, not only the read-only control.
  const endpoint = captured.url();
  const request = captured.request().postDataJSON();
  for (const patch of [
    { message: "edited" },
    { confidenceCase: "invalid" },
    { mode: "live" },
  ]) {
    const status = await page.evaluate(
      async ({ endpoint, request, patch }) =>
        (
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...request,
              ...patch,
              runId: crypto.randomUUID(),
            }),
          })
        ).status,
      { endpoint, request, patch },
    );
    assert.ok(
      status === 400 || status === 409,
      `Expected server rejection, got ${status}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `Confidence browser checks passed: four cases, all probabilities, mobile, drawer, input/live rejection. Evidence: ${output}`,
  );
} finally {
  await cleanup();
}
