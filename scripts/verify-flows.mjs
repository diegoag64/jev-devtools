// Observable interaction contract; run against the sample production harness.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { checkShortDrawerControls } from "./check-flow-controls.mjs";
const origin = process.env.FLOW_URL ?? "http://127.0.0.1:4230";
const output = process.env.FLOW_RESULTS ?? "benchmarks/results/flows";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1710, height: 1000 },
  });
  const errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(origin);
  await page.evaluate(() =>
    fetch("/api/jev-devtools/clear", { method: "DELETE" }),
  );
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "approve" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await page.getByRole("button", { name: "Flows", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await page.getByRole("region", { name: "Flow canvas" }).waitFor();
  const triage = page.getByRole("article", {
    name: "Request triage",
    exact: true,
  });
  const review = page.getByRole("article", {
    name: "Request review",
    exact: true,
  });
  await triage.getByText("Shared context", { exact: true }).waitFor();
  await triage.getByText("Selected: refund", { exact: true }).waitFor();
  // One shared camera; each request retains its existing question/answer controls.
  assert.equal(
    await page.getByRole("region", { name: "Flow canvas" }).count(),
    1,
  );
  assert.equal(
    await triage
      .getByRole("button", { name: "Zoom diagram in", exact: true })
      .count(),
    0,
  );
  // The floating controls stay in viewport space and never initiate a pan.
  const controls = page.getByRole("group", { name: "Flow canvas controls" });
  const controlsPosition = await controls.boundingBox();
  const zoomOutput = page.getByLabel("Flow zoom", { exact: true });
  const zoomBefore = await zoomOutput.textContent();
  await controls
    .getByRole("button", { name: "Zoom flow in", exact: true })
    .click();
  await page.waitForTimeout(150);
  assert.notEqual(await zoomOutput.textContent(), zoomBefore);
  assert.deepEqual(
    await controls.boundingBox(),
    controlsPosition,
    "Zooming the canvas does not move or scale its controls",
  );
  const cameraBeforeControlsDrag = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  await page.mouse.move(controlsPosition.x + 12, controlsPosition.y + 3);
  await page.mouse.down();
  await page.mouse.move(controlsPosition.x + 27, controlsPosition.y + 18);
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    cameraBeforeControlsDrag,
    "Dragging control-panel padding does not pan the diagram",
  );
  await controls
    .getByRole("button", { name: "Fit flow", exact: true })
    .press("Enter");
  await page.selectOption('[aria-label="Flow step"]', "review");
  await review.getByText("94%", { exact: true }).first().waitFor();
  await page.waitForTimeout(150);
  const beforeQuestion = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  await review
    .getByRole("combobox", { name: "Diagram question", exact: true })
    .selectOption("risky");
  await review.getByText("10%", { exact: true }).first().waitFor();
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    beforeQuestion,
  );

  await page
    .getByRole("button", { name: "Step review, jev, completed", exact: true })
    .click();
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect request", exact: true })
    .click();
  await page.getByRole("button", { name: "Questions", exact: true }).click();
  await page.getByText("eligible", { exact: true }).first().waitFor();
  await page
    .getByRole("button", { name: "Hide request details", exact: true })
    .click();
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await page
    .getByRole("button", { name: "Step other, output, untaken", exact: true })
    .waitFor();
  const canvas = page.getByRole("region", { name: "Flow canvas" });
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await page.waitForTimeout(150);
  const initialCamera = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  assert.deepEqual(
    await controls.boundingBox(),
    controlsPosition,
    "Panning the canvas does not move the floating controls",
  );
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.selectOption('[aria-label="Scenario"]', "flow-manual");
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "manual-review" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    initialCamera,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Step review, jev, completed", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  // Explicit row selection also persists across subsequent updates.
  const rows = page.locator(".request-row");
  await rows.last().click();
  // The retained camera may put the heading outside the canvas viewport.
  await page.selectOption('[aria-label="Flow step"]', "review");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const pinned = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  // Incoming run while visible must not replace explicit selection or camera.
  await page.evaluate(async () => {
    await fetch("/run?scenario=flow-other", { method: "POST" });
  });
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    pinned,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Step review, jev, completed", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    pinned,
  );
  await rows.first().click();
  await page
    .getByRole("button", { name: "Step review, jev, untaken", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page.selectOption('[aria-label="Scenario"]', "flow-cancel");
  await page
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await page.waitForTimeout(200);
  await page
    .getByRole("button", { name: "Cancel sample flow", exact: true })
    .click();
  await page.locator("#status").filter({ hasText: "cancelled" }).waitFor();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await rows.first().click();
  await page
    .getByRole("button", { name: "Step triage, jev, cancelled", exact: true })
    .waitFor();
  await page.evaluate(() =>
    fetch("/run?scenario=flow-parallel", { method: "POST" }),
  );
  await page.waitForTimeout(150);
  await rows.first().click();
  await page.selectOption('[aria-label="Flow step"]', "checks");
  const checksCard = page.getByRole("button", {
    name: "Step checks, parallel, completed",
    exact: true,
  });
  await checksCard
    .getByText("Wait for both checks", { exact: false })
    .waitFor();
  await checksCard
    .getByText("Bring the checks together", { exact: true })
    .waitFor();
  assert.equal(await checksCard.locator(".flow-lane").count(), 2);
  assert.equal(
    await checksCard
      .locator(".flow-lane")
      .filter({ hasText: "completed" })
      .count(),
    2,
  );
  const returned = page.getByRole("button", {
    name: "Step ready-output, output, completed",
    exact: true,
  });
  const untaken = page.getByRole("button", {
    name: "Step review-output, output, untaken",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Step ready, branch, completed", exact: true })
    .getByText("At least 90%", { exact: true })
    .waitFor();
  const readyCard = page.getByRole("button", {
    name: "Step ready, branch, completed",
    exact: true,
  });
  await readyCard.getByText("Ready", { exact: true }).waitFor();
  await readyCard.getByText("94%", { exact: true }).waitFor();
  assert.equal((await readyCard.innerText()).includes("combined.ready"), false);
  await returned.getByText("Ready for approval", { exact: true }).waitFor();
  await returned.getByText("Returned outcome", { exact: true }).waitFor();
  await untaken.getByText("Needs a closer look", { exact: true }).waitFor();
  await untaken.getByText("Not taken", { exact: true }).waitFor();
  await page.selectOption('[aria-label="Flow step"]', "ready-output");
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page
    .locator(".flow-selection")
    .getByText(
      "Readiness is at least 90%. Return eligibility and risk to the application for its next action.",
      { exact: true },
    )
    .waitFor();
  await page.selectOption('[aria-label="Flow step"]', "checks");
  await page.getByText("All finished · continue", { exact: true }).waitFor();
  await page
    .getByText("This marker waits for their results", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await page.selectOption('[aria-label="Flow step"]', "combined");
  await page
    .getByRole("article", { name: "Request combined", exact: true })
    .getByText("Shared context", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  await page.waitForTimeout(200);
  await mkdir("benchmarks/results/flows", { recursive: true });
  await page.screenshot({
    path: join(output, "connected-parallel.png"),
  });
  await page.evaluate(() =>
    fetch("/run?scenario=flow-large-choice", { method: "POST" }),
  );
  await page.waitForTimeout(150);
  await rows.first().click();
  await page.selectOption('[aria-label="Flow step"]', "classify");
  const classify = page.getByRole("article", {
    name: "Request classify",
    exact: true,
  });
  await classify
    .getByText("Showing 3 of 150 probabilities", { exact: true })
    .waitFor();
  await page.waitForTimeout(150);
  const cameraTransform = () =>
    page.locator(".flow-overview-canvas").evaluate((el) => el.style.transform);
  const beforeExpansion = await cameraTransform();
  await classify
    .getByRole("button", { name: "Show More", exact: true })
    .click();
  await classify
    .getByText("Showing 6 of 150 probabilities", { exact: true })
    .waitFor();
  await page.waitForTimeout(200);
  assert.equal(await cameraTransform(), beforeExpansion);
  await classify
    .getByRole("button", { name: "All probabilities (150)", exact: true })
    .click();
  const probabilityTable = classify.getByLabel("Probability table", {
    exact: true,
  });
  await page.waitForTimeout(150);
  const beforeTableScroll = await cameraTransform();
  const tableBounds = await probabilityTable.boundingBox();
  assert.ok(tableBounds);
  await page.mouse.move(
    tableBounds.x + tableBounds.width / 2,
    tableBounds.y + Math.min(150, tableBounds.height / 2),
  );
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(150);
  assert.ok(
    await probabilityTable.evaluate((el) => el.scrollTop > 0),
    "Probability table must scroll independently",
  );
  assert.equal(
    await cameraTransform(),
    beforeTableScroll,
    "Scrolling a probability table must not zoom the flow",
  );
  await classify
    .getByRole("searchbox", { name: "Search categories" })
    .fill("category-150");
  await classify
    .getByRole("rowheader", { name: "category-150", exact: true })
    .waitFor();
  await classify
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  await classify
    .getByText("Showing 6 of 150 probabilities", { exact: true })
    .waitFor();
  await page.selectOption('[aria-label="Flow step"]', "check");
  await page
    .getByRole("article", { name: "Request check", exact: true })
    .getByText("90%", { exact: true })
    .first()
    .waitFor();
  await page.selectOption('[aria-label="Flow step"]', "classify");
  await classify
    .getByText("Showing 6 of 150 probabilities", { exact: true })
    .waitFor();
  // Real captured JSON: nesting, scalar types, paging, and gestures inside cards.
  await page.evaluate(() =>
    fetch("/run?scenario=flow-content", { method: "POST" }),
  );
  await page.waitForTimeout(150);
  await rows.first().click();
  await page.selectOption('[aria-label="Flow step"]', "content");
  const contentRequest = page.getByRole("article", {
    name: "Request content",
    exact: true,
  });
  const state = contentRequest.getByRole("region", {
    name: "State properties",
    exact: true,
  });
  await state
    .getByText("Root text must not hide sibling properties.", { exact: true })
    .waitFor();
  await state.getByText("0.94", { exact: true }).waitFor();
  await state.getByText("false", { exact: true }).waitFor();
  await state.getByText("null", { exact: true }).waitFor();
  // Let initial focus/ResizeObserver frames finish before comparing interactions.
  await page.waitForTimeout(150);
  const contentCamera = await page
    .locator(".flow-overview-canvas")
    .getAttribute("style");
  const ticket = state.getByRole("button", {
    name: "Expand ticket",
    exact: true,
  });
  await ticket.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await state
      .getByRole("button", { name: "Collapse ticket", exact: true })
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(await state.getByText(/END OF CAPTURED TEXT/).count(), 0);
  await state.getByRole("button", { name: "Full text", exact: true }).click();
  await state.getByText(/END OF CAPTURED TEXT/).waitFor();
  await state.getByRole("button", { name: "Less text", exact: true }).click();
  await state
    .getByRole("button", { name: "Collapse ticket", exact: true })
    .click();
  await state
    .getByRole("button", { name: "Expand empty", exact: true })
    .click();
  await state.getByText("{} Empty object", { exact: true }).waitFor();
  await state
    .getByRole("button", { name: "Expand items", exact: true })
    .click();
  assert.equal(
    await state.getByRole("button", { name: "Expand 19", exact: true }).count(),
    0,
  );
  await state
    .getByRole("button", { name: "Show 8 more (8 remaining)", exact: true })
    .click();
  await state.getByRole("button", { name: "Expand 19", exact: true }).click();
  await state.getByText("Item 19", { exact: true }).waitFor();
  await state.evaluate((el) => {
    el.scrollTop = 0;
  });
  await state.hover();
  await page.mouse.wheel(0, 130);
  await page.waitForTimeout(200);
  assert.ok(
    await state.evaluate((el) => el.scrollTop > 0),
    "The card scrolls instead of zooming the canvas",
  );
  assert.equal(
    await page.locator(".flow-overview-canvas").getAttribute("style"),
    contentCamera,
  );
  const instructions = contentRequest.getByRole("region", {
    name: "Question instructions",
    exact: true,
  });
  await instructions.getByText("Review the ticket", { exact: true }).waitFor();
  await instructions
    .getByRole("button", { name: "Expand rules", exact: true })
    .click();
  await instructions.getByText("Check risk", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close Jev DevTools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await state
    .getByRole("button", { name: "Collapse items", exact: true })
    .waitFor();
  await state.getByText("Item 19", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await mkdir("benchmarks/results/flows", { recursive: true });
  await page.screenshot({
    path: join(output, "connected-choice.png"),
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(150);
  const smallCanvas = await canvas.boundingBox();
  const smallControls = await controls.boundingBox();
  assert.ok(
    smallControls.x >= smallCanvas.x &&
      smallControls.y >= smallCanvas.y &&
      smallControls.x + smallControls.width <=
        smallCanvas.x + smallCanvas.width &&
      smallControls.y + smallControls.height <=
        smallCanvas.y + smallCanvas.height,
    "Floating controls stay inside the canvas on narrow screens",
  );
  for (const control of await controls.getByRole("button").all()) {
    const box = await control.boundingBox();
    assert.ok(
      box.x >= smallControls.x &&
        box.y >= smallControls.y &&
        box.x + box.width <= smallControls.x + smallControls.width &&
        box.y + box.height <= smallControls.y + smallControls.height,
      "Every canvas control stays within the floating panel",
    );
  }
  await page.screenshot({ path: join(output, "floating-controls-narrow.png") });
  // Fresh Flows view with no default request selection: the first click must
  // behave like every later card click, without a one-time camera jump.
  const taskPage = await browser.newPage({
    viewport: { width: 1710, height: 1000 },
  });
  taskPage.on("pageerror", (error) => errors.push(String(error)));
  await taskPage.goto(origin);
  await taskPage
    .getByRole("combobox", { name: "Scenario", exact: true })
    .selectOption("flow-tasks");
  await taskPage
    .getByRole("button", { name: "Run sample flow", exact: true })
    .click();
  await taskPage.locator("#status").filter({ hasText: "tasks-done" }).waitFor();
  await taskPage
    .getByRole("button", { name: "Open Jev DevTools", exact: true })
    .click();
  await taskPage.getByRole("button", { name: "Flows", exact: true }).click();
  await taskPage
    .getByRole("button", { name: "Expand Jev drawer", exact: true })
    .click();
  await taskPage
    .getByRole("region", { name: "Flow canvas", exact: true })
    .waitFor();
  await taskPage.waitForTimeout(150);
  const taskCamera = taskPage.locator(".flow-overview-canvas");
  const overviewCamera = await taskCamera.getAttribute("style");
  for (const id of ["task-0", "task-1"]) {
    await taskPage
      .getByRole("button", { name: `Step ${id}, task, completed`, exact: true })
      .click();
    await taskPage.waitForTimeout(150);
    assert.equal(
      await taskPage.getByLabel("Flow step", { exact: true }).inputValue(),
      id,
    );
    assert.equal(
      await taskCamera.getAttribute("style"),
      overviewCamera,
      "First and subsequent card selections preserve the overview camera",
    );
  }
  await taskPage
    .getByRole("button", { name: "Step task-2, task, completed", exact: true })
    .press("Enter");
  await taskPage.waitForTimeout(150);
  assert.equal(
    await taskCamera.getAttribute("style"),
    overviewCamera,
    "Keyboard step selection also preserves the camera",
  );
  await taskPage
    .getByRole("button", { name: "Focus step", exact: true })
    .click();
  await taskPage.waitForTimeout(150);
  assert.notEqual(
    await taskCamera.getAttribute("style"),
    overviewCamera,
    "Explicit Focus still centers the selected step",
  );
  await taskPage.getByRole("button", { name: "Fit flow", exact: true }).click();
  await taskPage.waitForTimeout(150);
  assert.equal(await taskCamera.getAttribute("style"), overviewCamera);
  await taskPage
    .getByLabel("Flow step", { exact: true })
    .selectOption("task-3");
  await taskPage.waitForTimeout(150);
  assert.notEqual(
    await taskCamera.getAttribute("style"),
    overviewCamera,
    "The step picker retains its explicit navigation behavior",
  );
  assert.deepEqual(errors, []);
  await taskPage.close();
  // Warning readability checks run at the original desktop viewport.
  await page.setViewportSize({ width: 1710, height: 1000 });
  await page.evaluate(() =>
    fetch("/run?scenario=flow-warning", { method: "POST" }),
  );
  await rows.filter({ hasText: "capture-warning" }).first().click();
  await page.selectOption('[aria-label="Flow step"]', "long-rule");
  await page.getByRole("button", { name: "Fit flow", exact: true }).click();
  const ruleCard = page.getByRole("button", {
    name: "Step long-rule, branch, completed",
    exact: true,
  });
  const warning = ruleCard.getByText(
    "Rule capture: Long text truncated in capture.",
    { exact: true },
  );
  await warning.waitFor();
  await page.waitForTimeout(250);
  // Assert rendered readability and clipping, not a CSS selector inventory.
  const bounds = await warning.boundingBox();
  const viewport = await canvas.boundingBox();
  assert.ok(bounds && viewport);
  assert.ok(
    bounds.height >= 8,
    "Rule warning remains readable after fitting the long-rule diagram",
  );
  assert.ok(
    bounds.x >= viewport.x &&
      bounds.y >= viewport.y &&
      bounds.x + bounds.width <= viewport.x + viewport.width &&
      bounds.y + bounds.height <= viewport.y + viewport.height,
    "Complete warning remains inside the flow viewport",
  );
  await page.screenshot({ path: join(output, "capture-warning.png") });
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page
    .locator(".flow-selection")
    .getByText("Rule capture: Long text truncated in capture.", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await checkShortDrawerControls({ browser, origin, output });
  console.log(
    "Flows verified: first and later step clicks preserve the camera, explicit focus/fit/picker navigation works; floating controls stay fixed, do not initiate panning and fit narrow screens; connected request diagrams, question switching with one preserved camera, parallel wait explanation, outcome paths, untaken nodes, request details, pinned camera/selection across incoming runs and reopening, cancellation, readable capture warnings.",
  );
} catch (error) {
  await page?.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
