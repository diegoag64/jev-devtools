import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { browserOutputURL } from "../../../scripts/cookbook-browser-context.mjs";

const output = browserOutputURL();
await mkdir(output, { recursive: true });
const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
let browser, context;
const errors = [];
const sourceAnchor = (page) =>
  page.locator(".wb-source").evaluate((source) => {
    const top = source.getBoundingClientRect().top;
    const row = [
      ...source.querySelectorAll(".wb-code-line, .wb-source-note"),
    ].find((line) => line.getBoundingClientRect().bottom > top);
    return {
      line: row?.dataset.line,
      note: row?.dataset.noteLine,
      offset: row.getBoundingClientRect().top - top,
    };
  });
async function assertModal(page, pane) {
  const dialog = page.getByRole("dialog", { name: `Expanded ${pane}` });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(
    box.width > viewport.width * 0.9 && box.height > viewport.height * 0.9,
    "Expanded content uses almost the entire viewport",
  );
  assert.ok(
    box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= viewport.width &&
      box.y + box.height <= viewport.height,
    "The popup fits within the viewport",
  );
  // Native modality keeps focus inside the popup, including the shadow viewer.
  await page
    .getByRole("button", { name: `Close expanded ${pane}` })
    .press("Tab");
  assert.equal(
    await page
      .locator(".wb-guide-controls button")
      .first()
      .evaluate((node) => {
        node.focus();
        return node === document.activeElement;
      }),
    false,
    "Background controls cannot take focus while the popup is open",
  );
  assert.equal(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
    true,
  );
}
async function walkthroughInPopup(page, size) {
  await page.goto("http://127.0.0.1:4182/?cookbook=confidence-fallback");
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  const steps = page.locator(".wb-timeline button");
  const total = await steps.count();
  for (const pane of ["code", "diagram"]) {
    await steps.first().click();
    // Expansion preserves the current reading position. Finish the initial
    // step scroll first; restoring a mid-animation offset cancels that scroll.
    await page.locator(".wb-source").evaluate(async (source) => {
      const deadline = performance.now() + 5000;
      let previous = source.scrollTop,
        stable = 0;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const current = source.scrollTop;
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        const bounds = source.getBoundingClientRect();
        const selected = source
          .querySelector(".is-selected")
          ?.getBoundingClientRect();
        if (
          stable >= 4 &&
          selected?.top >= bounds.top &&
          selected.top < bounds.bottom
        )
          return;
      }
      throw new Error("Initial walkthrough step did not scroll into view");
    });
    await page
      .getByRole("button", { name: `Expand ${pane}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: `Expanded ${pane}` });
    const previous = dialog.getByRole("button", {
      name: "← Previous",
      exact: true,
    });
    const next = dialog.getByRole("button", {
      name: "Next step →",
      exact: true,
    });
    await page.screenshot({
      path: new URL(`walkthrough-${pane}-${size}.png`, output).pathname,
    });
    assert.equal(
      await previous.count(),
      1,
      "Expanded walkthroughs retain Previous",
    );
    assert.equal(await next.count(), 1, "Expanded walkthroughs retain Next");
    assert.equal(await previous.isEnabled(), false);
    let beforeLines = "",
      beforeNodes = -1;
    async function assertStep(index) {
      assert.equal(
        await dialog.isVisible(),
        true,
        "Step navigation keeps the popup open",
      );
      assert.equal(await steps.nth(index).getAttribute("aria-current"), "step");
      const title = await steps.nth(index).innerText();
      await dialog
        .locator(".wb-expanded-guide")
        .getByText(title, { exact: true })
        .waitFor();
      const lines = await page
        .locator(".wb-source .is-selected")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.line).join(","));
      assert.notEqual(
        lines,
        beforeLines,
        "Step navigation updates the focused code",
      );
      beforeLines = lines;
      await page.waitForFunction((count) => {
        const root = document.querySelector(
          ".wb-diagram-panel .jev-flow-viewer",
        ).shadowRoot;
        return (
          root.querySelectorAll(".flow-step[data-node-id]").length !== count
        );
      }, beforeNodes);
      beforeNodes = await page
        .locator(".wb-diagram-panel .flow-step[data-node-id]")
        .count();
      if (pane === "code") {
        // Let the deliberate source scroll finish before taking another step
        // or restoring the narrower pane. Reduced motion settles immediately.
        await page.locator(".wb-source").evaluate(async (source) => {
          let previous = source.scrollTop,
            stable = 0;
          const deadline = performance.now() + 5000;
          while (stable < 4) {
            if (performance.now() > deadline)
              throw new Error("Source scrolling did not settle");
            await new Promise(requestAnimationFrame);
            const current = source.scrollTop;
            stable = current === previous ? stable + 1 : 0;
            previous = current;
          }
          const bounds = source.getBoundingClientRect();
          const selected = source
            .querySelector(".is-selected")
            .getBoundingClientRect();
          if (selected.top < bounds.top || selected.top >= bounds.bottom)
            throw new Error(
              "The active step is outside the expanded code viewport",
            );
        });
      }
      const bounds = await dialog.locator(".wb-expanded-guide").boundingBox();
      const viewport = page.viewportSize();
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= viewport.width &&
          bounds.y + bounds.height <= viewport.height,
        "Walkthrough controls remain in view without scrolling",
      );
    }
    await assertStep(0);
    for (let index = 1; index < total; index++) {
      await next.press("Enter");
      await assertStep(index);
    }
    assert.equal(
      await next.isEnabled(),
      false,
      "The last step keeps a disabled Next button",
    );
    for (let index = total - 2; index >= 2; index--) {
      await previous.press("Enter");
      await assertStep(index);
    }
    await page.screenshot({
      path: new URL(`walkthrough-${pane}-${size}-step3.png`, output).pathname,
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await steps.nth(2).getAttribute("aria-current"),
      "step",
      "Closing the popup preserves the reached step",
    );
    await page.waitForFunction(() => {
      const source = document
        .querySelector(".wb-source")
        .getBoundingClientRect();
      const selected = document
        .querySelector(".wb-source .is-selected")
        .getBoundingClientRect();
      return selected.top >= source.top && selected.top < source.bottom;
    });
  }
  await page
    .getByRole("button", { name: "Complete flow", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand code", exact: true }).click();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Next step →", exact: true })
      .count(),
    0,
    "Complete-flow popups do not show walkthrough controls",
  );
  await page.keyboard.press("Escape");
}

async function restore(page, share) {
  const button = page.getByRole("button", {
    name: "Show both panels",
    exact: true,
  });
  await button.press("Enter");
  const divider = page.getByRole("separator", {
    name: "Resize code and diagram",
  });
  await divider.waitFor();
  assert.equal(
    await divider.getAttribute("aria-valuenow"),
    share,
    "Restoring both panes retains the previous split",
  );
  assert.equal(await page.locator(".wb-code-panel").isVisible(), true);
  assert.equal(await page.locator(".wb-diagram-panel").isVisible(), true);
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: new URL("video/", output).pathname,
      size: { width: 1280, height: 800 },
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4182/?cookbook=rag-passages");
  const collection = page.locator(
    '.wb-diagram-panel .flow-step[data-node-id="classify-passages"]',
  );
  await collection.waitFor();
  await collection.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: new URL("split-controls.png", output).pathname,
  });
  await page
    .getByRole("button", { name: "Step-by-step guide", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Cookbook steps" })
    .getByRole("button")
    .nth(2)
    .click();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await collection
    .getByRole("button", { name: "View Flow", exact: true })
    .click();
  const expansion = page
    .locator(".wb-diagram-panel .flow-collection-expansion")
    .first();
  await expansion
    .getByRole("button", { name: "Next collection item", exact: true })
    .click();
  await expansion.getByRole("heading", { name: /Item 2 of 12/ }).waitFor();
  await page.locator(".wb-source").evaluate(async (node) => {
    node.scrollTo({ top: 950, behavior: "instant" });
    await new Promise(requestAnimationFrame);
  });
  const anchor = await sourceAnchor(page);
  const stage = await page
    .locator('.wb-timeline [aria-current="step"]')
    .innerText();
  const expandCode = page.getByRole("button", {
    name: "Expand code",
    exact: true,
  });
  await expandCode.press("Enter");
  await assertModal(page, "code");
  const expandedAnchor = await sourceAnchor(page);
  assert.deepEqual(
    expandedAnchor,
    anchor,
    "Expanding code preserves its reading position",
  );
  const comments = page.getByRole("button", {
    name: "Step comments",
    exact: true,
  });
  const beforeComments = await comments.getAttribute("aria-pressed");
  await comments.click();
  await page.screenshot({
    path: new URL("expanded-code.png", output).pathname,
  });
  await page.keyboard.press("Escape");
  assert.equal(
    await expandCode.evaluate((node) => node === document.activeElement),
    true,
    "Escape returns focus to the expand control",
  );
  assert.notEqual(
    await comments.getAttribute("aria-pressed"),
    beforeComments,
    "Comment preferences survive closing the popup",
  );
  assert.equal(
    await page.locator('.wb-timeline [aria-current="step"]').innerText(),
    stage,
  );
  await expansion.getByRole("heading", { name: /Item 2 of 12/ }).waitFor();
  await page
    .getByRole("button", { name: "Expand diagram", exact: true })
    .click();
  await assertModal(page, "diagram");
  await expansion.getByRole("heading", { name: /Item 2 of 12/ }).waitFor();
  await expansion
    .getByRole("button", { name: "Pause flow", exact: true })
    .first()
    .click();
  await page.screenshot({
    path: new URL("expanded-diagram.png", output).pathname,
  });
  await page
    .getByRole("button", { name: "Close expanded diagram", exact: true })
    .click();
  assert.equal(
    await expansion
      .getByRole("button", { name: "Play flow", exact: true })
      .first()
      .isVisible(),
    true,
    "The same request controls stay paused after closing",
  );
  const divider = page.getByRole("separator", {
    name: "Resize code and diagram",
  });
  await divider.press("ArrowRight");
  const share = await divider.getAttribute("aria-valuenow");
  for (const pane of ["code", "diagram"]) {
    await page
      .getByRole("button", { name: `Show ${pane} only`, exact: true })
      .press("Enter");
    assert.equal(
      await page
        .locator(`.wb-${pane === "code" ? "diagram" : "code"}-panel`)
        .isVisible(),
      false,
    );
    await page
      .getByRole("button", { name: `Expand ${pane}`, exact: true })
      .click();
    await assertModal(page, pane);
    await page.mouse.click(2, 2);
    assert.equal(
      await page.getByRole("dialog").count(),
      0,
      "Backdrop dismisses the popup",
    );
    await page.screenshot({
      path: new URL(`${pane}-only.png`, output).pathname,
    });
    await restore(page, share);
  }
  for (const stacked of [false, true]) {
    if (stacked) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator('.wb-divider[aria-orientation="horizontal"]')
        .waitFor();
    }
    for (const edge of ["start", "end"]) {
      const before = await divider.getAttribute("aria-valuenow");
      const box = await page.locator(".wb-panels").boundingBox();
      const grip = await divider.boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        stacked
          ? grip.x + grip.width / 2
          : box.x + (edge === "start" ? 1 : box.width - 1),
        stacked
          ? box.y + (edge === "start" ? 1 : box.height - 1)
          : grip.y + grip.height / 2,
        { steps: 12 },
      );
      await page.mouse.up();
      const remaining = edge === "start" ? "diagram" : "code";
      assert.equal(
        await page
          .locator(`.wb-${remaining === "code" ? "diagram" : "code"}-panel`)
          .isVisible(),
        false,
        "Dragging to either edge hides the corresponding pane",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Show both panels", exact: true })
          .evaluate((node) => node === document.activeElement),
        true,
        "Snapping moves keyboard focus to the restore control",
      );
      await restore(page, before);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const pane of ["code", "diagram"]) {
    await page
      .getByRole("button", { name: `Expand ${pane}`, exact: true })
      .click();
    await assertModal(page, pane);
    await page.screenshot({
      path: new URL(`mobile-expanded-${pane}.png`, output).pathname,
    });
    await page.keyboard.press("Escape");
  }
  await expansion.getByRole("heading", { name: /Item 2 of 12/ }).waitFor();
  assert.equal(
    await page.locator('.wb-timeline [aria-current="step"]').innerText(),
    stage,
  );
  await page
    .getByRole("button", { name: "Show diagram only", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Cookbook steps" })
    .getByRole("button")
    .nth(3)
    .click();
  await page
    .getByRole("button", { name: "Show both panels", exact: true })
    .click();
  await page.screenshot({
    path: new URL("restored-step.png", output).pathname,
  });
  await page.waitForFunction(
    () => {
      const source = document
        .querySelector(".wb-source")
        .getBoundingClientRect();
      const selected = document
        .querySelector(".wb-source .is-selected")
        .getBoundingClientRect();
      return selected.top >= source.top && selected.top < source.bottom;
    },
    undefined,
    { timeout: 5000 },
  );
  await walkthroughInPopup(page, "mobile");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await walkthroughInPopup(page, "desktop");
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", output),
    JSON.stringify(
      { errors, desktop: true, mobile: true, reducedMotion: true },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
