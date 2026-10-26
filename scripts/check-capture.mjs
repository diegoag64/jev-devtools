import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { mkdir } from "node:fs/promises";

// Real SDK -> recorder -> SSE -> public drawer, with independent pages so a
// pre-fix crash in one scenario does not hide the other regression.
export async function checkCapture({ browser, url }) {
  const directory =
    process.env.JEV_CAPTURE_EVIDENCE || "benchmarks/results/capture-view";
  await mkdir(directory, { recursive: true });
  const failures = [];
  for (const mode of ["normal", "root-null", "score-string"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      // Reset retained history before mounting, including after a baseline crash.
      const reset = await fetch(`${url}/bench/capture?mode=normal`, {
        method: "POST",
        headers: { origin: url },
      });
      assert.equal(reset.status, 200);
      await page.goto(url);
      await page.waitForFunction(() =>
        document.getElementById("status").textContent.startsWith("Ready"),
      );
      await page.selectOption("#scenario", "small");
      await page.click("#load");
      await expect(
        page.getByRole("button", { name: "Flow", exact: true }),
      ).toBeVisible();
      await page.evaluate(async (mode) => {
        const response = await fetch(`/bench/capture?mode=${mode}`, {
          method: "POST",
        });
        if (!response.ok) throw new Error(await response.text());
      }, mode);
      await expect
        .poll(
          async () =>
            errors.length ||
            (
              await page
                .locator(".detail-meta")
                .textContent()
                .catch(() => "")
            )?.includes(`capture-${mode}`),
          { timeout: 5000 },
        )
        .toBeTruthy();
      await page.screenshot({ path: `${directory}/${mode}-flow.png` });
      assert.deepEqual(errors, [], `${mode}: browser exceptions`);
      const body = page.locator(".detail-body");
      if (mode === "normal") await expect(body).toContainText("Score 1.00");
      else {
        await expect(body).toContainText("unavailable in this capture");
        await expect(body).toContainText("structured view unavailable");
      }
      for (const view of ["Questions", "Context", "Transport", "Raw"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect(body).not.toContainText("capture-secret");
        await expect(body).not.toContainText("capture-personal@example.test");
        if (view === "Raw") {
          await expect(body).toContainText(
            mode === "normal" ? '"score": 1' : '"capture"',
          );
          if (mode === "root-null")
            await expect(body).toContainText('"request": null');
          if (mode === "score-string")
            await expect(body).toContainText('"score": "[redacted]"');
          await page.screenshot({ path: `${directory}/${mode}-raw.png` });
        }
      }
      await page.selectOption("#display-redaction", "off");
      if (mode !== "root-null")
        await expect(body).toContainText("capture-personal@example.test");
      await expect(body).not.toContainText("capture-secret");
      await page
        .getByRole("button", { name: "Close Jev DevTools", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Open Jev DevTools", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(".request-row").first().click();
      await page.getByRole("button", { name: "Flow", exact: true }).click();
      if (mode !== "normal") {
        await expect(body).toContainText("unavailable in this capture");
        const text = body.locator(".muted").last();
        assert.ok(
          await text.evaluate(
            (element) => getComputedStyle(element).color !== "rgba(0, 0, 0, 0)",
          ),
        );
      }
      await page.screenshot({ path: `${directory}/${mode}-mobile.png` });
      assert.deepEqual(errors, []);
      console.log(`Capture browser ${mode}: passed`);
    } catch (error) {
      failures.push(error);
    } finally {
      await page.close();
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Capture browser regressions failed");
}
