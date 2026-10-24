// Observable interaction contract; run against the sample production harness.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.FLOW_URL ?? "http://127.0.0.1:4230";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1710, height: 1000 },
    }),
    errors = [];
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
    path: "benchmarks/results/flows/connected-parallel.png",
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
    path: "benchmarks/results/flows/connected-choice.png",
  });
  console.log(
    "Flows verified: connected request diagrams, question switching with one preserved camera, parallel wait explanation, outcome paths, untaken nodes, request details, pinned camera/selection across incoming runs and reopening, cancellation.",
  );
} finally {
  await browser.close();
}
