import { browserOutput } from "./cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only line-search.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const output = browserOutput();
await mkdir(output, { recursive: true });
const log = createWriteStream(`${output}/server.log`);
const server = spawn(
  process.execPath,
  ["../../node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
  {
    cwd: "apps/playground",
    env: { ...process.env, TYPESAFE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  const url = "http://127.0.0.1:4182";
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("Playground exited before readiness");
    try {
      ready = (
        await fetch(
          `${url}/__jev/config?session=00000000-0000-4000-8000-000000000000`,
        )
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "owned playground server ready");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${url}/?cookbook=line-search`);
  await page
    .getByRole("heading", { name: "Line-by-line search", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#scenario").inputValue(),
    "flow-line-search",
  );
  assert.ok(await page.locator("#context").evaluate((el) => el.readOnly));
  assert.ok(await page.locator('#transport option[value="live"]').isDisabled());
  assert.equal(await page.locator("#line-search-case option").count(), 10);
  await page.screenshot({ path: `${output}/before-run.png`, fullPage: true });
  const result = page.getByRole("region", {
    name: "Line search result",
    exact: true,
  });
  const cases = [
    ["ownership", "Answered in this document", "L052"],
    ["termination", "Answered in this document", "L168"],
    ["absent", "Not in this document", "L205"],
    ["partial", "Partially addressed", "L029"],
    ["belowAbsent", "Not in this document", "L205"],
    ["atAbsent", "Partially addressed", "L205"],
    ["aboveAbsent", "Partially addressed", "L205"],
    ["belowFound", "Partially addressed", "L052"],
    ["atFound", "Answered in this document", "L052"],
    ["aboveFound", "Answered in this document", "L052"],
  ];
  for (const [id, verdict, line] of cases) {
    await page.locator("#line-search-case").selectOption(id);
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    await result.getByRole("heading", { name: verdict, exact: true }).waitFor();
    assert.ok(
      (await result.locator("summary").first().innerText()).startsWith(line),
    );
    if (id === "absent") {
      await result.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/absent-strong-line.png`,
        fullPage: true,
      });
      const all = result.locator("details").last();
      await all.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.ok(await all.evaluate((el) => el.open));
      assert.equal(await all.locator("li").count(), 218);
      assert.ok(
        await all.getByText("L217 · 0.0006", { exact: true }).isVisible(),
      );
      await all.locator("li").last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/all-options-end.png` });
      await all.locator("summary").click();
    }
  }
  // The linked public-flow viewer must expose the single request and both route predicates.
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Flow canvas", exact: true })
    .waitFor();
  await page
    .getByRole("article", { name: "Request find", exact: true })
    .waitFor();
  await page.screenshot({ path: `${output}/flow-inspection.png` });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#line-search-case").selectOption("absent");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await result
    .getByRole("heading", { name: "Not in this document", exact: true })
    .waitFor();
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${output}/mobile-absent.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no mobile horizontal overflow",
  );
  const statuses = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-line-search",
      mode: "sample",
      lineSearchCase: "ownership",
      message: "who owns the code I upload?",
    };
    return Promise.all(
      [
        { message: "edited" },
        { lineSearchCase: "unknown" },
        { mode: "live" },
      ].map(async (change) => {
        const r = await fetch(`/__jev/run?session=${session}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...base,
            ...change,
            runId: crypto.randomUUID(),
          }),
        });
        return r.status;
      }),
    );
  });
  assert.deepEqual(statuses.slice(0, 2), [400, 400]);
  assert.ok([400, 409].includes(statuses[2]));
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        status: "passed",
        cases: cases.map(([id]) => id),
        lineOptions: 218,
        apiRejections: statuses,
        pageErrors: errors,
        source: "synthetic only",
      },
      null,
      2,
    ),
  );
  console.log(`Line-search browser verification passed: ${output}`);
} finally {
  await browser?.close();
  try {
    server.kill("SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) resolve();
    else server.once("exit", resolve);
  });
  log.end();
}
