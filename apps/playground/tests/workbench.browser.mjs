import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { browserOutputURL } from "../../../scripts/cookbook-browser-context.mjs";

// New workbench coverage complements the retained request-lab recipe checks.
const output = browserOutputURL();
await mkdir(output, { recursive: true });
const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
let browser;
const errors = [];
const observed = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    recordVideo: {
      dir: new URL("video/", output).pathname,
      size: { width: 1600, height: 1100 },
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4182/");
  await page
    .getByRole("heading", { name: "Confidence fallback", exact: true })
    .waitFor();
  await page.locator(".wb-diagram-panel .flow-step").first().waitFor();
  const links = await page
    .getByRole("navigation", { name: "Cookbooks", exact: true })
    .getByRole("link")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        title: node.textContent.replace("↗", "").trim(),
        href: node.getAttribute("href"),
      })),
    );
  assert.equal(links.length, 19);
  for (const { title, href } of links) {
    await page.goto("http://127.0.0.1:4182/" + href);
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    const steps = page
      .getByRole("navigation", { name: "Cookbook steps" })
      .getByRole("button");
    await steps.first().waitFor();
    await page.locator(".wb-diagram-panel .flow-step").first().waitFor();
    const slug = new URL(href, "http://localhost").searchParams.get("cookbook");
    const recipe = await (
      await fetch(
        `http://127.0.0.1:4182/__jev/cookbooks/${slug}?session=00000000-0000-4000-8000-000000000000`,
      )
    ).json();
    const full = await page.locator(".wb-diagram-panel .flow-step").count();
    assert.ok(full > 0, title);
    const count = await steps.count();
    await page
      .getByRole("button", { name: "Step-by-step guide", exact: true })
      .click();
    let previous = 0;
    for (let index = 0; index < count; index++) {
      await steps.nth(index).click();
      const expected = recipe.steps
        .slice(0, index + 1)
        .flatMap((step) => step.nodeIds).length;
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector(".wb-diagram-panel .jev-flow-viewer")
            ?.shadowRoot?.querySelectorAll(".flow-step").length === expected,
        expected,
      );
      const visible = await page
        .locator(".wb-diagram-panel .flow-step")
        .count();
      assert.ok(
        visible > previous,
        `${title}: diagram grows at stage ${index}`,
      );
      previous = visible;
      assert.equal(await page.locator(".wb-narrative a").count(), 1);
      assert.ok(
        (await page.locator(".flow-step[data-highlighted]").count()) > 0,
      );
    }
    assert.equal(previous, full, title);
    await page.getByRole("button", { name: "Previous", exact: false }).click();
    assert.ok(
      (await page.locator(".wb-diagram-panel .flow-step").count()) < full,
    );
    await page
      .getByRole("button", { name: "Complete flow", exact: true })
      .click();
    assert.equal(
      await page.locator(".wb-diagram-panel .flow-step").count(),
      full,
    );
    await page
      .getByRole("button", { name: "Run sample ↗", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Sample complete" })
      .waitFor({ timeout: 120_000 });
    await page
      .locator(".wb-diagram-panel")
      .getByText("Sample · success", { exact: true })
      .waitFor();
    assert.ok(
      (await page.getByText("Application result", { exact: true }).count()) > 0,
      title,
    );
    observed.push({ title, stages: count, nodes: full, run: "success" });
    console.log(`${title}: ${count} stages, sample passed`);
  }
  await page.goto("http://127.0.0.1:4182/?cookbook=confidence-fallback");
  await page.locator(".wb-diagram-panel .flow-step").first().waitFor();
  await page
    .getByRole("button", { name: "Inspect code at line 51", exact: true })
    .click();
  assert.equal(
    await page
      .locator('[data-node-id="classify-industry"]')
      .getAttribute("data-highlighted"),
    "true",
  );
  await page
    .getByRole("button", {
      name: "Step confident-group, if, not run",
      exact: true,
    })
    .click();
  assert.ok(await page.locator('[data-line="61"].is-selected').count());
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await page
    .locator(".wb-narrative-content")
    .evaluate((node) =>
      Promise.all(
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  await page
    .locator(".wb-diagram-panel .flow-overview-canvas")
    .evaluate((node) =>
      Promise.all(
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  await page.screenshot({
    path: new URL("walkthrough.png", output).pathname,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next step →", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: false }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".wb-diagram-panel .flow-step")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("button", { name: "Complete flow", exact: true })
    .click();
  await page.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Sample complete" })
    .waitFor();
  await page
    .getByRole("button", { name: /Step classify-industry, jev, completed/ })
    .click();
  assert.ok(
    (await page.locator(".flow-request").count()) > 0,
    "actual captured request diagram is embedded",
  );
  await page.screenshot({
    path: new URL("complete-flow.png", output).pathname,
    fullPage: true,
  });
  await page
    .getByLabel("Cookbook sample")
    .selectOption({ label: "At cutoff · 0.900 → industry group" });
  assert.equal(
    await page.getByText("Application result", { exact: true }).count(),
    0,
    "changing samples clears old result",
  );
  await page.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Sample complete" })
    .waitFor();
  assert.match(
    await page.locator(".wb-bottom").innerText(),
    /"level": "group"/,
  );
  await page.goto("http://127.0.0.1:4182/?cookbook=rag-passages");
  await page
    .getByRole("navigation", { name: "Cookbook steps" })
    .getByRole("button")
    .nth(1)
    .click();
  await page.locator(".wb-nested summary").click();
  await page.locator(".wb-nested .flow-step").first().waitFor();
  await page.goto(
    "http://127.0.0.1:4182/?cookbook=hierarchical-classification",
  );
  await page.getByLabel("Cookbook sample").selectOption("limit");
  await page.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "FlowLoopLimitError" })
    .waitFor();
  await page
    .locator(".wb-diagram-panel")
    .getByText("Sample · error", { exact: true })
    .waitFor();
  await page.goto("http://127.0.0.1:4182/?cookbook=parallel-questions");
  await page.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Sample cancelled" })
    .waitFor();
  await page
    .locator(".wb-diagram-panel")
    .getByText("Sample · cancelled", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByText("Application result", { exact: true }).count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "mobile has no page-level horizontal overflow",
  );
  await page.screenshot({
    path: new URL("mobile.png", output).pathname,
    fullPage: true,
  });
  await page.getByLabel("Find a cookbook").fill("not-a-cookbook");
  await page.getByText("No matching cookbooks.", { exact: true }).waitFor();
  await page.goto("http://127.0.0.1:4182/?cookbook=missing");
  await page.getByRole("alert").waitFor();
  // Public export lifecycle and style isolation, independent of cookbook data.
  await page.addInitScript(() => {
    window.viewerSources = { opened: 0, closed: 0 };
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(...args) {
        super(...args);
        window.viewerSources.opened++;
      }
      close() {
        window.viewerSources.closed++;
        super.close();
      }
    };
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  const unsafeRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.invalid"))
      unsafeRequests.push(request.url());
  });
  await page.goto("http://127.0.0.1:4182/tests/viewer.html");
  await page
    .getByLabel("Connection", { exact: true })
    .filter({ hasText: "disabled" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.viewerSources.opened), 0);
  await page
    .getByRole("button", { name: "Toggle connection", exact: true })
    .click();
  await page
    .getByLabel("Connection", { exact: true })
    .filter({ hasText: "connected" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.viewerSources.opened), 2);
  await page
    .getByRole("button", { name: "Toggle connection", exact: true })
    .click();
  await page
    .getByLabel("Connection", { exact: true })
    .filter({ hasText: "disabled" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.viewerSources.closed), 2);
  await page
    .getByRole("button", { name: "Toggle connection", exact: true })
    .click();
  await page
    .getByLabel("Connection", { exact: true })
    .filter({ hasText: "connected" })
    .waitFor();
  await page
    .getByRole("button", { name: "Invalid endpoint", exact: true })
    .click();
  await page
    .getByLabel("Connection", { exact: true })
    .filter({ hasText: "same-origin" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.viewerSources.closed), 4);
  assert.deepEqual(unsafeRequests, []);
  await page
    .getByRole("button", { name: "Toggle captured run", exact: true })
    .click();
  await page
    .locator(".flow-step")
    .getByText("[redacted]", { exact: true })
    .waitFor();
  assert.ok(
    !(await page.locator(".flow-step").innerText()).includes(
      "sample@example.com",
    ),
  );
  assert.match(
    await page.getByLabel("Original input").innerText(),
    /sample@example.com/,
  );
  assert.notEqual(
    await page
      .locator(".flow-step button")
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(255, 0, 0)",
    "host important styles cannot enter the shadow viewer",
  );
  await page
    .getByRole("button", { name: "Toggle visible nodes", exact: true })
    .click();
  await page.locator(".flow-step").waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Unmount subscription", exact: true })
    .click();
  assert.equal(await page.getByLabel("Connection", { exact: true }).count(), 0);
  const motion = await browser.newContext({
    viewport: { width: 1600, height: 1400 },
    recordVideo: {
      dir: new URL("motion/", output).pathname,
      size: { width: 1600, height: 1400 },
    },
  });
  const clip = await motion.newPage();
  await clip.goto("http://127.0.0.1:4182/?cookbook=confidence-fallback");
  await clip
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  for (const index of [0, 1, 2, 3, 2]) {
    await clip
      .getByRole("navigation", { name: "Cookbook steps" })
      .getByRole("button")
      .nth(index)
      .click();
    await clip
      .locator(".flow-overview-canvas")
      .evaluate((node) =>
        Promise.all(
          node
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    await clip
      .locator(".wb-narrative-content")
      .evaluate((node) =>
        Promise.all(
          node
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
  }
  const video = clip.video();
  await motion.close();
  await video.saveAs(new URL("walkthrough.webm", output).pathname);
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify({ observed, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await server.close();
}
