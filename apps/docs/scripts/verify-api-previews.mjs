import assert from "node:assert/strict";
import { resolve } from "node:path";

// Existing hover checks exercise code tokens, not navigational reference links.
// These checks protect previews without losing native links, reader position,
// or access to contracts when a fragment fails to load.
export async function verifyApiPreviews({ browser, origin, base, evidence }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const url = origin + base + "guides/nextjs/";
  const link = page
    .locator('.code-references a[data-api-preview="getjevdevtools"]')
    .first();
  const trigger = page
    .locator('.code-references a[data-api-preview="getjevdevtools"] + button')
    .first();
  const popup = page.getByRole("dialog", { name: "API preview", exact: true });
  const panel = page.locator(".api-reference-panel");
  try {
    await page.goto(url);
    assert.ok(await link.count(), "API reference links offer previews");
    await trigger.waitFor();
    assert.ok(
      !requests.some((url) => /api-preview-index|api-previews\//.test(url)),
      "Reference content is loaded on demand",
    );
    await link.hover();
    await popup.getByText("getJevDevtools", { exact: true }).waitFor();
    assert.match(await popup.innerText(), /module reloads/);
    await popup.getByRole("button", { name: "Read in side panel" }).hover();
    assert.ok(
      await popup.isVisible(),
      "Preview stays open while moving onto actions",
    );
    await page.screenshot({ path: resolve(evidence, "api-link-preview.png") });
    const before = await page.evaluate(() => scrollY);
    await popup.getByRole("button", { name: "Read in side panel" }).click();
    await panel
      .getByRole("heading", { name: "getJevDevtools", exact: true })
      .waitFor();
    await panel.getByRole("heading", { name: /^Returns/ }).waitFor();
    assert.equal(page.url(), url, "Panel keeps the guide URL");
    assert.equal(
      await page.evaluate(() => scrollY),
      before,
      "Panel keeps the guide scroll position",
    );
    await panel.locator(".copy-code").first().click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /getJevDevtools/,
    );
    await panel
      .getByRole("button", {
        name: "JevDevtoolsServerOptions: API help",
        exact: true,
      })
      .first()
      .hover();
    await panel
      .getByRole("tooltip")
      .filter({ hasText: "JevDevtoolsServerOptions" })
      .waitFor();
    await panel.getByRole("button", { name: "Close API reference" }).hover();
    await page.keyboard.press("Shift+Tab");
    assert.ok(
      await panel.evaluate((el) => el.contains(document.activeElement)),
      "Modal keeps keyboard focus inside the panel",
    );
    await page.screenshot({
      path: resolve(evidence, "api-reference-panel.png"),
    });
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    assert.ok(
      await trigger.evaluate((el) => el === document.activeElement),
      "Closing returns focus to its trigger",
    );
    assert.equal(await page.evaluate(() => scrollY), before);
    assert.ok(
      !(await popup.isVisible()),
      "Focus restoration does not reopen the preview",
    );

    // Keyboard access keeps Enter on the original link as native navigation.
    await link.focus();
    await popup.waitFor();
    await page.keyboard.press("Tab");
    assert.ok(await trigger.evaluate((el) => el === document.activeElement));
    await page.keyboard.press("Enter");
    assert.ok(
      await popup
        .getByRole("button", { name: "Read in side panel" })
        .evaluate((el) => el === document.activeElement),
    );
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    await link.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(origin + base + "api/reference/#getjevdevtools");

    // Loading on the glossary itself must not duplicate existing IDs.
    await page
      .locator('article a[data-api-preview="adapter-createclient"] + button')
      .first()
      .click();
    await popup.getByRole("button", { name: "Read in side panel" }).click();
    await panel.getByRole("heading", { name: /^Returns/ }).waitFor();
    const ids = await page
      .locator("[id]")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(
      ids.length,
      new Set(ids).size,
      "Panel fragment IDs are namespaced",
    );
    await panel.getByRole("link", { name: "Open full reference" }).click();
    await page.waitForURL(
      origin + base + "api/reference/#adapter-createclient",
    );
    await panel.waitFor({ state: "hidden" });

    // A failed metadata request leaves both navigation and fragment reading available.
    await page.route("**/api-preview-index.json", (route) => route.abort());
    await page.goto(url);
    await trigger.click();
    await popup.getByText(/Preview could not load/).waitFor();
    assert.equal(
      await popup
        .getByRole("link", { name: "Open reference" })
        .getAttribute("href"),
      origin + base + "api/reference/#getjevdevtools",
    );
    await page.route("**/api-previews/getjevdevtools.html", (route) =>
      route.abort(),
    );
    await popup.getByRole("button", { name: "Read in side panel" }).click();
    await panel.getByRole("button", { name: "Try again" }).waitFor();
    await page.unroute("**/api-previews/getjevdevtools.html");
    await panel.getByRole("button", { name: "Try again" }).click();
    await panel.getByRole("heading", { name: /^Returns/ }).waitFor();
    await panel.getByRole("button", { name: "Close API reference" }).click();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: "dark",
  });
  touch.setDefaultTimeout(15000);
  try {
    const page = await touch.newPage();
    await page.goto(url);
    const trigger = page
      .locator('.code-references a[data-api-preview="getjevdevtools"] + button')
      .first();
    await trigger.tap();
    const popup = page.getByRole("dialog", {
      name: "API preview",
      exact: true,
    });
    await popup.getByRole("button", { name: "Read in side panel" }).tap();
    const panel = page.locator(".api-reference-panel");
    await panel.getByRole("heading", { name: /^Returns/ }).waitFor();
    const box = await panel.boundingBox();
    assert.ok(box.x >= 0 && box.width <= 390, "Mobile panel fits the viewport");
    await page.screenshot({
      path: resolve(evidence, "api-reference-panel-mobile.png"),
    });
    await panel.getByRole("button", { name: "Close API reference" }).tap();
    await panel.waitFor({ state: "hidden" });
  } finally {
    await touch.close();
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  noJS.setDefaultTimeout(15000);
  try {
    const page = await noJS.newPage();
    await page.goto(url);
    assert.equal(await page.locator(".api-preview-trigger").count(), 0);
    await page
      .locator('.code-references a[data-api-preview="getjevdevtools"]')
      .first()
      .click();
    await page.waitForURL(origin + base + "api/reference/#getjevdevtools");
    await page.locator("#getjevdevtools").waitFor();
  } finally {
    await noJS.close();
  }
  console.log(
    `Verified API previews, panel reading/copy, native links, keyboard/touch, focus, failed-load recovery, and preserved reader position at ${base}.`,
  );
}
