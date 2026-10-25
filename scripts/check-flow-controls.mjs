import assert from "node:assert/strict";
import { join } from "node:path";

// Check the public drawer in fresh sessions: the expanded 375px case alone
// misses clipping caused by the default or persisted drawer height.
export async function checkShortDrawerControls({ browser, origin, output }) {
  for (const scenario of [
    { width: 320, height: 568 },
    { width: 320, height: 568, drawerHeight: 420 },
    { width: 280, height: 568 },
    { width: 640, height: 360 },
  ]) {
    const label = `${scenario.width}x${scenario.height}-${scenario.drawerHeight ?? "default"}`;
    const page = await browser.newPage({
      viewport: { width: scenario.width, height: scenario.height },
    });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      if (scenario.drawerHeight) {
        await page.addInitScript((height) => {
          localStorage.setItem("jev-inspector-drawer-height", String(height));
        }, scenario.drawerHeight);
      }
      await page.goto(origin);
      await page
        .getByRole("button", { name: "Run sample flow", exact: true })
        .click();
      await page.locator("#status").filter({ hasText: "approve" }).waitFor();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.getByRole("button", { name: "Flows", exact: true }).click();
      const canvas = page.getByRole("region", {
        name: "Flow canvas",
        exact: true,
      });
      const controls = page.getByRole("group", {
        name: "Flow canvas controls",
        exact: true,
      });
      const flow = page.getByRole("region", {
        name: "Whole flow",
        exact: true,
      });
      await controls.waitFor({ state: "attached" });
      await page.waitForTimeout(150);

      const revealControls = async () => {
        const area = await flow.boundingBox();
        const panel = await controls.boundingBox();
        // Wheel over flow metadata, outside the diagram's wheel-to-zoom region.
        // A real user must be able to reach the controls without expanding.
        if (panel.y > area.y + 12) {
          await page.mouse.move(area.x + 8, area.y + 8);
          await page.mouse.wheel(0, panel.y - area.y - 12);
          await page.waitForTimeout(150);
        }
      };
      const assertReachable = async () => {
        const area = await flow.boundingBox();
        const view = await canvas.boundingBox();
        for (const button of await controls.getByRole("button").all()) {
          const name =
            (await button.getAttribute("aria-label")) ??
            (await button.textContent());
          const rect = await button.boundingBox();
          for (const clip of [
            area,
            view,
            { x: 0, y: 0, width: scenario.width, height: scenario.height },
          ]) {
            assert.ok(
              rect.x >= clip.x - 1 &&
                rect.y >= clip.y - 1 &&
                rect.x + rect.width <= clip.x + clip.width + 1 &&
                rect.y + rect.height <= clip.y + clip.height + 1,
              `${label}: ${name} must be inside its visible clipping boundaries`,
            );
          }
          assert.equal(
            await button.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const hit = el
                .getRootNode()
                .elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                );
              return hit === el || el.contains(hit);
            }),
            true,
            `${label}: ${name} must receive pointer input`,
          );
        }
      };
      await revealControls();
      await assertReachable();
      assert.equal(
        await page
          .getByRole("button", { name: "Expand Jev drawer", exact: true })
          .isVisible(),
        true,
      );

      const zoom = page.getByLabel("Flow zoom", { exact: true });
      const before = await zoom.textContent();
      await controls
        .getByRole("button", { name: "Zoom flow in", exact: true })
        .click();
      await page.waitForFunction(
        (previous) =>
          document
            .querySelector("jev-devtools-root")
            .shadowRoot.querySelector('[aria-label="Flow zoom"]')
            .textContent !== previous,
        before,
      );
      await controls
        .getByRole("button", { name: "Zoom flow out", exact: true })
        .click();
      await controls
        .getByRole("button", { name: "Fit flow", exact: true })
        .press("Enter");
      await page.waitForTimeout(150);
      const fitted = await page
        .locator(".flow-overview-canvas")
        .getAttribute("style");
      await controls
        .getByRole("button", { name: "Focus step", exact: true })
        .press("Enter");
      await page.waitForFunction(
        (previous) =>
          document
            .querySelector("jev-devtools-root")
            .shadowRoot.querySelector(".flow-overview-canvas")
            .getAttribute("style") !== previous,
        fitted,
      );
      await assertReachable();
      await page
        .getByRole("button", { name: "Close Jev DevTools", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.waitForTimeout(150);
      await revealControls();
      await assertReachable();
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: join(output, `short-controls-${label}.png`),
      });
    } catch (error) {
      await page
        .screenshot({
          path: join(output, `short-controls-${label}-failure.png`),
        })
        .catch(() => {});
      throw error;
    } finally {
      await page.close();
    }
  }
}
