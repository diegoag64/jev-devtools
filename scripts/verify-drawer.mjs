import { checkSelection } from "./check-selection.mjs";
import { checkChoice } from "./check-choice.mjs";
import { checkQuestions } from "./check-questions.mjs";
import { checkStyleIsolation } from "./check-style-isolation.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";

// Exercise the public component and real adapter with deterministic SDK samples.
// Optional BENCH_CLIENT_ENTRY/BENCH_SERVER_ENTRY allow a pre-fix negative control.
const port = process.env.JEV_VERIFY_PORT || "4220";
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["benchmarks/browser-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    BENCH_PORT: port,
    BENCH_LIVE: "1",
    BENCH_PROFILE: "0",
  },
});
let log = "";
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
let browser;
const cleanup = async () => {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
};
process.once("SIGINT", () => {
  void cleanup().finally(() => process.exit(130));
});
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt === 120)
      throw new Error("Drawer test server failed: " + log);
    try {
      const response = await fetch(url + "/bench/info");
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1710, height: 961 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let messages = [];
  cdp.on("Network.eventSourceMessageReceived", (event) =>
    messages.push(event.data),
  );
  await page.goto(url);
  await page.waitForFunction(() =>
    document.getElementById("status").textContent.startsWith("Ready"),
  );
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(resolve, 120)),
          ),
        ),
    );
  const load = async (scenario, closed = false) => {
    const closeButton = page.getByRole("button", {
      name: "Close Jev DevTools",
      exact: true,
    });
    if (await closeButton.isVisible()) await closeButton.click();
    await page.selectOption("#scenario", scenario);
    await page.locator("#closed").setChecked(closed);
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/bench/results") && r.request().method() === "POST",
    );
    await Promise.all([saved, page.click("#load")]);
    await page.waitForFunction(
      (text) => document.getElementById("status").textContent === text,
      "Loaded " + scenario,
    );
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const close = async () => {
    await button("Close Jev DevTools").click();
    await settle();
  };
  const open = async () => {
    await button("Open Jev DevTools").click();
    await settle();
  };
  const requestId = () =>
    page.locator(".detail-meta code").last().textContent();
  const pulse = async (scenario) => {
    messages = [];
    const result = await page.evaluate(async () =>
      (await fetch("/bench/pulse", { method: "POST" })).json(),
    );
    const id = result.completed[scenario];
    assert.ok(id, "The real adapter completed a sample request");
    for (let i = 0; !messages.some((m) => m.includes(id)); i++) {
      assert.ok(i < 100, "The completed trace was delivered over SSE");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await settle();
    return id;
  };
  const ui = () =>
    page.evaluate(() => {
      const s = document.querySelector("jev-devtools-root").shadowRoot;
      return {
        requestId: s.querySelector(".detail-meta code:last-child")?.textContent,
        search: s.querySelector('[aria-label="Search requests"]').value,
        status: s.querySelector('[aria-label="Filter request status"]').value,
        tab: s.querySelector('.detail-tabs [aria-pressed="true"]')?.textContent,
        question: s.querySelector('[aria-label="Diagram question"]')?.value,
        flow: [...s.querySelectorAll("button")].find((b) =>
          /^(Play|Pause) flow$/.test(b.textContent),
        )?.textContent,
        transform: s.querySelector(".lab-flow-canvas")?.style.transform,
        height: s.querySelector(".jev-drawer").style.height,
      };
    });

  await checkStyleIsolation({ page, load, close, open, settle });
  await load("max-history");
  await page.locator(".request-row").nth(3).click();
  await page.getByLabel("Search requests", { exact: true }).fill("Sample");
  await page
    .getByLabel("Filter request status", { exact: true })
    .selectOption("success");
  await button("Expand Jev drawer").click();
  await button("Zoom diagram in").click();
  await page.locator(".lab-flow-viewport").press("ArrowRight");
  await settle();
  const before = await ui();
  await close();
  const html = await page.locator(".jev-inspector").innerHTML();
  const svgTime = await page.locator("svg.lab-connections").evaluate((svg) => {
    return { paused: svg.animationsPaused(), time: svg.getCurrentTime() };
  });
  const latest = await pulse("max-history");
  assert.ok(
    (await page.locator(".jev-inspector").innerHTML()) === html,
    "Incoming traces must not mutate the hidden inspector",
  );
  assert.equal(svgTime.paused, true, "Hidden flow animations are suspended");
  assert.equal(
    await page
      .locator("svg.lab-connections")
      .evaluate((svg) => svg.getCurrentTime()),
    svgTime.time,
    "Hidden SVG timeline does not advance",
  );
  await open();
  assert.deepEqual(
    await ui(),
    before,
    "Pinned trace, filters, camera and drawer dimensions survive hidden updates",
  );
  assert.equal(
    await page
      .locator("svg.lab-connections")
      .evaluate((svg) => svg.animationsPaused()),
    false,
  );
  // New captures are present even when an older request remains selected.
  await page.locator(".request-row").first().click();
  assert.equal(await requestId(), latest);
  await button("Context").click();
  const context = await ui();
  await close();
  await pulse("max-history");
  await open();
  assert.deepEqual(
    await ui(),
    context,
    "Selected detail tab and filters survive reopening",
  );
  await close();
  messages = [];
  await page.evaluate(() =>
    fetch("/api/max-history/clear", { method: "DELETE" }),
  );
  for (let i = 0; !messages.length; i++) {
    assert.ok(i < 100, "Clear was delivered over SSE");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await settle();
  await open();
  assert.equal(
    await page.locator(".request-row").count(),
    0,
    "Cleared traces are not resurrected on reopen",
  );
  assert.equal(await page.locator(".detail-meta").count(), 0);

  await checkQuestions({ page, load, close, open, settle, pulse });

  await load("many-questions");
  await page
    .getByLabel("Diagram question", { exact: true })
    .selectOption("question_7");
  await button("Pause flow").click();
  await button("Zoom diagram in").click();
  await page.locator(".lab-flow-viewport").press("ArrowDown");
  await settle();
  const question = await ui();
  await close();
  await open();
  assert.deepEqual(
    await ui(),
    question,
    "Question selection and paused flow survive reopening",
  );
  assert.equal(await page.locator("animateMotion").count(), 0);
  // This fixture retains one trace: a hidden update evicts the pinned selection.
  await page.locator(".request-row").click();
  await close();
  const replacement = await pulse("many-questions");
  await open();
  assert.equal(
    await requestId(),
    replacement,
    "An evicted selection falls back to the current trace",
  );

  await load("small", true);
  assert.equal(
    await page.locator(".jev-inspector").count(),
    0,
    "Initially closed drawers defer mounting the inspector",
  );
  const first = await pulse("small");
  assert.equal(
    await page.locator(".jev-inspector").count(),
    0,
    "Capture does not mount an unopened inspector",
  );
  await open();
  assert.equal(await requestId(), first, "First open shows the latest capture");
  await page.locator(".lab-flow-viewport").press("Escape");
  await settle();
  assert.equal(
    await button("Open Jev DevTools").evaluate(
      (el) => el.getRootNode().activeElement === el,
    ),
    true,
  );
  await open();
  assert.equal(
    await button("Close Jev DevTools").evaluate(
      (el) => el.getRootNode().activeElement === el,
    ),
    true,
  );
  await checkSelection({ page, load, settle, pulse });
  await checkChoice({ page, load });
  await page.screenshot({ path: "benchmarks/results/drawer-reopened.png" });
  assert.deepEqual(errors, [], "No browser errors");
  console.log(
    "Drawer verified: hidden updates, suspended SVG, selection, filters, tabs, question, camera, flow, size, clear, eviction, lazy mount and focus.",
  );
} finally {
  await cleanup();
}
