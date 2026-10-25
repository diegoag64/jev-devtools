import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const app = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(app, "dist");
const base = process.env.DOCS_BASE ?? "/";
const evidence = resolve(app, "../../benchmarks/results/docs");
await mkdir(evidence, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".md": "text/plain",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith(base)) throw new Error("Not found");
    let file = resolve(root, pathname.slice(base.length) || ".");
    if (file !== root && !file.startsWith(root + sep))
      throw new Error("Not found");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.setHeader(
      "content-type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    colorScheme: "light",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const initialRequests = [];
  page.on("request", (r) => initialRequests.push(r.url()));
  assert.equal((await page.goto(origin + base)).status(), 200);
  await page.getByRole("button", { name: "Delivery sample" }).click();
  assert.equal(await page.locator("[data-result]").textContent(), "Delivery");
  assert.ok(
    !initialRequests.some((url) => url.endsWith("search-index.json")),
    "Search must stay lazy",
  );
  await page.screenshot({ path: resolve(evidence, "desktop-viewport.png") });
  await page.screenshot({
    path: resolve(evidence, "desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Search documentation" }).click();
  await page.getByRole("searchbox").fill("createClient");
  const result = page
    .locator("#search-results")
    .getByRole("link", { name: "Server adapter API reference" });
  await result.waitFor();
  await result.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/api/server/");
  assert.equal(await page.locator("h1").textContent(), "Server adapter");
  await page
    .getByRole("button", { name: "Copy code", exact: true })
    .first()
    .click();
  assert.ok(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      "createJevDevtools",
    ),
  );
  await page.keyboard.press("Control+k");
  assert.equal(await page.locator("dialog").evaluate((e) => e.open), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog").evaluate((e) => e.open), false);
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    path: resolve(evidence, "dark-reference.png"),
    fullPage: true,
  });
  const links = await page
    .locator("#sidebar nav a")
    .evaluateAll((nodes) => nodes.map((n) => n.href));
  for (const url of links) {
    assert.equal((await page.goto(url)).status(), 200, url);
    assert.equal(await page.locator("h1").count(), 1, url);
    const internal = await page
      .locator("a[href]")
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.href)
          .filter((url) => url.startsWith(location.origin)),
      );
    for (const target of new Set(internal)) {
      const response = await context.request.get(target);
      assert.equal(response.status(), 200, target);
      const hash = new URL(target).hash;
      if (hash)
        assert.ok(
          (await response.text()).includes(
            `id="${decodeURIComponent(hash.slice(1))}"`,
          ),
          `Broken anchor: ${target}`,
        );
    }
    const markdown = page.getByRole("link", { name: "Read as Markdown" });
    assert.equal(
      (
        await context.request.get(
          new URL(await markdown.getAttribute("href"), page.url()).href,
        )
      ).status(),
      200,
    );
  }
  assert.equal(
    (await page.goto(origin + base + "missing-page/")).status(),
    404,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + base);
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .locator("#sidebar")
    .getByRole("link", { name: "Quick start", exact: true })
    .click();
  await page.waitForURL("**/getting-started/");
  assert.equal(await page.locator("h1").textContent(), "Quick start");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal overflow on mobile",
  );
  await page.screenshot({
    path: resolve(evidence, "mobile.png"),
    fullPage: true,
  });
  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const readable = await noJS.newPage();
  await readable.goto(origin + base + "api/react/");
  assert.equal(await readable.locator("h1").textContent(), "JevDevtools");
  await readable
    .getByRole("navigation", { name: "Documentation", exact: true })
    .getByRole("link", { name: "Quick start", exact: true })
    .click();
  assert.ok(readable.url().endsWith("/getting-started/"));
  assert.deepEqual(errors, []);
  console.log(
    `Verified ${links.length} pages, sample switching, lazy search, keyboard navigation, copy, persistent theme, mobile layout, raw Markdown, 404s, and no-JS reading at base ${base}.`,
  );
  console.log(`Screenshots: ${evidence}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
