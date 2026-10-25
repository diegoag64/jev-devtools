import assert from "node:assert/strict";
import { join } from "node:path";

// The old mobile strip clipped the request label/metadata to 25px. Desktop
// selection coverage never exercised switching requests in a short mobile drawer.
export async function checkMobileRequests({ browser, origin, output }) {
  for (const scenario of [
    { width: 320, height: 568 },
    { width: 390, height: 844, expanded: true },
    { width: 640, height: 360 },
    { width: 700, height: 800 },
  ]) {
    const label = `${scenario.width}x${scenario.height}`;
    const page = await browser.newPage({ viewport: scenario });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      await page.goto(origin);
      assert.equal(
        await page.evaluate(
          async () =>
            (await fetch("/api/jev-devtools/clear", { method: "DELETE" })).ok,
        ),
        true,
      );
      for (let index = 0; index < 3; index++) {
        await page
          .getByRole("button", { name: "Run sample flow", exact: true })
          .click();
        await page.locator("#status").filter({ hasText: "approve" }).waitFor();
      }
      await page
        .getByRole("combobox", { name: "Scenario", exact: true })
        .selectOption("flow-parallel");
      await page
        .getByRole("button", { name: "Run sample flow", exact: true })
        .click();
      await page
        .locator("#status")
        .filter({ hasText: "ready-output" })
        .waitFor();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      if (scenario.expanded)
        await page
          .getByRole("button", { name: "Expand Jev drawer", exact: true })
          .click();
      const rows = page.locator(".request-list .request-row");
      await rows.first().waitFor();
      const assertReadable = async (row) => {
        const list = await page.locator(".request-items").boundingBox();
        for (const part of [row.locator("strong"), row.locator("small")]) {
          const rect = await part.boundingBox();
          assert.ok(
            rect.y >= list.y &&
              rect.y + rect.height <= list.y + list.height + 1 &&
              rect.y >= 0 &&
              rect.y + rect.height <= scenario.height &&
              rect.x >= 0 &&
              rect.x + rect.width <= scenario.width,
            `${label}: request label and metadata must be fully visible in the list`,
          );
        }
        assert.equal(
          await row.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = el
              .getRootNode()
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el === hit || el.contains(hit);
          }),
          true,
          `${label}: request row must receive pointer input`,
        );
      };
      await assertReadable(rows.first());
      await page.screenshot({
        path: join(output, `requests-list-${label}.png`),
      });
      const search = page.getByRole("textbox", { name: "Search requests" });
      await search.fill("refund-review");
      assert.equal(await rows.count(), 6);
      await page
        .getByRole("combobox", { name: "Filter request status" })
        .selectOption("success");
      const chosen = rows.nth(1);
      await chosen.scrollIntoViewIfNeeded();
      await assertReadable(chosen);
      await chosen.press("Enter");
      const back = page.getByRole("button", { name: /All requests/ });
      await back.waitFor();
      assert.equal(
        await back.evaluate((el) => el.getRootNode().activeElement === el),
        true,
      );
      await page
        .locator(".jev-inspector > .request-detail h2")
        .filter({ hasText: "refund-review" })
        .waitFor();
      const selectedId = async () => {
        await page.getByRole("button", { name: "Raw", exact: true }).click();
        const id = JSON.parse(
          await page
            .locator(".jev-inspector > .request-detail .detail-body pre")
            .textContent(),
        ).id;
        await page.getByRole("button", { name: "Flow", exact: true }).click();
        return id;
      };
      const requestId = await selectedId();
      await back.press("Enter");
      assert.equal(await search.inputValue(), "refund-review");
      assert.equal(
        await page
          .getByRole("combobox", { name: "Filter request status" })
          .inputValue(),
        "success",
      );
      assert.equal(await rows.nth(1).getAttribute("aria-pressed"), "true");
      assert.equal(
        await rows
          .nth(1)
          .evaluate((el) => el.getRootNode().activeElement === el),
        true,
      );
      await search.fill("missing-request");
      await page.getByText("No matching requests.", { exact: true }).waitFor();
      await search.fill("");
      const status = page.getByRole("combobox", {
        name: "Filter request status",
      });
      await status.selectOption("error");
      await page.getByText("No matching requests.", { exact: true }).waitFor();
      await status.selectOption("all");
      await rows.last().scrollIntoViewIfNeeded();
      await assertReadable(rows.last());
      const nextLabel = await rows.last().locator("strong").textContent();
      await rows.last().click();
      assert.equal(
        await page.locator(".jev-inspector > .request-detail h2").textContent(),
        nextLabel,
      );
      assert.notEqual(await selectedId(), requestId);
      await page.screenshot({
        path: join(output, `requests-detail-${label}.png`),
      });
      await page
        .getByRole("button", { name: "Close Jev DevTools", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await back.waitFor();
      assert.equal(
        await page.locator(".jev-inspector > .request-detail h2").textContent(),
        nextLabel,
      );
      await page.setViewportSize({ width: 701, height: 800 });
      assert.equal(await back.isVisible(), false);
      assert.equal(await search.isVisible(), true);
      assert.equal(
        await page.locator(".jev-inspector > .request-detail").isVisible(),
        true,
      );
      await rows.first().click();
      assert.equal(
        await page.locator(".jev-inspector > .request-detail h2").textContent(),
        await rows.first().locator("strong").textContent(),
      );
      await page.setViewportSize({
        width: scenario.width,
        height: scenario.height,
      });
      await back.waitFor();
      await page.getByRole("button", { name: "Flows", exact: true }).click();
      const summary = page.locator(".flow-details-bar > span").first();
      await summary.waitFor({ state: "attached" });
      assert.equal(
        await summary.isVisible(),
        false,
        "Mobile details bar omits the step summary",
      );
      const toggle = page
        .getByRole("button", { name: "Show details", exact: true })
        .first();
      await toggle.click();
      await page
        .getByRole("button", { name: "Hide details", exact: true })
        .first()
        .waitFor();
      await page.setViewportSize({ width: 701, height: 800 });
      assert.equal(
        await summary.isVisible(),
        true,
        "Desktop retains the step summary",
      );
      await page.getByRole("button", { name: "Requests", exact: true }).click();
      await page.setViewportSize({
        width: scenario.width,
        height: scenario.height,
      });
      await back.click();
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await page
        .getByText("Run a scenario to capture your first request.", {
          exact: true,
        })
        .waitFor();
      assert.deepEqual(errors, []);
    } catch (error) {
      await page
        .screenshot({ path: join(output, `requests-${label}-failure.png`) })
        .catch(() => {});
      throw error;
    } finally {
      await page.close();
    }
  }
}
