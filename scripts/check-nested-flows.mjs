import assert from "node:assert/strict";
import { join } from "node:path";

// Scope controls to their owning overview: identical IDs exist at every depth.
// Structural selectors only establish ownership; assertions use rendered state.
function view(section) {
  const workspace = section.locator(":scope > .flow-workspace");
  const canvas = workspace.locator(
    ":scope > [role=region] > .flow-overview-canvas",
  );
  return {
    section,
    canvas,
    picker: section
      .locator(":scope > .detail-header, :scope > .lab-flow-toolbar")
      .getByLabel("Flow step", { exact: true }),
    panel: workspace.locator(":scope > .flow-details-panel"),
    card: (label) =>
      canvas
        .locator(":scope > article")
        .and(section.getByRole("article", { name: label, exact: true })),
    expansion: (label) =>
      canvas
        .locator(":scope > article")
        .and(section.getByRole("article", { name: label, exact: true })),
  };
}
function child(expansion) {
  return view(
    expansion.locator(
      ":scope > .flow-item-frame > .flow-item-content > .flow-overview-stack > section",
    ),
  );
}

// Wait for actual layout/finite item transitions, then consecutive stable frames.
// No fixed delay assumes that the SSE update or nested ResizeObservers finished.
async function settled(root) {
  await root.section.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.effect.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
    let previous,
      stable = 0;
    const deadline = performance.now() + 5000;
    while (stable < 4) {
      if (performance.now() > deadline)
        throw new Error("Nested flow layout did not settle");
      await new Promise(requestAnimationFrame);
      const current = [
        ...element.querySelectorAll(
          ".flow-overview-canvas, .flow-collection-expansion",
        ),
      ]
        .map(
          (node) =>
            `${node.getAttribute("style")}:${JSON.stringify(node.getBoundingClientRect())}`,
        )
        .join("|");
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
  });
}
async function selected(owner, id, kind) {
  assert.equal(
    await owner.picker.inputValue(),
    id,
    `Owning picker selects ${id}`,
  );
  const cards = owner.canvas.locator(":scope > .flow-step");
  const highlights = cards.locator(":scope > button[aria-pressed=true]");
  assert.equal(
    await highlights.count(),
    1,
    "Exactly one step is highlighted in this overview",
  );
  assert.equal(
    await highlights.getAttribute("aria-label"),
    `Step ${id}, ${kind}, completed`,
  );
  assert.equal(
    await highlights.evaluate((button) =>
      button.parentElement.classList.contains("selected"),
    ),
    true,
    "The selected card has its visible highlight",
  );
}
async function inspect(owner, marker) {
  await owner.picker.selectOption("check");
  await selected(owner, "check", "jev");
  await owner.panel
    .getByRole("button", { name: "Show details", exact: true })
    .press("Enter");
  await owner.panel
    .getByRole("button", { name: "Inspect request", exact: true })
    .press("Enter");
  await owner.panel
    .getByRole("button", { name: "Questions", exact: true })
    .press("Enter");
  await owner.panel
    .getByRole("button", { name: "Questions", exact: true })
    .and(owner.panel.locator('[aria-pressed="true"]'))
    .waitFor();
  await owner.panel.getByText(marker, { exact: true }).first().waitFor();
  assert.equal(
    await owner.panel
      .getByRole("button", { name: "Hide request details", exact: true })
      .count(),
    1,
  );
}
async function question(owner, marker) {
  await owner
    .card("Request check")
    .getByLabel("Diagram question", { exact: true })
    .locator(`option[value="${marker}"]`)
    .waitFor({ state: "attached" });
  assert.equal(
    await owner
      .card("Request check")
      .getByLabel("Diagram question", { exact: true })
      .inputValue(),
    marker,
  );
}

export async function checkNestedFlows({ browser, origin, output }) {
  for (const kind of ["map", "loop"]) {
    const page = await browser.newPage({
      viewport: { width: 1710, height: 1000 },
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      await page.goto(origin);
      await page
        .getByLabel("Scenario", { exact: true })
        .selectOption(`flow-${kind}`);
      await page
        .getByRole("button", { name: "Run sample flow", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: `${kind}-done` })
        .waitFor();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.getByRole("button", { name: "Flows", exact: true }).click();
      await page
        .getByRole("button", { name: "Expand Jev drawer", exact: true })
        .click();
      const root = view(
        page.getByRole("region", { name: "Whole flow", exact: true }),
      );
      await question(root, `${kind}-parent`);
      await inspect(root, `${kind}-parent`);
      const id = kind === "map" ? "batch" : "rounds";
      const label = kind === "map" ? "Collection batch" : "Step rounds";
      const unit = kind === "map" ? "collection item" : "iteration";
      const picker = root
        .card(label)
        .getByLabel(
          `${kind === "map" ? "Collection item" : "Iteration"} for ${id}`,
          { exact: true },
        );
      await root.picker.selectOption(id);
      await root
        .card(label)
        .getByRole("button", { name: "View Flow", exact: true })
        .click();
      const expansion = root.expansion(`Selected ${unit} flow for ${id}`);
      const inner = child(expansion);
      await question(inner, kind === "map" ? "map-amber" : "round-1");
      await selected(root, id, kind);
      await page.getByRole("button", { name: "Fit flow", exact: true }).click();
      await settled(root);
      const camera = () =>
        root.canvas.evaluate((element) => element.style.transform);
      const beforeChild = await camera();
      // A child header click must not select the identically named parent request.
      await inner
        .card("Request check")
        .getByRole("button", {
          name: "Step check, jev, completed",
          exact: true,
        })
        .click();
      await inspect(inner, kind === "map" ? "map-amber" : "round-1");
      await selected(root, id, kind);
      assert.equal(
        await root.panel
          .getByRole("button", { name: "Questions", exact: true })
          .count(),
        0,
        "Child inspection does not open a parent request",
      );
      await root
        .card("Request check")
        .getByRole("button", {
          name: "Step check, jev, completed",
          exact: true,
        })
        .press("Enter");
      await root.panel
        .getByRole("button", { name: "Questions", exact: true })
        .press("Enter");
      await root.panel
        .getByRole("button", { name: "Questions", exact: true })
        .and(root.panel.locator('[aria-pressed="true"]'))
        .waitFor();
      await root.panel
        .getByText(`${kind}-parent`, { exact: true })
        .first()
        .waitFor();
      await inner.panel
        .getByText(kind === "map" ? "map-amber" : "round-1", { exact: true })
        .first()
        .waitFor();
      await selected(root, "check", "jev");
      await selected(inner, "check", "jev");
      await root
        .card(label)
        .getByRole("button", {
          name: `Step ${id}, ${kind}, completed`,
          exact: true,
        })
        .press("Enter");
      await settled(root);
      assert.equal(
        await camera(),
        beforeChild,
        "Child selection and details preserve the shared camera",
      );
      await inner.picker.selectOption(kind === "map" ? "receipt" : "advance");
      await selected(inner, kind === "map" ? "receipt" : "advance", "task");
      await selected(root, id, kind);

      // Switching mounts a fresh child with its own default request selection and
      // collapsed details, not the previous item's task/inspection state.
      for (const [action, index, marker] of [
        [
          () => picker.selectOption("1"),
          "1",
          kind === "map" ? "map-violet" : "round-2",
        ],
        [
          () =>
            expansion
              .getByRole("button", { name: `Next ${unit}`, exact: true })
              .press("Enter"),
          "0",
          kind === "map" ? "map-amber" : "round-1",
        ],
        [
          () =>
            expansion
              .getByRole("button", { name: `Previous ${unit}`, exact: true })
              .press("Enter"),
          "1",
          kind === "map" ? "map-violet" : "round-2",
        ],
      ]) {
        await action();
        await question(inner, marker);
        assert.equal(await picker.inputValue(), index);
        await expansion
          .getByRole("heading", {
            name: `${id} · ${kind === "map" ? "Item" : "Iteration"} ${Number(index) + 1} of 2`,
            exact: true,
          })
          .waitFor();
        await selected(inner, "check", "jev");
        await selected(root, id, kind);
        assert.equal(
          await inner.panel
            .getByRole("button", { name: "Show details", exact: true })
            .count(),
          1,
        );
        await inspect(inner, marker);
        await settled(root);
        assert.equal(
          await camera(),
          beforeChild,
          "Item/iteration switching preserves the outer camera",
        );
      }

      if (kind === "loop") {
        // A second depth is independently useful: identical map item indices and
        // step IDs must resolve against the selected iteration's captured run.
        await inner.picker.selectOption("batch");
        await inner
          .card("Collection batch")
          .getByRole("button", { name: "View Flow", exact: true })
          .press("Enter");
        const nested = inner.expansion(
          "Selected collection item flow for batch",
        );
        const leaf = child(nested);
        await question(leaf, "round-2-amber");
        await inner
          .card("Collection batch")
          .getByLabel("Collection item for batch", { exact: true })
          .selectOption("1");
        await question(leaf, "round-2-violet");
        await inspect(leaf, "round-2-violet");
        await selected(inner, "batch", "map");
        await selected(root, "rounds", "loop");
        await settled(root);
        assert.equal(
          await camera(),
          beforeChild,
          "Map inside iteration shares the outer camera",
        );
        await page
          .getByRole("button", { name: "Fit flow", exact: true })
          .click();
        await settled(root);
        await page.screenshot({ path: join(output, "nested-map-in-loop.png") });
        await picker.selectOption("0");
        await question(inner, "round-1");
        await nested.waitFor({ state: "detached" });
        await inner
          .card("Collection batch")
          .getByRole("button", { name: "View Flow", exact: true })
          .press("Enter");
        await question(leaf, "round-1-amber");
        await inspect(leaf, "round-1-amber");
        await selected(inner, "batch", "map");
        await selected(root, "rounds", "loop");
      }

      await page.getByRole("button", { name: "Fit flow", exact: true }).click();
      await settled(root);
      // Pin a non-fitted camera so updates cannot silently refit to the same view.
      await page
        .getByRole("region", { name: "Flow canvas", exact: true })
        .focus();
      await page.keyboard.press("ArrowRight");
      await settled(root);
      const pinned = await camera();
      const state = async () => ({
        steps: await root.section
          .getByLabel("Flow step", { exact: true })
          .evaluateAll((nodes) => nodes.map((node) => node.value)),
        questions: await root.section
          .getByLabel("Diagram question", { exact: true })
          .evaluateAll((nodes) => nodes.map((node) => node.value)),
        inspected: await root.section
          .locator(".flow-request-detail h2, .flow-request-detail h3")
          .allTextContents(),
        collections: await root.section
          .getByRole("combobox", { name: /^(Collection item|Iteration) for / })
          .evaluateAll((nodes) => nodes.map((node) => node.value)),
        highlights: await root.section
          .locator(".flow-step.selected > button[aria-pressed=true]")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label")),
          ),
        item: await picker.inputValue(),
      });
      const retained = await state();
      const rows = page.locator(".request-row");
      const count = await rows.count();
      await page.evaluate(async (kind) => {
        const response = await fetch(`/run?scenario=flow-${kind}`, {
          method: "POST",
        });
        const result = await response.json();
        if (result.outcome !== `${kind}-done`)
          throw new Error(JSON.stringify(result));
      }, kind);
      await rows.nth(count).waitFor(); // Wait for the actual incoming SSE run.
      await rows
        .first()
        .filter({ hasText: `${kind}-done` })
        .waitFor();
      await settled(root);
      assert.deepEqual(
        await state(),
        retained,
        "Incoming run preserves all nested selections and inspected requests",
      );
      assert.equal(await camera(), pinned);
      await page
        .getByRole("button", { name: "Close Jev DevTools", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await settled(root);
      assert.deepEqual(
        await state(),
        retained,
        "Drawer reopening retains nested inspection state",
      );
      assert.equal(await camera(), pinned);
      assert.equal(
        await page
          .getByRole("region", { name: "Flow canvas", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole("group", { name: "Flow canvas controls", exact: true })
          .count(),
        1,
      );
      await page.screenshot({ path: join(output, `nested-${kind}.png`) });

      // Collapse/remount deliberately resets child details but retains the item picker.
      await root
        .card(label)
        .getByRole("button", { name: "Hide Flow", exact: true })
        .press("Enter");
      await expansion.waitFor({ state: "detached" });
      await settled(root);
      assert.equal(await camera(), pinned);
      await selected(root, id, kind);
      await root
        .card(label)
        .getByRole("button", { name: "View Flow", exact: true })
        .press("Enter");
      await question(inner, kind === "map" ? "map-violet" : "round-1");
      assert.equal(await picker.inputValue(), retained.item);
      await selected(inner, "check", "jev");
      assert.equal(
        await inner.panel
          .getByRole("button", { name: "Show details", exact: true })
          .count(),
        1,
      );
      await settled(root);
      assert.equal(await camera(), pinned);
      assert.deepEqual(errors, []);
      console.log(
        `Nested ${kind} verified: scoped selection, request inspection, switching, shared camera, updates and reopening.`,
      );
    } catch (error) {
      await page
        .screenshot({ path: join(output, `nested-${kind}-failure.png`) })
        .catch(() => {});
      throw error;
    } finally {
      await page.close();
    }
  }
}
