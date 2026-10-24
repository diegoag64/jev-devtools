import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { mkdir } from "node:fs/promises";

// Real server, SDK fixture, SSE and public drawer. Covers UI synchronization,
// keyboard operation and rejected writes, not the server's alias inventory.
export async function checkRedaction({ page, browser, url, load }) {
  await load("small");
  const checkbox = page.getByRole("checkbox", {
    name: "Redact additional sensitive data",
  });
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  const capture = async (visible) => {
    const { requestId } = await page.evaluate(async () =>
      (await fetch("/bench/redaction", { method: "POST" })).json(),
    );
    await expect(page.locator(".detail-meta code").last()).toHaveText(
      requestId,
    );
    await page.getByRole("button", { name: "Context", exact: true }).click();
    const data = page.locator(".detail-body");
    await expect(data).toContainText("browser-public-customer");
    await expect(data).not.toContainText("browser-credential-sentinel");
    if (visible)
      await expect(data).toContainText("browser-personal@example.test");
    else await expect(data).not.toContainText("browser-personal@example.test");
    return requestId;
  };
  const protectedId = await capture(false);
  const other = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await other.goto(url);
    await other.waitForFunction(() =>
      document.getElementById("status").textContent.startsWith("Ready"),
    );
    await other.selectOption("#scenario", "small");
    await other.click("#load");
    const otherCheckbox = other.getByRole("checkbox", {
      name: "Redact additional sensitive data",
    });
    await expect(otherCheckbox).toBeChecked();
    await expect(otherCheckbox).toBeEnabled();
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(otherCheckbox).not.toBeChecked();
    // A settings-only event must not discard the current trace or reveal history.
    await expect(page.locator(".detail-meta code").last()).toHaveText(
      protectedId,
    );
    await expect(page.locator(".detail-body")).not.toContainText(
      "browser-personal@example.test",
    );
    await capture(true);
    await other
      .getByRole("button", { name: "Close Jev DevTools", exact: true })
      .click();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await other
      .getByRole("button", { name: "Open Jev DevTools", exact: true })
      .click();
    await expect(otherCheckbox).toBeChecked();
    await capture(false);
    await other.reload();
    await other.waitForFunction(() =>
      document.getElementById("status").textContent.startsWith("Ready"),
    );
    await other.selectOption("#scenario", "small");
    await other.click("#load");
    await expect(otherCheckbox).toBeChecked();
    await expect(otherCheckbox).toBeEnabled();

    await page.route("**/api/small/settings", (route) =>
      route.fulfill({ status: 403, body: '{"error":"Unauthorized"}' }),
    );
    await checkbox.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Cannot update redaction (403)",
    );
    await expect(checkbox).toBeChecked();
    await page.unroute("**/api/small/settings");
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await capture(true);
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await capture(false);
    await mkdir("benchmarks/results/redaction", { recursive: true });
    await page.screenshot({ path: "benchmarks/results/redaction/desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(checkbox).toBeVisible();
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(otherCheckbox).not.toBeChecked();
    const box = await checkbox.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    await page.screenshot({ path: "benchmarks/results/redaction/mobile.png" });
    await page
      .getByRole("button", { name: "Expand Jev drawer", exact: true })
      .click();
    await expect(page.locator(".detail-body")).toBeVisible();
    await page.screenshot({
      path: "benchmarks/results/redaction/mobile-expanded.png",
    });
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    console.log(
      "Redaction verified: default-on, new captures, permanent credential masking, shared viewers, hidden/reopened and reloaded drawer, keyboard, rejected writes, desktop and mobile.",
    );
  } finally {
    await other.close();
    await page.setViewportSize({ width: 1710, height: 961 });
  }
}
