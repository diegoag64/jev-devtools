import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { sourceWithComments } from "../src/workbench/source-comments.ts";
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
async function assertWorkspaceFits(page) {
  const size = await page.evaluate(() => {
    const bounds = (selector) => {
      const { top, bottom, height } = document
        .querySelector(selector)
        .getBoundingClientRect();
      return { top, bottom, height };
    };
    return {
      viewport: innerHeight,
      page: document.documentElement.scrollHeight,
      panels: bounds(".wb-panels"),
      code: bounds(".wb-source"),
      diagram: bounds(".wb-viewer"),
      controls: bounds(".wb-guide-controls"),
      canvasHeight: document
        .querySelector(".wb-diagram-panel .jev-flow-viewer")
        .shadowRoot.querySelector(".flow-overview-viewport").clientHeight,
    };
  });
  assert.ok(
    size.page <= size.viewport + 1,
    `The workspace must fit without page scrolling: ${JSON.stringify(size)}`,
  );
  for (const region of [size.code, size.diagram, size.controls]) {
    assert.ok(
      region.top >= 0 && region.bottom <= size.viewport + 1,
      "Code, diagram, and guide controls stay in view",
    );
    assert.ok(region.height > 0);
  }
  assert.ok(
    size.panels.height >= size.viewport * 0.5,
    "The panels receive at least half the viewport",
  );
  assert.ok(
    size.canvasHeight >= 80,
    `The diagram keeps a usable canvas: ${JSON.stringify(size)}`,
  );
}
async function assertSelectionInView(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector(
        ".wb-diagram-panel .jev-flow-viewer",
      )?.shadowRoot;
      const viewport = root
        ?.querySelector(".flow-overview-viewport")
        ?.getBoundingClientRect();
      const selected = [
        ...(root?.querySelectorAll(".flow-step[data-highlighted]") ?? []),
      ];
      return (
        viewport &&
        selected.length &&
        selected.every((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.left >= viewport.left - 1 &&
            box.right <= viewport.right + 1 &&
            box.top >= viewport.top - 1 &&
            box.bottom <= viewport.bottom + 1
          );
        })
      );
    },
    undefined,
    { timeout: 5000 },
  );
}
async function assertOpeningView(page, name) {
  await page.waitForFunction(() => window.openingFrames.length === 45);
  const opening = await page.evaluate(() => window.openingFrames);
  await writeFile(
    new URL(`${name}-frames.json`, output),
    JSON.stringify(opening, null, 2),
  );
  assert.ok(
    opening.every((frame) => frame.scroll === 0),
    "Loading keeps the source at its first line",
  );
  assert.ok(
    opening.every((frame) => frame.fits),
    "The diagram fits from its first visible frame",
  );
  assert.equal(
    new Set(opening.map((frame) => frame.transform)).size,
    1,
    "The initial camera does not animate or jump",
  );
}
async function assertUserFit(page, { keyboard = false, reduced = false } = {}) {
  const canvas = page.locator(".wb-diagram-panel .flow-overview-canvas");
  const initial = await canvas.evaluate(
    (node) => getComputedStyle(node).transform,
  );
  await page.getByRole("button", { name: "Zoom flow in", exact: true }).click();
  // Camera painting is scheduled for the next frame; wait for the zoom to
  // actually begin before awaiting its transition and testing the return fit.
  await page.waitForFunction((initial) => {
    const node = document
      .querySelector(".wb-diagram-panel .jev-flow-viewer")
      .shadowRoot.querySelector(".flow-overview-canvas");
    return getComputedStyle(node).transform !== initial;
  }, initial);
  await canvas.evaluate((node) =>
    Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  const before = await canvas.evaluate(
    (node) => getComputedStyle(node).transform,
  );
  await canvas.evaluate((node, keyboard) => {
    window.fitFrames = [];
    const viewport = node.closest(".flow-overview-viewport");
    const target = keyboard
      ? viewport
      : [...viewport.querySelectorAll("button")].find(
          (button) => button.textContent === "Fit flow",
        );
    target.addEventListener(
      keyboard ? "keydown" : "click",
      () => {
        const record = () => {
          window.fitFrames.push(getComputedStyle(node).transform);
          if (window.fitFrames.length < 45) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      },
      { once: true },
    );
  }, keyboard);
  if (keyboard) {
    await page.locator(".wb-diagram-panel .flow-overview-viewport").focus();
    await page.keyboard.press("0");
  } else {
    await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  }
  await page.waitForFunction(() => window.fitFrames.length === 45);
  const frames = await page.evaluate(() => window.fitFrames);
  const intermediate = [...new Set(frames)].filter(
    (value) => value !== before && value !== frames.at(-1),
  );
  await writeFile(
    new URL(
      `fit-${keyboard ? "keyboard" : "button"}-${reduced ? "reduced" : "motion"}.json`,
      output,
    ),
    JSON.stringify({ before, frames }, null, 2),
  );
  await page.screenshot({
    path: new URL(
      `fit-${keyboard ? "keyboard" : "button"}-${reduced ? "reduced" : "motion"}.png`,
      output,
    ).pathname,
  });
  assert.notEqual(
    frames.at(-1),
    before,
    "Fit returns the zoomed diagram to its overview",
  );
  if (reduced)
    assert.equal(
      intermediate.length,
      0,
      "Reduced motion fits without intermediate camera positions",
    );
  else
    assert.ok(
      intermediate.length > 2,
      "User-triggered fit must travel through intermediate camera positions instead of jumping",
    );
}

async function assertGuideOwnsSelection(page) {
  await page
    .locator(".wb-diagram-panel .flow-overview-canvas")
    .evaluate((canvas) =>
      Promise.all(
        canvas
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  const selection = () =>
    page.evaluate(() => ({
      step: document.querySelector('.wb-timeline [aria-current="step"]')
        .textContent,
      narration: document.querySelector(".wb-narrative-content").textContent,
      lines: [...document.querySelectorAll(".wb-code-line.is-selected")].map(
        (line) => line.dataset.line,
      ),
      nodes: [
        ...document
          .querySelector(".wb-diagram-panel .jev-flow-viewer")
          .shadowRoot.querySelectorAll(".flow-step[data-highlighted]"),
      ].map((node) => node.dataset.nodeId),
    }));
  const expected = await selection();
  const earlierCode = page.locator('[data-line="32"] > span').last();
  await earlierCode.hover();
  assert.deepEqual(
    await selection(),
    expected,
    "Hovering earlier code leaves the walkthrough step unchanged",
  );
  const bounds = await earlierCode.boundingBox();
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 140, bounds.y + bounds.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  assert.ok(
    await page.evaluate(() => !getSelection().isCollapsed),
    "Guide source remains selectable for copying",
  );
  const actual = await selection();
  await writeFile(
    new URL("guide-selection.json", output),
    JSON.stringify({ expected, actual }, null, 2),
  );
  await page.screenshot({
    path: new URL("guide-selection.png", output).pathname,
  });
  assert.deepEqual(
    actual,
    expected,
    "Selecting earlier code cannot change the guide step, narration, or highlights",
  );
  await page
    .getByLabel("Flow API source", { exact: true })
    .press("Shift+ArrowRight");
  assert.deepEqual(
    await selection(),
    expected,
    "Keyboard text selection cannot change the guide step",
  );
  await page.locator('[data-line="32"] > :first-child').click();
  assert.deepEqual(
    await selection(),
    expected,
    "Line-number clicks cannot navigate the guide",
  );
}
async function assertCommentCopies(page) {
  const detail = await (
    await page.request.get(
      "http://127.0.0.1:4182/__jev/cookbooks/confidence-fallback?session=00000000-0000-4000-8000-000000000000",
    )
  ).json();
  const toggle = page.getByRole("button", {
    name: "Step comments",
    exact: true,
  });
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator(".wb-source-note").count(),
    detail.steps.length,
  );
  const lines = await page
    .locator(".wb-code-line")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.line));
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    sourceWithComments(detail),
  );
  await toggle.press("Space");
  assert.equal(await page.locator(".wb-source-note").count(), 0);
  assert.deepEqual(
    await page
      .locator(".wb-code-line")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.line)),
    lines,
  );
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    detail.source,
  );
  await page.reload();
  await toggle.waitFor();
  assert.equal(
    await toggle.getAttribute("aria-pressed"),
    "false",
    "Comment preference survives a reload",
  );
  await toggle.click();
}

async function assertGuideComments(page) {
  const line = page.locator('[data-line="61"]');
  await line.evaluate((node) =>
    node.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const state = () =>
    page.evaluate(() => ({
      step: document.querySelector(".wb-timeline [aria-current]").textContent,
      selected: [...document.querySelectorAll(".wb-code-line.is-selected")].map(
        (node) => node.dataset.line,
      ),
      diagram: [
        ...document
          .querySelector(".jev-flow-viewer")
          .shadowRoot.querySelectorAll(".flow-step[data-highlighted]"),
      ].map((node) => node.dataset.nodeId),
    }));
  const expected = await state();
  const anchorNumber = await page.locator(".wb-source").evaluate((source) => {
    const top = source.getBoundingClientRect().top;
    return [...source.querySelectorAll(".wb-code-line")].find(
      (row) => row.getBoundingClientRect().bottom > top,
    ).dataset.line;
  });
  const anchor = page.locator(`[data-line="${anchorNumber}"]`);
  const anchorOffset = async () =>
    (await anchor.boundingBox()).y -
    (await page.locator(".wb-source").boundingBox()).y;
  const top = await anchorOffset();
  const toggle = page.getByRole("button", {
    name: "Step comments",
    exact: true,
  });
  await toggle.click();
  assert.deepEqual(
    await state(),
    expected,
    "Hiding comments cannot change guide selection",
  );
  assert.ok(
    Math.abs((await anchorOffset()) - top) <= 2,
    "Hiding notes preserves the source reading position",
  );
  await toggle.click();
  assert.deepEqual(
    await state(),
    expected,
    "Showing comments cannot change guide selection",
  );
  assert.ok(
    Math.abs((await anchorOffset()) - top) <= 2,
    "Showing notes preserves the source reading position",
  );
}

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
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  // Observe painted positions, not effect timing: page-load camera fitting and
  // source scrolling must settle before the first visible frame.
  await page.addInitScript(() => {
    window.openingFrames = [];
    const record = () => {
      const source = document.querySelector(".wb-source");
      const root = document.querySelector(
        ".wb-diagram-panel .jev-flow-viewer",
      )?.shadowRoot;
      const viewport = root?.querySelector(".flow-overview-viewport");
      const canvas = root?.querySelector(".flow-overview-canvas");
      if (source && viewport && canvas && viewport.clientHeight > 0) {
        const frame = canvas.getBoundingClientRect();
        const bounds = viewport.getBoundingClientRect();
        window.openingFrames.push({
          scroll: source.scrollTop,
          transform: getComputedStyle(canvas).transform,
          fits:
            frame.left >= bounds.left - 1 &&
            frame.right <= bounds.right + 1 &&
            frame.top >= bounds.top - 1 &&
            frame.bottom <= bounds.bottom + 1,
        });
      }
      if (window.openingFrames.length < 45) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await page.addInitScript(() => {
    window.previewHistory = {};
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(url, options) {
        super(url, options);
        this.addEventListener("snapshot", (event) => {
          window.previewHistory.requests = JSON.parse(event.data);
        });
        this.addEventListener("flows", (event) => {
          window.previewHistory.flows = JSON.parse(event.data);
        });
      }
    };
  });
  await page.goto("http://127.0.0.1:4182/");
  await page
    .getByRole("heading", { name: "Confidence fallback", exact: true })
    .waitFor();
  await page.locator(".wb-diagram-panel .flow-step").first().waitFor();
  await assertOpeningView(page, "opening");
  await assertUserFit(page);
  await assertUserFit(page, { keyboard: true });
  assert.equal(
    await page
      .locator(
        '.wb-diagram-panel .flow-request[data-node-id="classify-industry"]',
      )
      .count(),
    1,
    "Opening a cookbook shows the full captured request, not a placeholder block",
  );
  await page.waitForFunction(
    () => window.previewHistory.requests && window.previewHistory.flows,
  );
  const history = await page.evaluate(() => window.previewHistory);
  assert.equal(
    history.requests.traces.length,
    0,
    "Preview requests stay out of drawer history",
  );
  assert.equal(
    history.flows.upserts.length,
    0,
    "Preview runs stay out of drawer history",
  );
  await assertCommentCopies(page);
  await page.screenshot({ path: new URL("opening.png", output).pathname });
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await page.waitForFunction(() => {
    const canvas = document
      .querySelector(".wb-diagram-panel .jev-flow-viewer")
      .shadowRoot.querySelector(".flow-overview-canvas");
    return canvas
      .getAnimations()
      .some(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.transitionProperty === "transform",
      );
  });
  await page.waitForFunction(
    () => document.querySelector(".wb-source").scrollTop > 0,
  );
  await assertWorkspaceFits(page);
  const divider = page.getByRole("separator", {
    name: "Resize code and diagram",
  });
  const codeWidth = async () =>
    (await page.locator(".wb-code-panel").boundingBox()).width;
  const initialWidth = await codeWidth();
  await divider.focus();
  await divider.press("ArrowRight");
  assert.ok(
    (await codeWidth()) > initialWidth,
    "Keyboard resizing grows the code pane",
  );
  const grip = await divider.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 130, grip.y + grip.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(
    (await codeWidth()) > initialWidth + 100,
    "Dragging resizes the panes",
  );
  const savedShare = await divider.getAttribute("aria-valuenow");
  await page.reload();
  await divider.waitFor();
  await assertOpeningView(page, "reload");
  assert.equal(
    await divider.getAttribute("aria-valuenow"),
    savedShare,
    "The split survives a reload",
  );
  await divider.press("Home");
  assert.equal(
    await divider.getAttribute("aria-valuenow"),
    await divider.getAttribute("aria-valuemin"),
  );
  await divider.press("End");
  assert.equal(
    await divider.getAttribute("aria-valuenow"),
    await divider.getAttribute("aria-valuemax"),
  );
  await divider.press("Enter");
  assert.equal(await divider.getAttribute("aria-valuenow"), "40");
  await page
    .getByRole("button", { name: "Complete flow", exact: true })
    .click();
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
    const original = page.getByRole("link", {
      name: "Original Cookbook",
      exact: true,
    });
    assert.equal(await original.getAttribute("href"), recipe.originalSource);
    assert.equal(
      await page.locator(`a[href="${recipe.originalSource}"]`).count(),
      1,
      "One original-cookbook link serves the whole recipe",
    );
    const overview = page.getByRole("button", {
      name: "Cookbook overview",
      exact: true,
    });
    await overview.press("Enter");
    const popup = page.getByRole("dialog", { name: title, exact: true });
    await popup.waitFor();
    assert.ok(
      (await popup.innerText()).includes(
        recipe.overview.purpose.replaceAll("`", ""),
      ),
    );
    assert.ok(
      (await popup.innerText()).includes(
        recipe.overview.flow.replaceAll("`", ""),
      ),
    );
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    assert.equal(
      await overview.evaluate((node) => node === document.activeElement),
      true,
      "Escape returns focus to the overview trigger",
    );
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
      await assertWorkspaceFits(page);
      assert.equal(
        await page.locator(".wb-source-note").count(),
        index + 1,
        `${title}: only revealed steps have comments`,
      );
      const visibleIds = recipe.steps
        .slice(0, index + 1)
        .flatMap((step) => step.nodeIds);
      const requestCount = visibleIds.filter(
        (id) => recipe.preview.run.steps[id]?.traceId,
      ).length;
      assert.equal(
        await page.locator(".wb-diagram-panel .flow-request").count(),
        requestCount,
        `${title}: guide retains the same request diagrams as the drawer`,
      );
      assert.equal(await page.locator(".wb-narrative a").count(), 0);
      assert.equal(
        await page.locator(".wb-narrative-content > p").innerText(),
        recipe.steps[index].explanation.replaceAll("`", ""),
      );
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
      name: "Step confident-group, if, completed",
      exact: true,
    })
    .click();
  assert.ok(await page.locator('[data-line="61"].is-selected').count());
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await assertGuideOwnsSelection(page);
  await assertGuideComments(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await assertWorkspaceFits(page);
  await assertSelectionInView(page);
  const beforeHide = await codeWidth();
  await page.getByRole("button", { name: "Toggle cookbook library" }).click();
  assert.ok(
    (await codeWidth()) > beforeHide,
    "Hiding the library gives the panels its width",
  );
  await assertSelectionInView(page);
  await page.getByRole("button", { name: "Toggle cookbook library" }).click();
  await assertSelectionInView(page);
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
  await assertUserFit(page, { reduced: true });
  assert.equal(
    await page
      .locator(".wb-diagram-panel .flow-overview-canvas")
      .evaluate((canvas) => getComputedStyle(canvas).transitionDuration),
    "0s",
    "Reduced motion also disables camera focus transitions",
  );
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
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
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
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Cookbook steps" })
    .getByRole("button")
    .nth(1)
    .click();
  const requestDiagram = page.locator(
    '.wb-diagram-panel .flow-request[data-node-id="classify-industry"]',
  );
  await requestDiagram
    .getByRole("heading", { name: "Shared context", exact: true })
    .waitFor();
  assert.equal(
    await requestDiagram.getByLabel("Diagram question").inputValue(),
    "group",
  );
  assert.ok((await requestDiagram.locator(".lab-flow-dot").count()) > 0);
  await requestDiagram
    .getByRole("button", { name: "Pause flow", exact: true })
    .click();
  assert.equal(await requestDiagram.locator(".lab-flow-dot").count(), 0);
  await requestDiagram
    .getByRole("button", { name: "Play flow", exact: true })
    .click();
  assert.ok((await requestDiagram.locator(".lab-flow-dot").count()) > 0);
  await requestDiagram
    .getByRole("button", { name: "All probabilities (75)", exact: true })
    .click();
  await requestDiagram
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  await requestDiagram
    .getByRole("button", { name: "Show More", exact: true })
    .click();
  assert.match(await requestDiagram.innerText(), /Showing\s+6\s+of\s+75/);
  await requestDiagram
    .getByRole("button", { name: "Show fewer", exact: true })
    .click();
  await page.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".wb-diagram-panel .jev-flow-viewer")
      .shadowRoot.querySelector(
        '[data-node-id="classify-industry"][data-status="running"]',
      ),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Sample complete" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Step-by-step guide", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.match(
    await page.locator('.wb-timeline [aria-current="step"]').innerText(),
    /75 industry groups/,
  );
  await requestDiagram
    .getByRole("heading", { name: "Shared context", exact: true })
    .waitFor();
  await page.screenshot({
    path: new URL("guide-request-parity.png", output).pathname,
  });
  await page
    .getByRole("button", { name: "Complete flow", exact: true })
    .click();
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
  await page.getByText("Application result", { exact: true }).click();
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
  const collection = page.locator(
    '.wb-diagram-panel [data-node-id="classify-passages"]',
  );
  await collection
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  const itemFlow = page.locator(".wb-diagram-panel .flow-collection-expansion");
  await itemFlow.locator(".flow-request").first().waitFor();
  await itemFlow
    .getByRole("button", { name: "Next collection item", exact: true })
    .click();
  await itemFlow.getByRole("heading", { name: /Item 2 of/ }).waitFor();
  await itemFlow.locator(".flow-request").first().waitFor();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page.screenshot({
    path: new URL("collection-preview-parity.png", output).pathname,
  });
  await collection
    .getByRole("button", { name: "Hide Flow", exact: true })
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
  await assertWorkspaceFits(page);
  await divider.waitFor();
  assert.equal(await divider.getAttribute("aria-orientation"), "horizontal");
  const codeHeight = (await page.locator(".wb-code-panel").boundingBox())
    .height;
  await divider.press("ArrowDown");
  assert.ok(
    (await page.locator(".wb-code-panel").boundingBox()).height > codeHeight,
  );
  const mobileGrip = await divider.boundingBox();
  await page.mouse.move(mobileGrip.x + mobileGrip.width / 2, mobileGrip.y + 4);
  await page.mouse.down();
  await page.mouse.move(
    mobileGrip.x + mobileGrip.width / 2,
    mobileGrip.y + 55,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.ok(
    (await page.locator(".wb-code-panel").boundingBox()).height >
      codeHeight + 30,
  );
  await divider.press("Enter");
  await assertWorkspaceFits(page);
  await assertSelectionInView(page);
  await page.waitForFunction(() => {
    const source = document.querySelector(".wb-source").getBoundingClientRect();
    const line = document
      .querySelector(".wb-code-line.is-selected")
      ?.getBoundingClientRect();
    return line && line.top >= source.top && line.bottom <= source.bottom;
  });
  await page
    .locator(".wb-diagram-panel .flow-overview-canvas")
    .evaluate((node) =>
      Promise.all(
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
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
  await page
    .getByRole("button", { name: "Cookbook overview", exact: true })
    .click();
  const mobileOverview = page.getByRole("dialog");
  await mobileOverview.waitFor();
  const overviewBounds = await mobileOverview.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(
    overviewBounds.x >= 0 &&
      overviewBounds.x + overviewBounds.width <= viewport.width,
  );
  assert.ok(
    overviewBounds.y >= 0 &&
      overviewBounds.y + overviewBounds.height <= viewport.height,
  );
  await page.screenshot({
    path: new URL("overview-mobile.png", output).pathname,
  });
  await page
    .getByRole("button", { name: "Close cookbook overview", exact: true })
    .click();
  await mobileOverview.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Cookbook overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete flow", exact: true })
    .click();
  await mobileOverview.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Toggle cookbook library" }).click();
  await page
    .getByRole("button", { name: "Close cookbook library", exact: true })
    .click();
  assert.equal(await page.getByLabel("Find a cookbook").isVisible(), false);
  assert.equal(
    await page
      .getByRole("button", { name: "Toggle cookbook library" })
      .evaluate((node) => node === document.activeElement),
    true,
    "Closing the mobile library restores focus to its toolbar control",
  );
  await page.getByRole("button", { name: "Toggle cookbook library" }).click();
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
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: new URL("motion/", output).pathname,
      size: { width: 1280, height: 800 },
    },
  });
  const clip = await motion.newPage();
  await clip.goto("http://127.0.0.1:4182/?cookbook=confidence-fallback");
  await clip
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  const motionGrip = await clip
    .getByRole("separator", { name: "Resize code and diagram" })
    .boundingBox();
  await clip.mouse.move(motionGrip.x + 4, motionGrip.y + 100);
  await clip.mouse.down();
  await clip.mouse.move(motionGrip.x + 140, motionGrip.y + 100, { steps: 15 });
  await clip.mouse.up();
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
  await clip
    .getByRole("navigation", { name: "Cookbook steps" })
    .getByRole("button")
    .nth(1)
    .click();
  await clip.getByRole("button", { name: "Run sample ↗", exact: true }).click();
  await clip
    .getByRole("status")
    .filter({ hasText: "Sample complete" })
    .waitFor();
  await clip
    .locator(".flow-request")
    .getByRole("heading", { name: "Shared context", exact: true })
    .waitFor();
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
