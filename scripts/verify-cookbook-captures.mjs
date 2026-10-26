// Compare final retained captures with complete application results. The dedicated
// server mode retains 200 requests; the collection probe separately tests default-50 eviction.
import { browserOutput } from "./cookbook-browser-context.mjs";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const root = process.cwd(),
  output = browserOutput();
process.env.TYPESAFE_API_KEY = "";
const server = await createServer({
  root: root + "/apps/playground",
  configFile: root + "/apps/playground/vite.config.ts",
  mode: "capture-verification",
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
let browser;
const checks = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => console.error("Browser page error:", error));
  for (const [slug, count] of [
    ["parallel-questions", 70],
    ["consistency-choices", 15],
    ["consistency-nouls", 15],
    ["function-calling", 1],
    ["line-search", 1],
  ]) {
    await page.goto("http://127.0.0.1:4182/?cookbook=" + slug);
    await page.locator("#scenario").waitFor();
    await page.evaluate(async () => {
      const response = await fetch("/api/jev-devtools/clear", {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("Could not clear prior capture history");
    });
    const response = page.waitForResponse((r) =>
      r.url().includes("/__jev/run"),
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    const data = await (await response).json();
    // Subscribe after completion: the initial snapshot must contain every
    // request, regardless of delivery coalescing or backpressure during the run.
    const traces = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const stream = new EventSource("/api/jev-devtools/events");
          const timer = setTimeout(() => {
            stream.close();
            reject(new Error("Final capture snapshot timed out"));
          }, 5000);
          stream.addEventListener("snapshot", (event) => {
            clearTimeout(timer);
            stream.close();
            resolve(
              JSON.parse(event.data).traces.sort(
                (a, b) => a.startedAt - b.startedAt,
              ),
            );
          });
        }),
    );
    assert.equal(
      traces.length,
      count,
      `${slug}: complete final capture history`,
    );
    assert.ok(traces.every((trace) => trace.status === "success"));
    const value = data.flow.value;
    await writeFile(
      output + "/capture-" + slug + ".json",
      JSON.stringify({ value, traces }),
    );
    let answers = 0;
    if (slug === "parallel-questions") {
      const batches = traces.filter(
          (t) => Object.keys(t.result.answers).length === 13,
        ),
        singles = traces.filter(
          (t) => Object.keys(t.result.answers).length === 1,
        );
      assert.equal(batches.length, 5);
      assert.equal(singles.length, 65);
      for (const row of value.rows) {
        const individual = singles.filter((t) => row.key in t.result.answers);
        for (let i = 0; i < 5; i++) {
          for (const [raw, captured] of [
            [row.batched[i].answer, batches[i].result.answers[row.key]],
            [row.singles[i].answer, individual[i].result.answers[row.key]],
          ]) {
            for (const k of Object.keys(raw))
              assert.deepEqual(captured[k], raw[k]);
            answers++;
          }
        }
      }
    } else if (slug === "consistency-choices") {
      for (const sample of value.samples) {
        const trace = traces.find((t) => t.request.state.uid === sample.uid);
        assert.ok(trace);
        for (const [key, raw] of Object.entries(sample.answers)) {
          for (const k of Object.keys(raw))
            assert.deepEqual(trace.result.answers[key][k], raw[k]);
          answers++;
        }
      }
      const cells = page.locator(".consistency-cell");
      assert.equal(await cells.count(), 120);
      for (let i = 0; i < 120; i++) {
        await cells.nth(i).click();
        assert.equal(await cells.nth(i).getAttribute("aria-pressed"), "true");
        assert.ok(
          (await page.locator(".consistency-detail[aria-live] dl").innerText())
            .length > 0,
        );
      }
    } else if (slug === "consistency-nouls") {
      for (const repeat of value.repeats) {
        const trace = traces.find((t) => t.request.state.uid === repeat.uid);
        assert.ok(trace);
        assert.equal(trace.result.model, repeat.returnedModel);
        assert.equal(trace.request.model, repeat.requestedModel);
        for (const a of repeat.answers) {
          assert.equal(trace.result.answers[a.key].noul, a.probability);
          answers++;
        }
      }
    } else if (slug === "function-calling") {
      assert.equal(Object.keys(traces[0].request.questions).length, 54);
      assert.equal(Object.keys(traces[0].result.answers).length, 54);
      answers = 54;
    } else if (slug === "line-search") {
      const choice = Object.values(traces[0].result.answers).find(
        (a) => a.type === "choice",
      );
      assert.equal(value.ranked.length, 218);
      for (const line of value.ranked) {
        assert.equal(choice.probabilities[line.id], line.probability);
        answers++;
      }
    }
    checks.push({ slug, requests: traces.length, answers, status: "passed" });
  }
  await writeFile(
    output + "/summary.json",
    JSON.stringify({ status: "passed", checks }, null, 2),
  );
  console.log(JSON.stringify(checks));
} finally {
  await browser?.close();
  await server.close();
}
