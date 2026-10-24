import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { mkdir } from "node:fs/promises";

// The host updates the public component prop without remounting. Verify that
// every view uses the projection, while original captures and other viewers do not.
export async function checkRedaction({ page, browser, url, load }) {
  await load("small");
  const requests = [];
  const observe = (request) => {
    if (request.url().includes("/api/small")) requests.push(request.url());
  };
  page.on("request", observe);
  const { requestId } = await page.evaluate(async () =>
    (await fetch("/bench/redaction", { method: "POST" })).json(),
  );
  await expect(page.locator(".detail-meta code").last()).toHaveText(requestId);
  const body = page.locator(".detail-body");
  const personal = "browser-personal@example.test";
  const credential = "browser-credential-sentinel";
  const view = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const prop = (value) => page.selectOption("#display-redaction", value);
  // Question IDs and Choice labels are structural maps, even when their names
  // match personal-data fields. Exercise their real Questions/diagram renderers.
  await view("Questions");
  await expect(
    body.getByRole("heading", { name: "email", exact: true }),
  ).toBeVisible();
  await expect(body).toContainText("Preferred contact method?");
  await expect(body).toContainText("Email reply");
  await expect(body).not.toContainText(personal);
  await expect(body).not.toContainText(credential);
  await view("Flow");
  await expect(body).toContainText("80% probability");
  await expect(body).toContainText("20% probability");
  await expect(body).not.toContainText("NaN");
  await view("Context");
  await expect(body).toContainText("browser-public-customer");
  await expect(body).not.toContainText(personal);
  await expect(body).not.toContainText(credential);
  await view("Raw");
  await expect(body).not.toContainText(personal);
  const beforePropChanges = requests.length;
  await prop("off");
  await expect(body).toContainText(personal);
  await expect(body).not.toContainText(credential);
  await expect(page.locator(".detail-meta code").last()).toHaveText(requestId);
  await prop("on");
  await expect(body).not.toContainText(personal);
  await prop("off");
  await view("Context");
  await expect(body).toContainText(personal);
  await view("Questions");
  await expect(body).toContainText(personal);
  await expect(body).not.toContainText(credential);
  await view("Context");

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
    await other.getByRole("button", { name: "Context", exact: true }).click();
    await expect(other.locator(".detail-body")).not.toContainText(personal);
    await expect(body).toContainText(personal);
    await view("Close Jev DevTools");
    await prop("default");
    await view("Open Jev DevTools");
    await expect(body).not.toContainText(personal);
    await prop("off");
    await expect(body).toContainText(personal);
    await prop("on");
    await expect(body).not.toContainText(personal);

    await view("Flows");
    await view("Show details");
    await page.getByText("Captured outcome value", { exact: true }).click();
    const flow = page.locator(".flow-overview-stack");
    await expect(flow).toContainText("browser-public-customer");
    await expect(flow).not.toContainText(personal);
    await prop("off");
    await expect(flow).toContainText(personal);
    await expect(flow).not.toContainText(credential);
    await prop("on");
    await expect(flow).not.toContainText(personal);
    assert.equal(
      requests.length,
      beforePropChanges,
      "prop changes must not write server settings or reconnect streams",
    );
    await expect(
      page.getByRole("checkbox", { name: "Redact additional sensitive data" }),
    ).toHaveCount(0);

    // Inspect the same server capture independently: personal data is available
    // on the wire regardless of display mode; credentials are never sent.
    const wire = await page.evaluate(async () => {
      const response = await fetch("/api/small/events");
      const reader = response.body.getReader();
      const first = await reader.read();
      await reader.cancel();
      return new TextDecoder().decode(first.value);
    });
    assert.ok(wire.includes(personal));
    assert.ok(!wire.includes(credential));
    await mkdir("benchmarks/results/redaction", { recursive: true });
    await page.screenshot({
      path: "benchmarks/results/redaction/prop-flow-on.png",
    });
    await view("Requests");
    await view("Raw");
    await page.screenshot({
      path: "benchmarks/results/redaction/prop-default.png",
    });
    await prop("off");
    await expect(body).toContainText(personal);
    await page.screenshot({
      path: "benchmarks/results/redaction/prop-off.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await view("Expand Jev drawer");
    await prop("on");
    await expect(body).not.toContainText(personal);
    await page.screenshot({
      path: "benchmarks/results/redaction/prop-mobile.png",
    });
    console.log(
      "Display redaction verified: default-on prop, existing Raw/Context/flow views update immediately, independent viewers, hidden/reopened drawer, no settings writes or reconnects, immutable wire captures and permanent credential protection.",
    );
  } finally {
    page.off("request", observe);
    await other.close();
    await page.setViewportSize({ width: 1710, height: 961 });
  }
}
