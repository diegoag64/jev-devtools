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
  const github = page.getByRole("link", { name: "GitHub repository", exact: true });
  const stars = page.locator(".github-stars");
  assert.equal(await github.getAttribute("href"), "https://github.com/diegoag64/jev-devtools");
  assert.equal(await stars.getAttribute("href"), null, "The count is not an action");
  assert.equal(await stars.getAttribute("role"), "img");
  await github.focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("button", { name: "Switch color theme" }).evaluate((button) => button === document.activeElement), true, "The statistic is not a tab stop");
  const countColor = await stars.evaluate((element) => getComputedStyle(element).color);
  await stars.hover();
  assert.equal(await stars.evaluate((element) => getComputedStyle(element).color), countColor, "The count has no action hover state");
  assert.match(await stars.getAttribute("aria-label"), /^(?:[\d,]+ GitHub stars|GitHub star count unavailable)$/);
  assert.ok(!initialRequests.some((url) => new URL(url).hostname.endsWith("github.com")), "GitHub header makes no visitor-side requests");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await github.isVisible() && await stars.isVisible(), "GitHub controls remain visible on phones");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Header fits ${width}px`);
      await page.locator(".topbar").screenshot({ path: resolve(evidence, `github-header-${theme}-${width}.png`) });
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.setViewportSize({ width: 1440, height: 1050 });
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
  // Exercise delivered HTML and real interactions, including clean copy output.
  const flowSource = (
    await readFile(resolve(app, "examples/flow.ts"), "utf8")
  ).trim();
  await page.goto(origin + base + "guides/flows/");
  const branch = page.getByRole("button", {
    name: "branch: API help",
    exact: true,
  });
  const tooltip = page.getByRole("tooltip");
  await branch.hover();
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /choosing one of two paths/);
  assert.match(
    await tooltip.innerText(),
    /The path used when the condition is true/,
  );
  await tooltip.hover();
  assert.equal(
    await tooltip.isVisible(),
    true,
    "The tooltip stays open when the pointer enters it",
  );
  await page.screenshot({ path: resolve(evidence, "flow-hover-dark.png") });
  await page.keyboard.press("Escape");
  assert.equal(await tooltip.count(), 0, "Escape dismisses the tooltip");
  for (const name of [
    "classification",
    "flow",
    "message",
    "team",
    "billing",
    "inspector",
  ]) {
    assert.equal(
      await page
        .getByRole("button", { name: `${name}: API help`, exact: true })
        .count(),
      0,
      `${name} is ordinary example code, not API help`,
    );
  }
  assert.equal(
    await page
      .getByRole("button", { name: "jev: API help", exact: true })
      .count(),
    1,
    "The method has help; the imported client variable does not",
  );
  const state = page
    .getByRole("button", {
      name: "state: API help",
      exact: true,
    })
    .first();
  await state.scrollIntoViewIfNeeded();
  await state.focus();
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Context sent to Jev/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await tooltip.waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).trim(),
    flowSource,
  );
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await branch.hover();
  await tooltip.waitFor();
  await page.screenshot({ path: resolve(evidence, "flow-hover-light.png") });
  await page.keyboard.press("Escape");
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touchPage = await touch.newPage();
  await touchPage.goto(origin + base + "guides/flows/");
  await touchPage
    .getByRole("button", { name: "branch: API help", exact: true })
    .tap();
  const touchTooltip = touchPage.getByRole("tooltip");
  await touchTooltip.waitFor();
  const bounds = await touchTooltip.boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 390 &&
      bounds.y >= 0 &&
      bounds.y + bounds.height <= 844,
    "Touch tooltip fits the viewport",
  );
  await touchPage.screenshot({
    path: resolve(evidence, "flow-hover-mobile.png"),
  });
  await touchPage.getByRole("button", { name: "Copy code", exact: true }).tap();
  assert.equal(
    await touchTooltip.count(),
    0,
    "Tapping outside dismisses the tooltip",
  );
  await touch.close();
  // Exercise each new API family through the delivered pages. Shared focus,
  // touch and dismissal behavior is covered above; here verify meaning/scope.
  const examples = [
    {
      route: "api/react/",
      file: "client.tsx",
      marker: "export function Root",
      term: "enabled",
      meaning: /browser inspector/,
      excluded: ["Root", "DEV"],
    },
    {
      route: "api/server/",
      file: "server.ts",
      marker: "export const inspector",
      term: "enabled",
      meaning: /server capture/,
      excluded: ["apiKey", "inspector", "NODE_ENV"],
    },
    {
      route: "api/recorder/",
      file: "recorder.ts",
      marker: "new JevRecorder",
      term: "instrument",
      meaning: /systemOne calls/,
      excluded: ["TypeSafeClient", "fetch", "sessions", "has"],
    },
    {
      route: "api/flow/",
      file: "operations.ts",
      marker: "const doubled",
      term: "run",
      meaning: /resolved input and task context/,
      excluded: ["values", "reduce", "target", "value"],
    },
    {
      route: "api/flow/",
      file: "replay.ts",
      marker: "export async function replayExample",
      term: "replayClient",
      meaning: /without a key or inference call/,
      excluded: ["fixture", "classify", "team", "billing", "probabilities"],
    },
  ];
  for (const example of examples) {
    await page.goto(origin + base + example.route);
    const block = page
      .locator(".code-block")
      .filter({ hasText: example.marker });
    await block
      .getByRole("button", { name: `${example.term}: API help`, exact: true })
      .first()
      .hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), example.meaning);
    for (const name of example.excluded)
      assert.equal(
        await block
          .getByRole("button", { name: `${name}: API help`, exact: true })
          .count(),
        0,
        `${example.file}: ${name} stays ordinary code`,
      );
    if (example.file === "client.tsx" || example.file === "server.ts")
      await page.screenshot({
        path: resolve(
          evidence,
          `api-help-${example.file.replace(/\./g, "-")}.png`,
        ),
      });
    await page.keyboard.press("Escape");
    await block.getByRole("button", { name: "Copy code", exact: true }).click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).trim(),
      (await readFile(resolve(app, "examples", example.file), "utf8")).trim(),
      `Copy ${example.file} without tooltip text`,
    );
  }
  for (const example of [
    {
      route: "api/flow/",
      term: "maxIterations",
      meaning: /FlowLoopLimitError/,
    },
    {
      route: "api/flow/",
      term: "then",
      marker: "const doubled",
      meaning: /Return an expression for its value/,
    },
    { route: "api/server/", term: "run", meaning: /recording scope/ },
    { route: "guides/nextjs/", term: "handleNodeRoute", meaning: /Check Host/ },
    { route: "guides/privacy/", term: "redact", meaning: /captured copy/ },
    { route: "api/expressions/", term: "get", meaning: /Select a field/ },
    { route: "api/flow/", term: "parallel", meaning: /lanes concurrently/ },
  ]) {
    await page.goto(origin + base + example.route);
    const area = example.marker
      ? page.locator(".code-block").filter({ hasText: example.marker })
      : page;
    await area
      .getByRole("button", { name: `${example.term}: API help`, exact: true })
      .first()
      .hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), example.meaning);
    await page.keyboard.press("Escape");
  }
  await page.goto(origin + base + "getting-started/");
  const sdkExample = page
    .locator(".code-block")
    .filter({ hasText: "export async function classifyMessage" });
  assert.equal(
    await sdkExample.locator("[data-type-info]").count(),
    0,
    "SDK-only request code has no Jev API hovers",
  );
  await sdkExample
    .getByRole("button", { name: "Copy code", exact: true })
    .click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).trim(),
    (await readFile(resolve(app, "examples/request.ts"), "utf8")).trim(),
  );
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
  // The glossary must be reachable from both prose and code, and search must
  // land on the requested method rather than the start of the long page.
  await page.goto(origin + base + "guides/flow-basics/");
  const outline = page.getByRole("navigation", { name: "On this page" });
  await outline.getByRole("link", { name: "map()", exact: true }).click();
  assert.ok(page.url().endsWith("#map-repeat-a-recipe-for-each-item"), "Compact labels preserve existing section links");
  await page.screenshot({ path: resolve(evidence, "flow-method-interfaces.png") });
  await page.locator(".code-references").getByRole("link", { name: "flow.map()", exact: true }).click();
  await page.waitForURL("**/api/reference/#flow-map");
  assert.equal(await page.locator("#flow-map").getByRole("heading", { level: 3 }).textContent(), "flow.map#");
  await page.getByRole("button", { name: "Search documentation" }).click();
  await page.getByRole("searchbox").fill("flow.task");
  await page.locator("#search-results").getByRole("link", { name: "flow.task API reference", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/api/reference/#flow-task");
  assert.equal(await page.locator("#search-dialog").evaluate((dialog) => dialog.open), false, "Same-page API search closes the dialog");
  // Reading location follows native anchors, scrolling in either direction,
  // and history; a long method must stay current after its heading scrolls away.
  const expectLocation = async (hash) => {
    await page.waitForFunction((hash) =>
      document.querySelector('.toc [aria-current="location"]')?.getAttribute("href") === hash, hash);
    assert.equal(await outline.locator('[aria-current="location"]').count(), 1);
  };
  await expectLocation("#flow-task");
  const taskEntry = page.getByRole("region", { name: /^flow.task/ });
  const checkHeaderCorners = async (entry, square) => {
    const corners = await entry.locator("header").evaluate(async (header) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const style = getComputedStyle(header);
      return [parseFloat(style.borderTopLeftRadius), parseFloat(style.borderTopRightRadius)];
    });
    assert.ok(corners.every((radius) => square ? radius === 0 : radius > 0),
      square ? "Sticky headers have square top corners" : "Headers at the card start retain rounded corners");
  };
  await checkHeaderCorners(taskEntry, false);
  const taskInputs = taskEntry.getByRole("heading", { name: /^Inputs/, level: 4 });
  await taskInputs.getByRole("link").focus();
  await page.keyboard.press("Enter");
  const inputBounds = await taskInputs.boundingBox();
  const headerBounds = await taskEntry.locator("header").boundingBox();
  assert.ok(inputBounds.y >= headerBounds.y + headerBounds.height,
    "Subsection permalinks clear the sticky method header");
  await page.evaluate(() => window.scrollBy(0, 450));
  await expectLocation("#flow-task");
  await checkHeaderCorners(taskEntry, true);
  await page.screenshot({ path: resolve(evidence, "sticky-header-square.png") });
  const hashBeforeScroll = new URL(page.url()).hash;
  await page.locator("#flow-jev").evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await expectLocation("#flow-jev");
  assert.equal(new URL(page.url()).hash, hashBeforeScroll, "Reading does not rewrite history");
  await page.locator("#flow-task").evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await expectLocation("#flow-task");
  await checkHeaderCorners(taskEntry, false);
  await outline.getByRole("link", { name: "map()", exact: true }).click();
  await page.waitForURL("**/#flow-map");
  await expectLocation("#flow-map");
  await page.goBack();
  await expectLocation("#flow-task");
  // Section progress must move within a method, not just on heading changes.
  await page.goto(origin + base + "api/reference/#adapter-handle");
  await expectLocation("#adapter-handle");
  const serverTrack = outline.locator(".toc-group").filter({ has: page.locator('summary a[href="#server-adapter"]') }).locator(".toc-methods");
  const paintedProgress = () => serverTrack.evaluate((track) => {
    const style = getComputedStyle(track, "::before");
    return style.content === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m22;
  });
  const settleScroll = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const initialProgress = await paintedProgress();
  assert.ok(initialProgress > 0 && initialProgress < 1, "A direct method link initializes partial section progress");
  const progressHash = new URL(page.url()).hash;
  await page.evaluate(() => scrollBy(0, 300));
  await settleScroll();
  await expectLocation("#adapter-handle");
  const laterProgress = await paintedProgress();
  assert.ok(laterProgress > initialProgress, "The colored track advances inside a long method");
  await page.screenshot({ path: resolve(evidence, "outline-progress-light.png") });
  await page.locator(".theme-toggle").click();
  await page.screenshot({ path: resolve(evidence, "outline-progress-dark.png") });
  await page.locator(".theme-toggle").click();
  await page.evaluate(() => scrollBy(0, -300));
  await settleScroll();
  assert.ok(await paintedProgress() < laterProgress, "The colored track retreats when scrolling upward");
  assert.equal(new URL(page.url()).hash, progressHash, "Section progress does not change history");
  await page.locator("#server-adapter").evaluate((heading) => scrollTo(0, scrollY + heading.closest(".reference-group").getBoundingClientRect().top - innerHeight / 2));
  await settleScroll();
  assert.ok(await paintedProgress() < 0.001, "The track stays empty before entering the section");
  await page.locator("#flow-definitions-and-steps").evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await settleScroll();
  assert.equal(await paintedProgress(), 1, "The track is full after leaving the section");
  await page.goto(origin + base + "api/reference/#type-flowbuilder");
  await expectLocation("#type-flowbuilder");
  const activeBounds = await outline.locator('[aria-current="location"]').boundingBox();
  assert.ok(activeBounds.y >= 76 && activeBounds.y + activeBounds.height <= 1050,
    "Long groups keep the active method visible in the outline");
  // Upward navigation must target the stationary card, not its displaced
  // sticky heading. Check both sidebar links and native scrollIntoView.
  const assertTypeStartVisible = async (reader) => {
    const entry = reader.getByRole("region", { name: /^Type: JevDevtoolsProps/ });
    const header = await entry.locator("header").boundingBox();
    const description = await entry.locator("p").first().boundingBox();
    const topbar = await reader.locator(".topbar").boundingBox();
    assert.ok(description.y >= Math.max(header.y + header.height, topbar.y + topbar.height)
      && description.y + description.height < reader.viewportSize().height,
      "Upward type navigation reveals the description below both headers");
  };
  for (const viaSidebar of [true, false, true]) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expectLocation("#supporting-structural-types");
    if (viaSidebar) {
      await outline.locator("summary").filter({ hasText: "Public types" }).click();
      await outline.getByRole("link", { name: "JevDevtoolsProps", exact: true }).click();
    } else {
      await page.locator("#type-jevdevtoolsprops").evaluate((target) => target.scrollIntoView({ block: "start" }));
    }
    await expectLocation("#type-jevdevtoolsprops");
    await assertTypeStartVisible(page);
  }
  await page.screenshot({ path: resolve(evidence, "type-anchor-after.png") });

  await page.goto(origin + base + "api/reference/#jevrecorder");
  const recorderEntry = page.getByRole("region", { name: /^JevRecorder/ });
  const signature = recorderEntry.locator(".code-block").filter({ hasText: "new JevRecorder(options?" });
  const captureToken = signature.getByRole("button", { name: "CaptureOptions: API help", exact: true });
  await captureToken.hover();
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /limit[\s\S]*50[\s\S]*redact/);
  assert.ok((await tooltip.innerText()).includes("jev-devtools/server"));
  await page.screenshot({ path: resolve(evidence, "capture-options-help.png") });
  await page.keyboard.press("Escape");
  await captureToken.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await tooltip.waitFor();
  await page.keyboard.press("Escape");
  await signature.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).trim(),
    "new JevRecorder(options?: CaptureOptions): JevRecorder", "Type help stays out of copied signatures");
  assert.equal(await signature.getByRole("button", { name: "options: API help", exact: true }).count(), 0);

  await page.goto(origin + base + "api/reference/#type-jevdevtoolsserveroptions");
  const serverType = page.getByRole("region", { name: /^Type: JevDevtoolsServerOptions/ });
  await serverType.getByText("Exact TypeScript declaration", { exact: true }).click();
  await serverType.getByRole("button", { name: "CaptureOptions: API help", exact: true }).hover();
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /captured copy/);
  await page.keyboard.press("Escape");

  const typeTouchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const typeTouch = await typeTouchContext.newPage();
  await typeTouch.goto(origin + base + "api/reference/#jevrecorder");
  await typeTouch.getByRole("region", { name: /^JevRecorder/ }).getByRole("button", { name: "CaptureOptions: API help", exact: true }).tap();
  const typeTouchPopup = typeTouch.locator('.type-popup:not([hidden])');
  await typeTouchPopup.waitFor();
  const typeBox = await typeTouchPopup.boundingBox();
  assert.ok(typeBox.x >= 0 && typeBox.x + typeBox.width <= 390 && typeBox.y >= 0 && typeBox.y + typeBox.height <= 844);
  await typeTouch.screenshot({ path: resolve(evidence, "capture-options-help-mobile.png") });
  await typeTouch.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await typeTouch.locator("#type-jevdevtoolsprops").evaluate((target) => target.scrollIntoView({ block: "start" }));
  await assertTypeStartVisible(typeTouch);
  await typeTouch.goto(origin + base + "api/reference/#flow-task");
  const mobileTask = typeTouch.getByRole("region", { name: /^flow.task/ });
  await checkHeaderCorners(mobileTask, false);
  await typeTouch.evaluate(() => scrollBy(0, 450));
  await checkHeaderCorners(mobileTask, true);
  await typeTouch.screenshot({ path: resolve(evidence, "sticky-header-square-mobile.png") });
  await mobileTask.evaluate((entry) => entry.scrollIntoView({ block: "start" }));
  await checkHeaderCorners(mobileTask, false);
  await typeTouchContext.close();

  await page.goto(origin + base + "api/reference/#flow-task");
  await expectLocation("#flow-task");
  await page.screenshot({ path: resolve(evidence, "api-glossary.png") });
  await page.goto(origin + base + "guides/flow-basics/#map-repeat-a-recipe-for-each-item");
  await expectLocation("#map-repeat-a-recipe-for-each-item");
  await page.screenshot({ path: resolve(evidence, "flow-basics.png") });
  // The published changelog is a readable static document, including release
  // anchors from GitHub and source-relative links; no visitor fetch is needed.
  await page.goto(origin + base + "changelog/");
  await page.getByRole("heading", { name: "0.4.1", exact: false }).waitFor();
  await page.locator(".release-overview summary").click();
  await page.locator(".release-overview").getByRole("link", { name: "0.4.1", exact: true }).click();
  assert.ok(page.url().endsWith("#041--october-24-2026-experimental"));
  assert.ok(await page.getByRole("link", { name: "release verification and recovery record" }).count());
  assert.equal(
    await page.getByRole("link", { name: "release verification and recovery record" }).getAttribute("href"),
    "https://github.com/diegoag64/jev-devtools/blob/main/docs/releases.md#release-041--published-october-24-2026",
  );
  await page.goto(origin + base + "changelog/");
  await page.screenshot({ path: resolve(evidence, "changelog-desktop.png") });
  const categorizedChangelog = (await readFile(resolve(root, "raw/changelog.md"), "utf8")).includes("#### Fixed");
  const categoryNav = page.getByRole("navigation", { name: "Changes in 0.4.1", exact: true });
  if (categorizedChangelog) {
    await categoryNav.getByRole("link", { name: /^Fixed/ }).click();
    assert.ok(page.url().endsWith("#041--october-24-2026-experimental-fixed"));
    await page.screenshot({ path: resolve(evidence, "changelog-categories.png") });
    await page.getByRole("button", { name: "Switch color theme" }).click();
    await page.screenshot({ path: resolve(evidence, "changelog-categories-dark.png") });
    await page.getByRole("button", { name: "Switch color theme" }).click();
    await page.goto(origin + base + "changelog/");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(evidence, "changelog-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Changelog fits mobile");
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
  await readable.goto(origin + base + "guides/flows/");
  assert.equal(
    (await readable.locator(".code-block > pre > code").innerText()).trim(),
    flowSource,
    "The complete example stays readable without JavaScript",
  );
  await readable.goto(origin + base + "guides/flow-basics/");
  await readable.locator(".code-references").getByRole("link", { name: "flow.task()", exact: true }).first().click();
  assert.ok(readable.url().endsWith("/api/reference/#flow-task"));
  const contract = readable.getByRole("region", { name: /^Type: TaskContext/ });
  await contract.getByText("Exact TypeScript declaration", { exact: true }).click();
  assert.ok((await contract.innerText()).includes("executionId"));
  await readable.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await readable.locator("#type-jevdevtoolsprops").evaluate((target) => target.scrollIntoView({ block: "start" }));
  await assertTypeStartVisible(readable);
  for (const route of ["api/reference/", "guides/flow-basics/"]) {
    await readable.goto(origin + base + route);
    assert.ok(await readable.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} fits mobile without JS`);
    await readable.locator("#main").scrollIntoViewIfNeeded();
    await readable.screenshot({ path: resolve(evidence, route.startsWith("api") ? "api-glossary-mobile.png" : "flow-basics-mobile.png") });
  }
  await readable.goto(origin + base + "changelog/");
  await readable.getByRole("heading", { name: "Unreleased", exact: false }).waitFor();
  assert.ok((await readable.locator("article").innerText()).includes("Not published to npm"));
  if (categorizedChangelog) {
    await readable.getByRole("navigation", { name: "Changes in 0.4.1", exact: true }).getByRole("link", { name: /^Fixed/ }).click();
    assert.ok(readable.url().endsWith("#041--october-24-2026-experimental-fixed"));
  }
  assert.deepEqual(errors, []);
  console.log(
    `Verified ${links.length} pages, sample switching, lazy search, keyboard navigation, copy, persistent theme, mobile layout, raw Markdown, 404s, type hovers (pointer/keyboard/touch), clean copying, and no-JS reading at base ${base}.`,
  );
  console.log(`Screenshots: ${evidence}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
