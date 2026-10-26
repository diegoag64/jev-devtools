// Run from repository root after build:package, while holding the shared cookbook verification lock.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const output = resolve("benchmarks/results/twitch-browser");
await mkdir(output, { recursive: true });
const server = await createServer({
  root: resolve("apps/playground"),
  configFile: resolve("apps/playground/vite.config.ts"),
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: output },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let runs = 0;
  page.on("request", (request) => {
    if (request.url().includes("/__jev/run?")) runs++;
  });
  await page.goto("http://127.0.0.1:4182/?cookbook=twitch-chat-filter");
  await page
    .getByRole("heading", { name: "One feed, five visible actions" })
    .waitFor();
  await page.screenshot({
    path: resolve(output, "before-run.png"),
    fullPage: true,
  });
  assert.equal(
    await page.getByLabel("Context", { exact: true }).getAttribute("readonly"),
    "",
  );
  assert.equal(
    await page.locator('#transport option[value="live"]').isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  const result = page.getByRole("region", {
    name: "Twitch chat filter result",
  });
  await result
    .getByRole("heading", { name: "Normal chat", exact: true })
    .waitFor();
  assert.equal(await result.locator(".twitch-message").count(), 29);
  assert.equal(await result.locator(".twitch-highlight").count(), 6);
  assert.equal(await result.locator(".twitch-hide").count(), 7);
  assert.equal(await result.locator(".twitch-blur").count(), 2);
  assert.equal(
    await result
      .locator(".twitch-hide")
      .first()
      .getByText("go left, there's a site of grace behind the tree", {
        exact: false,
      })
      .isVisible(),
    false,
  );
  const contrast = await result
    .locator(".twitch-highlight")
    .first()
    .evaluate((element) => {
      const luminance = (color) => {
        const rgb = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const foreground = luminance(
        getComputedStyle(element.querySelector("p")).color,
      );
      const background = luminance(getComputedStyle(element).backgroundColor);
      return (
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05)
      );
    });
  assert.ok(contrast >= 4.5, `Highlighted preview contrast: ${contrast}`);
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "normal-chat.png"),
    fullPage: true,
  });
  const countBefore = runs;
  await result.getByRole("checkbox").check();
  assert.equal(runs, countBefore);
  assert.equal(await result.locator(".twitch-dim").count(), 8);
  assert.equal(await result.locator(".twitch-hide").count(), 13);
  await page.screenshot({
    path: resolve(output, "quiet-chat.png"),
    fullPage: true,
  });
  await result
    .getByText("Inspect message 5 and synthetic answers", { exact: true })
    .click();
  assert.equal(
    await result
      .locator(".twitch-message")
      .nth(4)
      .getByText("go left, there's a site of grace behind the tree", {
        exact: false,
      })
      .isVisible(),
    true,
  );
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  await page.getByRole("button", { name: "View Flow", exact: true }).click();
  await page
    .getByRole("article", { name: "Request classify-message", exact: true })
    .waitFor();
  await page
    .getByLabel("Flow step", { exact: true })
    .last()
    .selectOption("classify-message");
  await page.screenshot({ path: resolve(output, "message-flow.png") });
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page
    .getByLabel("Twitch sample", { exact: true })
    .selectOption("boundaries");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await result
    .getByRole("heading", { name: "Normal chat", exact: true })
    .waitFor();
  assert.equal(await result.locator(".twitch-message").count(), 9);
  await result
    .getByText("Inspect message 2 and synthetic answers", { exact: true })
    .click();
  await result
    .getByText("Toxic Noul: 0.7000 · Spoiler Noul: 0.9000", { exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(output, "boundaries.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await result.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: resolve(output, "mobile.png"),
    fullPage: true,
  });
  // Exercise HTTP guards directly, independently of disabled browser controls.
  const session = await page.evaluate(() =>
    sessionStorage.getItem("jev-inspector-session"),
  );
  const endpoint = `http://127.0.0.1:4182/__jev/run?session=${session}`;
  const body = {
    scenario: "flow-twitch",
    mode: "sample",
    twitchCase: "original",
    message: "edited",
    runId: crypto.randomUUID(),
  };
  const invalid = await page.request.post(endpoint, {
    headers: { origin: "http://127.0.0.1:4182" },
    data: body,
  });
  assert.equal(invalid.status(), 400);
  const live = await page.request.post(endpoint, {
    headers: { origin: "http://127.0.0.1:4182" },
    data: {
      ...body,
      mode: "live",
      message:
        "Elden Ring first playthrough! No spoilers please — original 29-message feed.",
    },
  });
  assert.ok([400, 409].includes(live.status()));
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(
      {
        status: "passed",
        messages: 29,
        normal: { show: 14, highlight: 6, hide: 7, blur: 2 },
        quiet: { dim: 8, hide: 13, highlight: 6, blur: 2 },
        boundaries: 9,
        quietAdditionalRuns: 0,
        highlightContrast: contrast,
        invalidStatus: invalid.status(),
        liveStatus: live.status(),
        errors,
      },
      null,
      2,
    ),
  );
  await page.close();
  console.log(`Twitch browser checks passed; evidence: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
