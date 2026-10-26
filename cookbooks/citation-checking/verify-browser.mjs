import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";

// Run from the repository root while holding the shared cookbook verification lock.
const output = "benchmarks/results/citation-checking";
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  ["../../node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
  {
    cwd: "apps/playground",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TYPESAFE_API_KEY: "sample-only-browser-check" },
  },
);
let log = "",
  browser;
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
const cleanup = async () => {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  await writeFile(`${output}/server.log`, log);
};
process.once("SIGINT", () => {
  void cleanup().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void cleanup().finally(() => process.exit(143));
});
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt === 100)
      throw new Error(`Server failed: ${log}`);
    try {
      if ((await fetch("http://127.0.0.1:4182/")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: `${output}/video` },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4182/");
  await page.getByRole("button", { name: "Run sample", exact: true }).waitFor();
  await page.screenshot({
    path: `${output}/before-general-playground.png`,
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:4182/?cookbook=citation-checking");
  assert.equal(await page.locator("#scenario").inputValue(), "flow-citation");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  assert.equal(
    await page.locator('#transport option[value="live"]').isDisabled(),
    true,
  );
  for (const [id, count, requests] of [
    ["original", 8, 7],
    ["missing", 1, 0],
    ["section", 1, 1],
    ["boundary", 3, 3],
    ["matching", 3, 2],
  ]) {
    await page.selectOption("#citation-case", id);
    const response = page.waitForResponse(
      (r) => r.url().includes("/__jev/run") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    const data = await (await response).json();
    assert.equal(data.ok, true, JSON.stringify(data));
    assert.equal(data.flow.value.rows.length, count);
    assert.equal(
      data.flow.value.rows.filter((row) => row.answer).length,
      requests,
    );
    const result = page.getByRole("region", {
      name: "Citation checking result",
    });
    await result.waitFor();
    await result.locator(".rag-passage summary").first().click();
    if (id === "original" || id === "matching") {
      assert.ok(await result.locator("mark").first().isVisible());
      await result
        .getByText("Full cleaned section sent to Jev", { exact: true })
        .first()
        .click();
    }
    await page.screenshot({ path: `${output}/${id}.png`, fullPage: true });
  }
  const session = await page.evaluate(() =>
    sessionStorage.getItem("jev-inspector-session"),
  );
  const message = await page.locator("#context").inputValue();
  for (const changed of [
    { mode: "live" },
    { message: "edited" },
    { citationCase: "toString" },
  ]) {
    const response = await page.request.post(
      `http://127.0.0.1:4182/__jev/run?session=${session}`,
      {
        headers: { origin: "http://127.0.0.1:4182" },
        data: {
          runId: crypto.randomUUID(),
          scenario: "flow-citation",
          mode: "sample",
          citationCase: "matching",
          message,
          ...changed,
        },
      },
    );
    assert.equal(response.status(), 400);
  }
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("check-citations");
  await page.getByRole("button", { name: "View Flow", exact: true }).click();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page.screenshot({ path: `${output}/flow.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#citation-case").focus();
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        cases: 5,
        serverRejections: [
          "live with configured key",
          "edited message",
          "invalid case",
        ],
        drawer: "opened, collection expanded, fit, closed",
        mobile: "390px, reduced motion, focused select, no horizontal overflow",
        errors,
        sampleOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(`Citation browser checks passed; evidence: ${output}`);
} finally {
  await cleanup();
}
