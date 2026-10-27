import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { browserOutputURL } from "../../../scripts/cookbook-browser-context.mjs";

const output = browserOutputURL();
const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
const streams = new Set();
server.httpServer.on("request", (request, response) => {
  if (!request.url.startsWith("/api/jev-devtools/")) return;
  if (!new URL(request.url, "http://localhost").pathname.endsWith("/events"))
    return;
  streams.add(response);
  response.once("close", () => streams.delete(response));
});
let browser;
const errors = [];
const origin = "http://127.0.0.1:4182";
async function visibility(page, value) {
  await page.evaluate((next) => {
    window.testVisibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}
async function ready(page) {
  await page.locator(".wb-diagram-panel .flow-step").first().waitFor();
  await page.waitForFunction(
    () => window.streamSnapshots.traces && window.streamSnapshots.flows,
  );
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Headless Chromium treats every page as visible. Supply tab visibility only;
  // EventSource, HTTP/1 connection limits, navigation, and capture remain real.
  await context.addInitScript(() => {
    window.testVisibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      get: () => window.testVisibility,
    });
    window.streamSnapshots = {};
    window.streamOpens = 0;
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(url, options) {
        super(url, options);
        this.addEventListener("open", () => window.streamOpens++);
        this.addEventListener("snapshot", (event) => {
          window.streamSnapshots.traces = JSON.parse(event.data);
        });
        this.addEventListener("flows", (event) => {
          window.streamSnapshots.flows = JSON.parse(event.data);
        });
      }
    };
  });
  const pages = [];
  for (let index = 0; index < 3; index++) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(origin, { timeout: 10000 });
    await ready(page);
    pages.push(page);
  }
  assert.equal(
    streams.size,
    6,
    "Three visible inspectors fill the HTTP/1 pool",
  );
  // Some embedded browsers report background tabs as visible. Navigation must
  // release the outgoing document's streams before fetching its replacement.
  for (const page of pages) {
    await page.reload({ timeout: 10000 });
    await ready(page);
  }
  const active = pages[0];
  await active
    .getByRole("heading", { name: "Confidence fallback", exact: true })
    .click();
  await active.evaluate(() => {
    window.blockLeaving = (event) => event.preventDefault();
    window.addEventListener("beforeunload", window.blockLeaving);
  });
  const cancelled = active
    .waitForEvent("dialog")
    .then((dialog) => dialog.dismiss());
  await active.evaluate(() => location.reload());
  await cancelled;
  await active.evaluate(() =>
    window.removeEventListener("beforeunload", window.blockLeaving),
  );
  await active.waitForFunction(() => window.streamOpens === 4);
  assert.equal(
    streams.size,
    6,
    "Cancelling navigation restores both inspector streams",
  );
  await visibility(pages[1], "hidden");
  await visibility(pages[2], "hidden");
  // Before the fix this navigation remains queued until another tab closes.
  await pages[0].reload({ timeout: 10000 });
  await ready(pages[0]);
  assert.equal(
    streams.size,
    2,
    "Hidden tabs release their server subscriptions",
  );

  await pages[0]
    .getByRole("button", { name: "Run sample ↗", exact: true })
    .click();
  await pages[0].waitForFunction(() =>
    window.streamSnapshots.flows.upserts.some(
      (run) => run.status === "success",
    ),
  );
  const completed = await pages[0].evaluate(
    () =>
      window.streamSnapshots.flows.upserts.find(
        (run) => run.status === "success",
      ).id,
  );
  for (const page of pages.slice(1)) {
    await visibility(pages[0], "hidden");
    await visibility(page, "visible");
    await page.waitForFunction(
      (id) => window.streamSnapshots.flows.upserts.some((run) => run.id === id),
      completed,
    );
    await page.waitForFunction(() =>
      window.streamSnapshots.traces.traces.some(
        (trace) => trace.status === "success",
      ),
    );
    assert.equal(streams.size, 2, "Resuming opens exactly one pair of streams");
    await page.reload({ timeout: 10000 });
    await ready(page);
    await visibility(page, "hidden");
  }
  await visibility(pages[0], "visible");
  await ready(pages[0]);
  await pages[0].screenshot({ path: new URL("multitab.png", output).pathname });
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("multitab.json", output),
    JSON.stringify(
      {
        tabs: 3,
        refresh: "passed",
        resumeCaptures: "passed",
        cancelledNavigation: "passed",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Multiple tabs refresh and recover captures after becoming visible.",
  );
} finally {
  await browser?.close();
  await server.close();
}
