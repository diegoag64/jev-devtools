import assert from "node:assert/strict";
import { join } from "node:path";

// Real public drawer: branch shorthand, loop rule, and expanded rule details.
export async function checkCapturedConditions({ browser, origin, output }) {
  for (const kind of ["branch", "loop"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    try {
      await page.goto(origin);
      await page
        .getByLabel("Scenario", { exact: true })
        .selectOption(`flow-redacted-${kind}`);
      await page
        .getByRole("button", { name: "Run sample flow", exact: true })
        .click();
      await page.locator("#status").filter({ hasText: "done" }).waitFor();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.getByRole("button", { name: "Flows", exact: true }).click();
      await page
        .getByRole("button", { name: "Expand Jev drawer", exact: true })
        .click();
      await page.getByRole("button", { name: "Fit flow", exact: true }).click();
      const card = page.getByRole("button", {
        name: `Step redacted-op, ${kind}, completed`,
        exact: true,
      });
      await card
        .getByText(
          kind === "branch"
            ? "[rule unavailable]"
            : "Continue while [rule unavailable]",
          { exact: true },
        )
        .waitFor();
      await card.getByText(/Rule capture:.*redacted values/).waitFor();
      await page
        .getByLabel("Flow step", { exact: true })
        .selectOption("redacted-op");
      await page
        .getByRole("button", { name: "Show details", exact: true })
        .click();
      await page
        .locator(".flow-selection")
        .getByText("[rule unavailable]", { exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(output, `redacted-${kind}.png`) });
    } catch (error) {
      await page
        .screenshot({ path: join(output, `redacted-${kind}-failure.png`) })
        .catch(() => {});
      throw error;
    } finally {
      await page.close();
    }
  }
  console.log(
    "Redacted branch and loop rules remain inspectable in cards and expanded details.",
  );
}
