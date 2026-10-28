import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { browserOutputURL } from "../../../scripts/cookbook-browser-context.mjs";

// Navigation crosses URL, fetch, execution and mounted viewer boundaries. The
// other workbench checks open fresh pages and cannot catch shell replacement.
const output = browserOutputURL();
await mkdir(output, { recursive: true });
const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
let browser, context;
const errors = [];
const releases = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: new URL("./motion", output).pathname },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message));
  const base = "http://127.0.0.1:4182";
  const a = "confidence-fallback",
    b = "rag-passages",
    c = "guardrails";
  const link = (slug) =>
    page.locator(`.wb-library a[href="?cookbook=${slug}"]`);
  const ready = async (slug) => {
    await page
      .locator(`.wb-recipe[data-cookbook="${slug}"][data-pending="false"]`)
      .waitFor();
    await page
      .locator(".wb-diagram-panel .flow-step")
      .first()
      .waitFor({ state: "attached" });
  };
  const navigate = async (slug) => {
    if (!(await link(slug).isVisible()))
      await page
        .getByRole("button", { name: "Toggle cookbook library" })
        .click();
    await link(slug).click();
  };
  // Release responses explicitly: network timing is not the correctness oracle.
  const held = new Map();
  const fixtures = new Map();
  for (const slug of [a, b, c]) {
    const response = await page.request.get(
      `${base}/__jev/cookbooks/${slug}?session=00000000-0000-4000-8000-000000000000`,
    );
    assert.equal(response.status(), 200);
    fixtures.set(slug, await response.json());
  }
  let requests = [];
  await page.route("**/__jev/cookbooks/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("sample")) return route.continue();
    const slug = url.pathname.split("/").at(-1);
    requests.push(slug);
    const gate = held.get(slug);
    const status = gate ? await gate.promise : 200;
    await route
      .fulfill({
        status,
        json:
          status === 200 ? fixtures.get(slug) : { error: "Test load failure" },
      })
      .catch(() => {});
  });
  function hold(slug) {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    releases.push(release);
    held.set(slug, { promise });
    return (status = 200) => {
      held.delete(slug);
      release(status);
    };
  }
  const first = hold(a);
  await page.goto(`${base}/?cookbook=${a}`);
  await page.locator(".wb-skeleton-panels").waitFor();
  await page.locator(".wb-run-status").filter({ hasText: "Opening" }).waitFor();
  await page.screenshot({ path: new URL("first-load.png", output).pathname });
  first();
  await ready(a);
  await page.getByLabel("Find a cookbook").fill("a");
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await page.getByRole("button", { name: "Next step", exact: false }).click();
  await page
    .getByRole("button", { name: "Step comments", exact: true })
    .click();
  await page.getByRole("separator").press("ArrowRight");
  const share = await page.getByRole("separator").getAttribute("aria-valuenow");
  await page.evaluate(() => {
    window.shell = [
      ".wb-library",
      ".wb-toolbar",
      ".wb-timeline",
      ".wb-runbar",
      ".wb-panels",
      ".wb-divider",
      ".wb-code-panel",
      ".wb-diagram-panel",
    ].map((s) => document.querySelector(s));
    window.bounds = window.shell.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    });
  });
  const stable = async () =>
    assert.equal(
      await page.evaluate(() => window.shell.every((node) => node.isConnected)),
      true,
      "Navigation must retain shell DOM nodes",
    );
  const stableGeometry = async () =>
    assert.deepEqual(
      await page.evaluate(() =>
        window.shell.map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }),
      ),
      await page.evaluate(() => window.bounds),
    );
  const slow = hold(b);
  await navigate(b);
  assert.equal(await link(b).getAttribute("aria-current"), "page");
  await stable();
  assert.equal(
    await page.locator(".wb-recipe").getAttribute("data-cookbook"),
    a,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Run sample", exact: false })
      .isEnabled(),
    false,
  );
  assert.equal(
    (await page.locator(".wb-run-status").innerText()).includes("Opening"),
    false,
    "Fast window has no loading copy",
  );
  await page.locator(".wb-run-status").filter({ hasText: "Opening" }).waitFor();
  await stableGeometry();
  await page.waitForFunction(
    () =>
      Number(getComputedStyle(document.querySelector(".wb-source")).opacity) <
      1,
  );
  await page.screenshot({ path: new URL("slow-pending.png", output).pathname });
  // Observe actual fade frames, without animation hooks in production.
  await page.evaluate(() => {
    window.frames = [];
    const tick = () => {
      const source = document.querySelector(".wb-source");
      window.frames.push({
        slug: document.querySelector(".wb-recipe").dataset.cookbook,
        opacity: getComputedStyle(source).opacity,
      });
      if (window.frames.length < 50) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  slow();
  await ready(b);
  await page.waitForFunction(() => window.frames.length === 50);
  const frames = await page.evaluate(() => window.frames);
  assert.ok(
    frames.some(
      (frame) =>
        frame.slug === b &&
        Number(frame.opacity) > 0.6 &&
        Number(frame.opacity) < 1,
    ),
    "New content fades in",
  );
  await writeFile(
    new URL("fade-frames.json", output),
    JSON.stringify(frames, null, 2),
  );
  await stable();
  await stableGeometry();
  assert.equal(await page.getByLabel("Find a cookbook").inputValue(), "a");
  assert.equal(
    await page
      .getByRole("button", { name: "Step-by-step guide", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .locator(".wb-timeline button")
      .first()
      .getAttribute("aria-current"),
    "step",
  );
  assert.equal(
    await page.getByLabel("Cookbook sample").inputValue(),
    Object.keys(fixtures.get(b).samples)[0],
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Step comments", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.getByRole("separator").getAttribute("aria-valuenow"),
    share,
  );
  assert.equal(
    await page.locator(".wb-toolbar-links > a").getAttribute("href"),
    fixtures.get(b).originalSource,
  );
  await page
    .getByRole("button", { name: "Cookbook overview", exact: true })
    .click();
  assert.equal(
    await page.locator("#cookbook-overview-title").innerText(),
    await link(b)
      .innerText()
      .then((text) => text.replace("↗", "").trim()),
  );
  await page.keyboard.press("Escape");
  await page.screenshot({ path: new URL("after-ready.png", output).pathname });
  // Fast responses do not introduce a loading message or replace frames.
  await page.evaluate(() => {
    window.loadingMessages = [];
    window.statusObserver = new MutationObserver(() =>
      window.loadingMessages.push(
        document.querySelector(".wb-run-status").textContent,
      ),
    );
    window.statusObserver.observe(document.querySelector(".wb-run-status"), {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await navigate(a);
  await ready(a);
  await stable();
  assert.deepEqual(
    await page.evaluate(() =>
      window.loadingMessages.filter((text) => text.includes("Opening")),
    ),
    [],
  );
  await page.evaluate(() => window.statusObserver.disconnect());
  // A stale success/failure cannot overwrite the latest navigation, even when
  // returning directly to the retained cookbook before its request completes.
  const stale = hold(b);
  await navigate(b);
  await navigate(c);
  await ready(c);
  stale(500);
  await ready(c);
  assert.equal(
    (await page.locator(".wb-run-status").innerText()).includes(
      "Could not open",
    ),
    false,
  );
  const returning = hold(b);
  await navigate(b);
  await navigate(c);
  await ready(c);
  returning();
  assert.equal(
    await page.locator(".wb-recipe").getAttribute("data-cookbook"),
    c,
  );
  const failure = hold(a);
  await navigate(a);
  failure(500);
  await page.getByRole("button", { name: "Try again" }).waitFor();
  await stable();
  assert.equal(
    await page
      .getByRole("button", { name: "Run sample", exact: false })
      .isEnabled(),
    false,
  );
  await page.screenshot({ path: new URL("retry.png", output).pathname });
  await page.getByRole("button", { name: "Try again" }).click();
  await ready(a);
  // Preserve hidden pane choice and comments through normal navigation/history.
  await page
    .getByRole("button", { name: "Show code only", exact: true })
    .click();
  await navigate(b);
  await ready(b);
  assert.equal(
    await page.locator(".wb-panels").getAttribute("data-pane"),
    "code",
  );
  await page.goBack();
  await ready(a);
  await page.goForward();
  await ready(b);
  await page
    .getByRole("button", { name: "Show both panels", exact: true })
    .first()
    .click();
  // History can navigate while a modal owns focus. Keep its close control live.
  await page.getByRole("button", { name: "Expand code", exact: true }).click();
  await page.locator(".wb-source").focus();
  const modalLoad = hold(a);
  await page.goBack();
  await page.waitForFunction(() =>
    document.activeElement?.hasAttribute("data-close-expanded"),
  );
  assert.equal(
    await page.locator(".wb-panels").evaluate((node) => node.matches(":modal")),
    true,
  );
  modalLoad();
  await ready(a);
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".wb-panels").evaluate((node) => node.matches(":modal")),
    false,
  );
  // Navigation aborts an in-flight POST and posts cancellation, despite retaining visuals.
  let releaseRun;
  const runGate = new Promise((resolve) => {
    releaseRun = resolve;
  });
  let runBody, cancelBody;
  await page.route("**/__jev/run?*", async (route) => {
    runBody = route.request().postDataJSON();
    await runGate;
    await route.fulfill({ json: {} }).catch(() => {});
  });
  await page.route("**/__jev/cancel?*", async (route) => {
    cancelBody = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Run sample", exact: false }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
  const cancelLoad = hold(b);
  await navigate(b);
  await page.waitForFunction(
    () =>
      document.querySelector(".wb-recipe").getAttribute("data-pending") ===
      "true",
  );
  for (let i = 0; i < 50 && !cancelBody; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cancelBody?.runId, runBody?.runId);
  assert.ok(cancelBody?.runId);
  releaseRun();
  cancelLoad();
  await ready(b);
  assert.equal(
    await page.getByText("Application result", { exact: true }).count(),
    0,
  );
  // Reduced motion removes both content and indeterminate animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = hold(c);
  await navigate(c);
  await page.locator(".wb-opening-indicator").waitFor();
  assert.equal(
    await page
      .locator(".wb-opening-indicator")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  reduced();
  await ready(c);
  assert.equal(
    await page
      .locator(".wb-source")
      .evaluate((node) => node.getAnimations().length),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".wb-library").waitFor({ state: "hidden" });
  await navigate(a);
  await ready(a);
  assert.equal(await page.locator(".wb-library").isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: new URL("mobile.png", output).pathname });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify(
      {
        passed: true,
        requests,
        checks: [
          "first load",
          "stable shell and geometry",
          "slow/fast",
          "coherent commit",
          "stale failure/success",
          "return",
          "retry",
          "history",
          "view/layout/comments",
          "modal focus",
          "cancellation",
          "reduced motion",
          "mobile",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  releases.forEach((release) => release(500));
  await context?.close();
  await browser?.close();
  await server.close();
}
