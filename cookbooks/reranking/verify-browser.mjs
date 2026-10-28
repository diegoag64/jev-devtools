import { browserOutput } from "../../scripts/cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only reranking.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
const output = browserOutput();
await mkdir(output, { recursive: true });
let server, browser, context;
try {
  server = await createServer({
    root: resolve("apps/playground"),
    configFile: resolve("apps/playground/vite.config.ts"),
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: output },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.setDefaultTimeout(15_000);
  await page.goto("http://127.0.0.1:4182/?legacy=1&cookbook=reranking");
  await page
    .getByRole("heading", { name: "One query. A new candidate order." })
    .waitFor();
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  assert.equal(
    await page.locator('#transport option[value="live"]').isDisabled(),
    true,
  );
  await page.screenshot({ path: `${output}/before-run.png`, fullPage: true });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  const result = page.getByRole("region", { name: "Re-ranking result" });
  await result.waitFor();
  assert.equal(await result.locator("details").count(), 30);
  assert.match(
    await result.locator("summary").first().innerText(),
    /1\. Unopposed motion.*Noul 1.00.*original #5/,
  );
  await result.locator("summary").first().click();
  await page.screenshot({ path: `${output}/after-sort.png`, fullPage: true });
  await result
    .getByRole("button", { name: "Before · retrieval fixture" })
    .press("Enter");
  assert.match(
    await result.locator("summary").first().innerText(),
    /1\. Default judgment/,
  );
  await result
    .getByRole("button", { name: "After · stable Noul sort" })
    .click();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("score-candidates");
  const picker = page.getByLabel("Collection item for Score the shortlist", {
    exact: true,
  });
  await picker.selectOption("4");
  await page.getByRole("button", { name: "View Flow", exact: true }).click();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page
    .getByRole("article", { name: "Request score-candidate", exact: true })
    .getByText("100%", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: `${output}/candidate-flow.png`,
    animations: "disabled",
  });
  await picker.selectOption("29");
  await page
    .getByRole("article", { name: "Request score-candidate", exact: true })
    .getByText("24%", { exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("article", {
      name: "Collection Score the shortlist",
      exact: true,
    })
    .getByRole("button", { name: "Hide Flow", exact: true })
    .click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("sort-candidates");
  await page.screenshot({ path: `${output}/sort-task.png` });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.locator("#reranking-case").selectOption("ties");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await result.waitFor();
  const afterTies = await result.locator("summary").allTextContents();
  await result
    .getByRole("button", { name: "Before · retrieval fixture" })
    .click();
  assert.deepEqual(
    await result.locator("summary").allTextContents(),
    afterTies,
  );
  assert.ok(afterTies.every((text) => text.includes("Noul 0.50")));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile-ties.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Run sample", exact: true }).waitFor();
  assert.equal(await result.count(), 0);
  await page.screenshot({ path: `${output}/cancelled.png`, fullPage: true });
  const responses = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const message = document.querySelector("#context").value;
    const rejected = [];
    for (const extra of [
      { mode: "live" },
      { message: "edited query" },
      { rerankingCase: "unknown" },
    ]) {
      const response = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: "flow-reranking",
          mode: "sample",
          rerankingCase: "ties",
          message,
          runId: crypto.randomUUID(),
          ...extra,
        }),
      });
      rejected.push(response.status);
    }
    return rejected;
  });
  assert.ok([400, 409].includes(responses[0]));
  assert.deepEqual(responses.slice(1), [400, 400]);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        cases: ["reordered", "ties", "cancelled"],
        requestsPerCompletedRun: 30,
        serverRejections: responses,
        pageErrors: errors,
        evidence: "Screenshots and video are local only; synthetic transport.",
      },
      null,
      2,
    ),
  );
  console.log(`Re-ranking browser checks passed; evidence: ${output}`);
} finally {
  await context?.close();
  await browser?.close();
  await server?.close();
}
