// Run via npm run verify:cookbooks -- --only parallel-questions.
import { browserOutput } from "../../scripts/cookbook-browser-context.mjs";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, createWriteStream } from "node:fs";
import assert from "node:assert/strict";
const root = process.cwd(),
  evidence = browserOutput() + "/";
const log = createWriteStream(evidence + "browser-server.log");
const server = spawn(
  process.execPath,
  [
    root + "/node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4182",
    "--strictPort",
  ],
  {
    cwd: root + "/apps/playground",
    env: { ...process.env, TYPESAFE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
// Resolve Vite from workspace root while retaining the playground working directory.
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("server exited " + server.exitCode);
    try {
      if ((await fetch("http://127.0.0.1:4182")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordVideo: {
      dir: evidence + "video",
      size: { width: 1440, height: 1100 },
    },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:4182/?legacy=1&cookbook=parallel-questions",
  );
  await page
    .getByRole("heading", { name: "Ask 13 questions. Compare two strategies." })
    .waitFor();
  assert.equal(
    await page.locator("#scenario").inputValue(),
    "flow-parallel-questions",
  );
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({ path: evidence + "before.png", fullPage: true });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  const result = page.getByRole("region", {
    name: "Parallel questions result",
  });
  await result.waitFor({ timeout: 30000 });
  assert.equal(await result.locator("tbody tr").count(), 13);
  assert.equal(await result.locator("details").count(), 13);
  for (let i = 0; i < 13; i++) {
    const d = result.locator("details").nth(i);
    await d.locator("summary").click();
    assert.equal(await d.locator("h4").count(), 5);
    assert.equal(await d.locator("pre").count(), 5);
    await d.locator("summary").click();
  }
  const firstSummary = result.locator("details").first().locator("summary");
  await firstSummary.focus();
  await firstSummary.press("Enter");
  assert.equal(
    await result.locator("details").first().getAttribute("open"),
    "",
  );
  await firstSummary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + "answer-details.png" });
  await firstSummary.press("Enter");
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + "after.png", fullPage: true });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  writeFileSync(
    evidence + "flow-dom.txt",
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: evidence + "flow.png" });
  const loopCard = page.getByRole("article", {
    name: "Step Single-question strategy · five repeats",
    exact: true,
  });
  await loopCard
    .getByLabel("Iteration for Single-question strategy · five repeats", {
      exact: true,
    })
    .selectOption("4");
  await loopCard
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  const collection = page.getByRole("article", {
    name: "Collection 13 requests · one after another",
    exact: true,
  });
  await collection
    .getByLabel("Collection item for 13 requests · one after another", {
      exact: true,
    })
    .selectOption("12");
  await collection
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  const requestCard = page.getByRole("article", {
    name: "Request single-request",
    exact: true,
  });
  await requestCard.waitFor();
  assert.equal(
    await requestCard
      .getByLabel("Diagram question", { exact: true })
      .inputValue(),
    "compliance_burden",
  );
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page.screenshot({ path: evidence + "nested-flow.png" });

  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.locator("#parallel-questions-case").selectOption("varied");
  assert.equal(await result.count(), 0);
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await result.waitFor();
  assert.ok(
    (await result.locator("tbody tr").first().innerText()).includes("0.3953"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await result.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: evidence + "mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Run sample", exact: true }).waitFor();
  assert.equal(await result.count(), 0);
  const serverChecks = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const message = document.querySelector("#context").value;
    const post = async (extra) => {
      const response = await fetch("/__jev/run?session=" + session, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: crypto.randomUUID(),
          scenario: "flow-parallel-questions",
          parallelQuestionsCase: "stable",
          mode: "sample",
          message,
          ...extra,
        }),
      });
      return response.status;
    };
    return {
      edited: await post({ message: "edited" }),
      live: await post({ mode: "live" }),
      invalidCase: await post({ parallelQuestionsCase: "invalid" }),
    };
  });
  assert.equal(serverChecks.edited, 400);
  assert.ok([400, 409].includes(serverChecks.live));
  assert.equal(serverChecks.invalidCase, 400);
  assert.deepEqual(errors, []);
  writeFileSync(
    evidence + "browser-summary.json",
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "deep link",
          "read-only sample",
          "70-request result",
          "all 130 raw answers accessible",
          "two loops in drawer",
          "varied statistics",
          "mobile no page overflow",
          "cancel clears result",
          "server rejects changed/live/invalid inputs",
        ],
        serverChecks,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
  console.log("Browser checks passed");
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
  log.end();
}
