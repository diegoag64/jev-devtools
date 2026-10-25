import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";
import { chromium } from "playwright";

const app = fileURLToPath(new URL("..", import.meta.url));
const configFile = resolve(app, "vite.config.ts");
const evidence = resolve(app, "../../benchmarks/results/docs/rendering");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];

// Delay real external scripts until after inspecting the visible page. This
// exposes CSS/theme flashes without relying on a fast machine hiding the race.
async function verifyBeforeScripts(url, mode) {
  for (const scenario of [
    { saved: "dark", system: "light" },
    { saved: "light", system: "dark" },
    { saved: null, system: "dark" },
    { saved: null, system: "light", blockedStorage: true },
  ]) {
    const theme = scenario.saved ?? scenario.system;
    const label = `${mode}-${scenario.saved ?? "system"}-${scenario.system}${scenario.blockedStorage ? "-blocked-storage" : ""}`;
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: scenario.system,
    });
    await context.addInitScript(({ saved, blockedStorage }) => {
      if (blockedStorage) {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage unavailable", "SecurityError");
          },
        });
      } else if (saved) localStorage.setItem("jev-docs-theme", saved);
    }, scenario);
    let scripts = Promise.withResolvers();
    await context.route("**/*", async (route) => {
      if (route.request().resourceType() === "script") await scripts.promise;
      await route.continue().catch(() => {}); // A case may close while requests are held.
    });
    const page = await context.newPage();
    try {
      const requested = page.waitForRequest(
        (request) => request.resourceType() === "script",
      );
      await page.goto(url, { waitUntil: "commit" });
      await requested;
      for (const [index, title] of ["Introduction", "Quick start"].entries()) {
        if (index) {
          scripts = Promise.withResolvers();
          const navigation = page.waitForURL("**/getting-started/", {
            waitUntil: "commit",
          });
          await page
            .getByRole("navigation", { name: "Documentation", exact: true })
            .getByRole("link", { name: "Quick start", exact: true })
            .click({ noWaitAfter: true });
          await navigation;
        }
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const appearance = await page.evaluate(() => ({
          scheme: getComputedStyle(document.documentElement).colorScheme,
          font: getComputedStyle(document.querySelector("main")).fontFamily,
          canvas: getComputedStyle(document.documentElement).backgroundColor,
        }));
        await page.screenshot({
          path: resolve(evidence, `${label}-${index}.png`),
        });
        try {
          assert.equal(
            appearance.scheme,
            theme,
            `${label}: correct theme before deferred scripts`,
          );
          assert.match(
            appearance.font,
            /sans-serif/i,
            `${label}: document styled before deferred scripts`,
          );
          const channels =
            appearance.canvas.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
          assert.equal(channels.length, 3);
          assert.ok(
            channels.every((channel) =>
              theme === "dark" ? channel < 80 : channel > 200,
            ),
            `${label}: document canvas matches the theme (${appearance.canvas})`,
          );
        } catch (error) {
          failures.push(
            `${title}: ${error.message}; observed ${JSON.stringify(appearance)}`,
          );
        }
        scripts.resolve();
        await page.waitForLoadState("load");
      }
    } finally {
      scripts.resolve();
      await context.close();
    }
  }
}

try {
  const dev = await createServer({
    configFile,
    server: { host: "127.0.0.1", port: 0 },
    clearScreen: false,
  });
  try {
    await dev.listen();
    await verifyBeforeScripts(dev.resolvedUrls.local[0], "development");
  } finally {
    await dev.close();
  }
  const built = await preview({
    configFile,
    preview: { host: "127.0.0.1", port: 0 },
  });
  try {
    await verifyBeforeScripts(built.resolvedUrls.local[0], "production");
  } finally {
    await new Promise((resolve, reject) =>
      built.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, [], failures.join("\n"));
console.log(
  "Initial paint and link navigation stay styled with deferred scripts in development and production; saved light/dark themes, system preference, and unavailable storage verified.",
);
