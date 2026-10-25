import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

// Compose the real landing page in the browser; no duplicated diagram or artwork.
// An optional output path keeps review captures under benchmarks/results/.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.argv[2] ?? "docs/assets/jevtools-readme-hero.png");
const server = await createServer({
  root: resolve(root, "landing"),
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 820 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator("#diagram .flow-node").first().waitFor();

  // Select by the authored flow's title, so reordering the carousel is harmless.
  const count = await page.locator(".flow-caption-item").count();
  for (let index = 0; index < count; index++) {
    if ((await page.locator("#diagram title").textContent()).startsWith("Hierarchical search")) break;
    await page.getByRole("button", { name: "Next flow", exact: true }).click();
  }
  if (!(await page.locator("#diagram title").textContent()).startsWith("Hierarchical search")) {
    throw new Error("The landing page no longer contains the hierarchical search example.");
  }

  await page.addStyleTag({ content: `
    /* Capture-only composition. The shipped landing page is unchanged. */
    .site-header, .site-footer, .skip-link,
    main > section:not(.hero):not(.flow-stage),
    .hero-description, .hero-actions, .flow-caption, .mobile-hint { display: none; }
    .hero.wrap { width: 100%; padding: 68px 0 0; }
    .hero h1 { font-size: 96px; line-height: 1.08; margin: 0; }
    .flow-stage.wrap { width: 1340px; margin: 82px auto 0; }
    .diagram-scroll { overflow: visible; }
  ` });
  await page.evaluate(async () => {
    // Carousel controls can scroll into view during selection; capture from the top.
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector("#diagram").setAttribute("viewBox", "0 80 1140 355");
    await document.fonts.ready;
    // Use the landing's jade painter at one fixed time, without randomized transitions.
    const { jade } = await import("/src/hero-effects/effects/prism.ts");
    const { mountHeroEffect } = await import("/src/hero-effects/renderer.ts");
    const original = document.querySelector(".hero h1 > span");
    const title = document.createElement("span");
    title.textContent = original.firstChild.textContent;
    original.replaceWith(title);
    mountHeroEffect(title, (ctx, width, height) => jade(ctx, width, height, 6.3));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, animations: "disabled" });
  console.log(`Captured landing heading and simulated hierarchical flow: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
