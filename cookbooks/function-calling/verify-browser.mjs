import { browserOutput } from "../../scripts/cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only function-calling.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const evidence = browserOutput();
let browser, server, context;
let log = "";
try {
  await mkdir(evidence, { recursive: true });
  server = spawn(
    process.execPath,
    ["../../node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    {
      cwd: "apps/playground",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TYPESAFE_API_KEY: "" },
    },
  );
  server.stdout.on("data", (chunk) => {
    log += chunk;
  });
  server.stderr.on("data", (chunk) => {
    log += chunk;
  });
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt >= 120)
      throw new Error(`Server did not start: ${log}`);
    try {
      if ((await fetch("http://127.0.0.1:4182/")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: evidence },
  });
  const page = await context.newPage(),
    errors = [],
    visited = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto("http://127.0.0.1:4182/?legacy=1&cookbook=function-calling");
  assert.equal(
    await page.locator("#scenario").inputValue(),
    "flow-function-calling",
  );
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({ path: `${evidence}/before-run.png`, fullPage: true });
  const run = async (id) => {
    await page.locator("#function-case").selectOption(id);
    await button("Run sample").click();
    await page
      .getByRole("region", { name: "Function calling result" })
      .waitFor();
  };
  await run("roles");
  assert.match(
    await page
      .getByRole("region", { name: "Function calling result" })
      .innerText(),
    /82.0%/,
  );
  await page.screenshot({
    path: `${evidence}/roles-result.png`,
    fullPage: true,
  });
  await button("Open Jev DevTools").click();
  await button("Flows").click();
  await button("Expand Jev drawer").click();
  await page.getByLabel("Flow step", { exact: true }).selectOption("dispatch");
  await button("Show details").click();
  await button("Inspect request").click();
  await button("Questions").click();
  const picker = page.getByLabel("Jump to question", { exact: true });
  await picker.waitFor();
  assert.equal(await picker.locator("option").count(), 54);
  for (let i = 0; i < 54; i++) {
    await picker.selectOption(String(i));
    const card = page.locator(`.questions-row[data-index="${i}"] article`);
    await card.locator(".answer").waitFor();
    visited.push(await card.innerText());
  }
  await page.screenshot({ path: `${evidence}/all-answers-last.png` });
  await button("Hide request details").click();
  await button("Hide details").click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("selected-arguments");
  await page.screenshot({ path: `${evidence}/argument-collection.png` });
  // The collection item selector and inline view are the package's existing public UI.
  await button("View Flow").click();
  await button("Step fill, task, completed").waitFor();
  await button("Fit flow").click();
  await page.screenshot({ path: `${evidence}/argument-path.png` });
  await page
    .getByLabel("Collection item for Read only the selected tool's arguments", {
      exact: true,
    })
    .selectOption("2");
  await button("Step omit, task, completed").waitFor();
  await button("Step fill, task, untaken").waitFor();
  await button("Fit flow").click();
  await page.screenshot({ path: `${evidence}/omitted-argument-path.png` });
  await button("Close Jev DevTools").click();
  for (const id of [
    "members",
    "flags",
    "boundaries",
    "emptySet",
    "list",
    "low",
    "market",
    "stats",
    "volatility",
    "movers",
    "drawdown",
    "omitted",
  ]) {
    await run(id);
    const text = await page
      .getByRole("region", { name: "Function calling result" })
      .innerText();
    assert.match(text, /No tool was executed/);
    if (id === "low") assert.match(text, /41.0%/);
    if (id === "boundaries") assert.match(text, /50.0%/);
    if (["members", "boundaries", "low"].includes(id))
      await page.screenshot({
        path: `${evidence}/${id}-result.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await run("roles");
  await page
    .getByRole("region", { name: "Function calling result" })
    .getByText(/benchmark ·/)
    .click();
  await page.screenshot({
    path: `${evidence}/mobile-result.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal page overflow at mobile width",
  );
  const statuses = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-function-calling",
      mode: "sample",
      message: "Is AMD tracking Nvidia lately?",
      functionCase: "roles",
    };
    const statuses = [];
    for (const patch of [
      { message: "arbitrary" },
      { functionCase: "__proto__" },
      { mode: "live" },
    ]) {
      const res = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, ...patch, runId: crypto.randomUUID() }),
      });
      statuses.push(res.status);
    }
    return statuses;
  });
  assert.deepEqual(statuses.slice(0, 2), [400, 400]);
  assert.ok([400, 409].includes(statuses[2]));
  assert.deepEqual(errors, []);
  await writeFile(
    `${evidence}/report.json`,
    JSON.stringify(
      {
        status: "passed",
        cases: 13,
        answersVisited: visited.length,
        visited,
        rejectedRequestStatuses: statuses,
        pageErrors: errors,
        mode: "synthetic fixtures only",
      },
      null,
      2,
    ),
  );
  console.log(`Browser verification passed; evidence: ${evidence}`);
} finally {
  await context?.close();
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  await writeFile(`${evidence}/server.log`, log).catch(() => {});
}
