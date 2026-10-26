// Run under the shared cookbook verification lock after building the package.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = new URL(
  "../../benchmarks/results/date-extraction/browser/",
  import.meta.url,
);
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [root + "node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
  {
    cwd: root + "apps/playground",
    env: { ...process.env, TYPESAFE_API_KEY: "sample-key-not-a-credential" },
    stdio: ["ignore", "pipe", "pipe"],
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
const base = "http://127.0.0.1:4182";
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt === 100)
      throw new Error("Playground did not start: " + log);
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: {
      dir: fileURLToPath(output),
      size: { width: 1440, height: 1000 },
    },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(base + "/?cookbook=date-extraction");
  assert.equal(await page.locator("#scenario").inputValue(), "flow-date");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  assert.equal(
    await page.locator('#transport option[value="live"]').isDisabled(),
    true,
  );
  await page.screenshot({
    path: fileURLToPath(new URL("01-initial.png", output)),
    fullPage: true,
  });
  const results = [];
  for (const caseId of ["official", "calendar", "invalid", "thresholds"]) {
    await page.locator("#date-case").selectOption(caseId);
    const response = page.waitForResponse(
      (r) => r.url().includes("/__jev/run") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    const body = await (await response).json();
    assert.equal(body.ok, true);
    assert.equal(body.flow.value.referenceDate, "2026-07-30");
    const result = page.getByRole("region", { name: "Date extraction result" });
    await result.waitFor();
    assert.equal(
      await result.locator("article").count(),
      body.flow.value.rows.length,
    );
    await result.locator("summary").first().focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await result.locator("details").first().getAttribute("open"),
      "",
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`02-${caseId}.png`, output)),
      fullPage: true,
    });
    results.push({
      caseId,
      accepted: body.flow.value.accepted,
      review: body.flow.value.review,
    });
  }
  // Server rejects fabricated sample inputs and live requests even with a configured key.
  const rejection = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const message = document.querySelector("#context").value;
    const run = async (values) =>
      (
        await fetch(`/__jev/run?session=${session}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: crypto.randomUUID(),
            scenario: "flow-date",
            mode: "sample",
            dateCase: "thresholds",
            message,
            ...values,
          }),
        })
      ).status;
    return [
      await run({ mode: "live" }),
      await run({ message: "edited" }),
      await run({ dateCase: "unknown" }),
    ];
  });
  assert.deepEqual(rejection, [400, 400, 400]);
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("extract-dates");
  const collection = page.getByRole("article", {
    name: "Collection Extract each requested date",
    exact: true,
  });
  await collection
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Request read-date-parts", exact: true })
    .waitFor();
  const picker = page.getByLabel(
    "Collection item for Extract each requested date",
    { exact: true },
  );
  await picker.selectOption("1");
  const request = page.getByRole("article", {
    name: "Request read-date-parts",
    exact: true,
  });
  const question = request.getByLabel("Diagram question", { exact: true });
  assert.equal(await question.locator("option").count(), 7);
  for (const part of [
    "mode",
    "month",
    "day",
    "year",
    "day_anchor",
    "weekday",
    "week_offset",
  ])
    await question.selectOption(part);
  await question.selectOption("day_anchor");
  await page.screenshot({
    path: fileURLToPath(new URL("03-accepted-flow.png", output)),
    fullPage: true,
  });
  await picker.selectOption("3");
  await page
    .getByRole("button", {
      name: "Step review-date, task, completed",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("04-missing-confidence-flow.png", output)),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: fileURLToPath(new URL("05-mobile.png", output)),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page.screenshot({
    path: fileURLToPath(new URL("06-mobile-drawer.png", output)),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify(
      {
        results,
        rejection,
        errors,
        checked: [
          "deep link",
          "read-only context",
          "live denied with key",
          "all cases",
          "keyboard disclosure",
          "all seven questions",
          "nested item switching",
          "accept/review",
          "reopen drawer",
          "mobile overflow",
          "reduced motion",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await context.close();
  console.log(
    "Date extraction browser checks passed: " + fileURLToPath(output),
  );
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  await writeFile(new URL("server.log", output), log);
}
