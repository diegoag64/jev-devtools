import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Run from the repository root, after building the package. Caller holds the
// shared cookbook verification lock; this script owns and cleans up its server.
const output = new URL(
  "../../../benchmarks/results/consistency-nouls/",
  import.meta.url,
);
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    new URL("../../../node_modules/vite/bin/vite.js", import.meta.url).pathname,
    "--host",
    "127.0.0.1",
    "--strictPort",
  ],
  {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TYPESAFE_API_KEY: "" },
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
  await writeFile(new URL("server.log", output), log);
};
process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));
process.once("SIGTERM", () => void cleanup().finally(() => process.exit(143)));
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt === 100)
      throw Error("Server did not start: " + log);
    try {
      if ((await fetch("http://127.0.0.1:4182/")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: new URL("video/", output).pathname },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4182/?cookbook=consistency-nouls");
  await page
    .getByRole("heading", { name: "Keep uncertainty visible." })
    .waitFor();
  assert.equal(await page.locator("#scenario").inputValue(), "flow-nouls");
  assert.equal(await page.locator("#context").getAttribute("readonly"), "");
  await page.screenshot({
    path: new URL("before.png", output).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("heading", { name: "Every probability. Every decision." })
    .waitFor();
  assert.equal(await page.locator(".noul-matrix tbody td").count(), 210);
  await page
    .getByText("Descriptive statistics of these fixtures", { exact: true })
    .click();
  await page.getByText("Repeat 11 ·", { exact: false }).click();
  await page.getByText("synthetic-noul-b", { exact: true }).first().waitFor();
  await page.screenshot({
    path: new URL("variation.png", output).pathname,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page
    .getByLabel("Flow step", { exact: true })
    .selectOption("repeat-rubric");
  const collection = page.getByRole("article", {
    name: "Collection 15 sequential rubric requests",
    exact: true,
  });
  await collection
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  const request = page.getByRole("article", {
    name: "Request ask-rubric",
    exact: true,
  });
  await request
    .getByLabel("Diagram question", { exact: true })
    .selectOption("subrogation");
  assert.equal(
    await request
      .getByLabel("Diagram question", { exact: true })
      .locator("option")
      .count(),
    14,
  );
  await page
    .getByLabel("Collection item for 15 sequential rubric requests", {
      exact: true,
    })
    .selectOption("14");
  await request.waitFor();
  await page.screenshot({
    path: new URL("flow-repeat-15.png", output).pathname,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.locator("#noul-case").selectOption("boundaries");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("heading", { name: "Every probability. Every decision." })
    .waitFor();
  const first = page.locator(".noul-matrix tbody tr").first();
  assert.match(await first.locator("td").nth(2).innerText(), /0.3\s+uncertain/);
  assert.match(await first.locator("td").nth(6).innerText(), /0.7\s+uncertain/);
  assert.match(await first.locator("td").nth(7).innerText(), /0.701\s+yes/);
  await page.screenshot({
    path: new URL("boundaries.png", output).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const table = page.getByRole("region", { name: "All 210 Noul answers" });
  await table.scrollIntoViewIfNeeded();
  await table.focus();
  await page.keyboard.press("End");
  assert.ok(await table.evaluate((el) => el.scrollWidth > el.clientWidth));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: new URL("mobile.png", output).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#noul-case").selectOption("stable");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page
    .getByRole("heading", { name: "Every probability. Every decision." })
    .waitFor();
  assert.equal(
    await page.locator('.noul-matrix td[data-decision="uncertain"]').count(),
    0,
  );
  // Fixed-input and live restrictions are enforced at the actual HTTP boundary.
  const rejected = await page.evaluate(async () => {
    const session = sessionStorage.getItem("jev-inspector-session");
    const send = async (body) => {
      const response = await fetch(`/__jev/run?session=${session}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: crypto.randomUUID(),
          scenario: "flow-nouls",
          mode: "sample",
          noulCase: "stable",
          message: document.querySelector("#context").value,
          ...body,
        }),
      });
      return response.status;
    };
    return [
      await send({ message: "changed" }),
      await send({ mode: "live" }),
      await send({ noulCase: "unknown" }),
    ];
  });
  assert.deepEqual(rejected, [400, 400, 400]);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify(
      {
        cases: ["variation", "boundaries", "stable"],
        answers: 210,
        httpRejections: rejected,
        pageErrors: errors,
        viewportChecks: ["1440x1000", "390x844"],
        liveInference: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Noul cookbook browser verification passed; evidence: " + output.pathname,
  );
} finally {
  await cleanup();
}
