import assert from "node:assert/strict";
import { join } from "node:path";

/** Real budgeted SSE captures must never appear as pending data or a null value. */
export async function checkFlowBudget({ browser, origin, output }) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await page.goto(origin + "/?budget=1");
    await page
      .getByLabel("Scenario", { exact: true })
      .selectOption("flow-tasks");
    await page
      .getByRole("button", { name: "Run sample flow", exact: true })
      .click();
    await page.locator("#status").filter({ hasText: "tasks-done" }).waitFor();
    await page
      .getByRole("button", { name: "Open Jev DevTools", exact: true })
      .click();
    await page.getByRole("button", { name: "Flows", exact: true }).click();
    await page
      .getByRole("button", { name: "Expand Jev drawer", exact: true })
      .click();
    await page.getByLabel("Flow step", { exact: true }).selectOption("task-0");
    await page
      .getByRole("button", { name: "Show details", exact: true })
      .click();
    const detail = page.locator(".flow-selection");
    await page.screenshot({ path: join(output, "capture-budget-closed.png") });
    await detail
      .getByText("Step data omitted by flow capture byte budget.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await detail
        .getByText("No function data captured yet.", { exact: true })
        .count(),
      0,
    );
    const outcome = detail
      .locator("details")
      .filter({ hasText: "Captured outcome value" });
    await outcome
      .locator("summary")
      .getByText("Capture warnings", { exact: false })
      .waitFor();
    await outcome.locator("summary").click();
    await outcome
      .getByText("Outcome value omitted by flow capture byte budget.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await outcome.locator("pre").count(), 0);
    const warning = detail.getByText(
      "Step data omitted by flow capture byte budget.",
      { exact: true },
    );
    assert.equal(
      await warning.evaluate((node) => getComputedStyle(node).color),
      "rgb(226, 185, 125)",
    );
    await page.screenshot({ path: join(output, "capture-budget-open.png") });
    await page.setViewportSize({ width: 600, height: 800 });
    await warning.waitFor();
    await page.screenshot({ path: join(output, "capture-budget-narrow.png") });
    await page.evaluate(() =>
      fetch("/run?scenario=flow-loop&budget=1", { method: "POST" }),
    );
    await page
      .locator(".request-row")
      .filter({ hasText: "nested-loop" })
      .first()
      .click();
    await page.getByLabel("Flow step", { exact: true }).selectOption("rounds");
    const show = page.getByRole("button", {
      name: "Show details",
      exact: true,
    });
    if (await show.count()) await show.click();
    await detail
      .getByText("Step data omitted by flow capture byte budget.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await detail
        .getByLabel("Loop initial and latest state", { exact: true })
        .count(),
      0,
    );
    await page.screenshot({ path: join(output, "capture-budget-loop.png") });
  } finally {
    await page.close();
  }
}
