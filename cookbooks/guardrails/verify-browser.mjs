import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

// Run from the repository root while holding the shared cookbook verification lock.
// No live transport is enabled or used. Evidence stays ignored.
const evidence = "benchmarks/results/guardrails/browser";
await mkdir(evidence, { recursive: true });
const root = fileURLToPath(new URL("../../apps/playground/", import.meta.url));
let server, browser, page;
const errors = [];
try {
  server = await createServer({
    root,
    configFile: `${root}vite.config.ts`,
    server: { host: "127.0.0.1", port: 4182, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    recordVideo: {
      dir: `${evidence}/video`,
      size: { width: 1440, height: 1050 },
    },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  let runs = 0;
  page.on("request", (request) => {
    if (request.url().includes("/__jev/run")) runs++;
  });
  await page.goto("http://127.0.0.1:4182/?cookbook=guardrails");
  await page
    .getByRole("heading", { name: "LLM guardrails", exact: true })
    .waitFor();
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  assert.equal(
    await page.locator('#transport option[value="live"]').isDisabled(),
    true,
  );
  await page.screenshot({ path: `${evidence}/before-run.png`, fullPage: true });
  const result = page.getByRole("region", {
    name: "Guardrails result",
    exact: true,
  });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await result
    .getByRole("heading", { name: "strict: block", exact: true })
    .waitFor();
  assert.equal(runs, 1);
  await result
    .getByRole("button", { name: "permissive → review", exact: true })
    .click();
  await result
    .getByRole("heading", { name: "permissive: review", exact: true })
    .waitFor();
  assert.equal(runs, 1);
  await page.screenshot({
    path: `${evidence}/policy-comparison.png`,
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
  for (const step of ["apply-strict-policy", "reapply-permissive-policy"])
    await page
      .getByRole("button", {
        name: `Step ${step}, task, completed`,
        exact: true,
      })
      .waitFor();
  await page
    .getByRole("button", { name: "Step block, output, completed", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Step support, output, untaken", exact: true })
    .waitFor();
  await page.screenshot({ path: `${evidence}/flow-strict.png` });
  await page
    .getByRole("button", {
      name: "Step screen-message, jev, completed",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await page
    .getByRole("region", { name: "Questions and answers", exact: true })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Jump to question", exact: true })
    .selectOption("4");
  await page.getByRole("heading", { name: "severity", exact: true }).waitFor();
  await page.getByText("Score legend", { exact: true }).click();
  await page
    .getByText(/Severe: complying causes serious physical harm/)
    .last()
    .waitFor();
  await page.screenshot({ path: `${evidence}/battery.png` });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  for (const [sample, action] of [
    ["ordinary", "pass"],
    ["review", "review"],
    ["strict", "block"],
    ["permissive", "block"],
    ["severity", "block"],
    ["severityOnly", "pass"],
    ["overlap", "support"],
    ["refusal", "pass"],
  ]) {
    await page.locator("#guardrails-case").selectOption(sample);
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    await result
      .getByRole("heading", { name: `strict: ${action}`, exact: true })
      .waitFor();
    if (["severity", "severityOnly", "overlap"].includes(sample))
      await page.screenshot({
        path: `${evidence}/${sample}.png`,
        fullPage: true,
      });
  }
  assert.equal(runs, 9);
  // Exercise the actual HTTP boundary, including rejection before any sample dispatch.
  const rejected = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-guardrails",
      mode: "sample",
      guardrailsCase: "ordinary",
      message: "Edited input",
    };
    const statuses = [];
    for (const change of [
      {},
      { guardrailsCase: "unknown" },
      { mode: "live", message: "Explain why autumn leaves change color." },
    ]) {
      const response = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...base,
          ...change,
          runId: crypto.randomUUID(),
        }),
      });
      statuses.push(response.status);
    }
    return statuses;
  });
  assert.deepEqual(rejected.slice(0, 2), [400, 400]);
  assert.ok([400, 409].includes(rejected[2]));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/mobile.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(
    `${evidence}/summary.json`,
    JSON.stringify(
      {
        status: "passed",
        cases: 9,
        policySwitchRequests: 0,
        rejected,
        errors,
        evidence,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Guardrails browser checks passed: ${evidence}`);
} catch (error) {
  await page?.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  console.error(await page?.locator("body").innerText());
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
