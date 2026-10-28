import { browserOutput } from "../../scripts/cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only pre-parsed-extraction.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const root = fileURLToPath(new URL("../../", import.meta.url));
let server, browser, context;
const output = browserOutput();
const cleanup = async () => {
  try {
    await context?.close();
    await browser?.close();
  } finally {
    await server?.close();
  }
};
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(1));
  });
try {
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify({ status: "running" }) + "\n",
  );
  server = await createServer({
    root: join(root, "apps/playground"),
    configFile: join(root, "apps/playground/vite.config.ts"),
    server: { host: "127.0.0.1", port: 4182, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(
    "http://127.0.0.1:4182/?legacy=1&cookbook=pre-parsed-extraction",
  );
  await page
    .getByRole("heading", { name: "Find the spans. Select the value." })
    .waitFor();
  assert.equal(await page.locator("#scenario").inputValue(), "flow-extraction");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  assert.ok(await page.locator('#transport option[value="live"]').isDisabled());
  await page.screenshot({
    path: join(output, "before-run.png"),
    fullPage: true,
  });
  const result = page.getByRole("region", {
    name: "Pre-parsed extraction result",
  });
  const runCase = async (caseId) => {
    await page.locator("#extraction-case").selectOption(caseId);
    const response = page.waitForResponse(
      (r) => r.url().includes("/__jev/run") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    assert.equal((await response).status(), 200);
    await result.waitFor();
  };
  await runCase("email");
  assert.ok((await result.textContent()).includes("dana.personal@gmail.com"));
  await result.getByText(/receipt:.*confidence/).click();
  await page.screenshot({ path: join(output, "email.png"), fullPage: true });
  await runCase("phone");
  assert.ok((await result.textContent()).includes("+14155550177"));
  await page.screenshot({ path: join(output, "phone.png"), fullPage: true });
  await runCase("money");
  assert.ok((await result.textContent()).includes("1315.50 USD"));
  await page.screenshot({ path: join(output, "money.png"), fullPage: true });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  const whole = page.getByRole("region", { name: "Whole flow", exact: true });
  await whole
    .getByLabel("Flow step", { exact: true })
    .selectOption("separate-helper-calls");
  // Nested flows preserve the shared camera. Pan with its public keyboard
  // controls so the request is actually in the screenshot, not just in the DOM.
  const centerRequest = async (request) => {
    const canvas = page.getByRole("region", {
      name: "Flow canvas",
      exact: true,
    });
    await canvas.focus();
    for (let attempt = 0; attempt < 100; attempt++) {
      const view = await canvas.boundingBox();
      const card = await request.boundingBox();
      assert.ok(view && card);
      const dx = card.x + card.width / 2 - view.x - view.width / 2;
      const dy = card.y + card.height / 2 - view.y - view.height / 2;
      if (Math.abs(dx) <= 60 && Math.abs(dy) <= 60) return;
      if (Math.abs(dx) > 60)
        await canvas.press(dx > 0 ? "Shift+ArrowRight" : "Shift+ArrowLeft");
      if (Math.abs(dy) > 60)
        await canvas.press(dy > 0 ? "Shift+ArrowDown" : "Shift+ArrowUp");
    }
    throw new Error("Could not pan to the nested request");
  };
  const helpers = whole.getByRole("article", {
    name: "Collection Select values sequentially",
    exact: true,
  });
  await helpers.getByRole("button", { name: "View Flow", exact: true }).click();
  await helpers
    .getByLabel("Collection item for Select values sequentially", {
      exact: true,
    })
    .selectOption("2");
  const item = page.getByRole("region", {
    name: "Collection item flow",
    exact: true,
  });
  await item.getByLabel("Flow step", { exact: true }).selectOption("select");
  await item
    .getByText("Which amount is the courtesy credit that was applied?", {
      exact: true,
    })
    .first()
    .waitFor();
  await centerRequest(
    item.getByRole("article", { name: "Request select", exact: true }),
  );
  await page.screenshot({
    path: join(output, "selection-flow.png"),
    fullPage: true,
  });
  await centerRequest(helpers);
  await helpers.getByRole("button", { name: "Hide Flow", exact: true }).click();
  await whole
    .getByLabel("Flow step", { exact: true })
    .selectOption("credit-checks");
  const checks = whole.getByRole("article", {
    name: "Collection Check and normalize each amount",
    exact: true,
  });
  await checks.getByRole("button", { name: "View Flow", exact: true }).click();
  await item.getByLabel("Flow step", { exact: true }).selectOption("is-credit");
  await item
    .getByText(
      "Is the amount $1,315.50 a credit or refund to the customer, not a charge?",
      { exact: true },
    )
    .first()
    .waitFor();
  await centerRequest(
    item.getByRole("article", { name: "Request is-credit", exact: true }),
  );
  await page.screenshot({
    path: join(output, "credit-flow.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  for (const caseId of [
    "boundary",
    "below",
    "none",
    "phoneNone",
    "emailNone",
    "empty",
  ]) {
    await runCase(caseId);
    const text = await result.textContent();
    if (caseId === "boundary")
      assert.ok(
        text.includes("charge · P(credit) = 0.5") &&
          text.includes("credit · P(credit) = 0.501"),
      );
    if (caseId === "below")
      assert.ok(text.includes("charge · P(credit) = 0.499"));
    if (caseId === "none" || caseId === "phoneNone")
      assert.ok(text.includes("No value to normalize"));
    if (caseId === "empty")
      assert.ok(text.includes("No candidates · no requests"));
    await page.screenshot({
      path: join(output, `${caseId}.png`),
      fullPage: true,
    });
  }
  const rejected = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const base = {
      scenario: "flow-extraction",
      mode: "sample",
      extractionCase: "email",
      message: "changed",
      runId: crypto.randomUUID(),
    };
    const changed = await fetch(`/__jev/run?session=${session}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(base),
    });
    const live = await fetch(`/__jev/run?session=${session}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...base,
        mode: "live",
        extractionCase: "empty",
        message: "No amounts are listed in this document.",
        runId: crypto.randomUUID(),
      }),
    });
    return { changed: changed.status, live: live.status };
  });
  assert.equal(rejected.changed, 400);
  assert.ok([400, 409].includes(rejected.live));
  await page.setViewportSize({ width: 390, height: 844 });
  await runCase("money");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: join(output, "mobile-money.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify(
      {
        status: "passed",
        cases: [
          "email",
          "phone",
          "money",
          "boundary",
          "below",
          "none",
          "phoneNone",
          "emailNone",
          "empty",
        ],
        checks: [
          "deep link",
          "fixed input",
          "sample-only mode",
          "result UI",
          "nested selection and credit request inspection",
          "server rejects edited documents and live mode",
          "mobile overflow",
        ],
        errors,
        rejected,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Pre-parsed extraction browser checks passed: ${output}`);
} catch (error) {
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify({ status: "failed", error: String(error) }, null, 2) + "\n",
  );
  throw error;
} finally {
  await cleanup();
}
