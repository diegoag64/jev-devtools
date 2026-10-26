import { browserOutput } from "./cookbook-browser-context.mjs";
// Run via npm run verify:cookbooks -- --only collection.
// This checks shared registration/state/transport boundaries; recipe scripts own fidelity checks.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
const output = browserOutput();
const root = fileURLToPath(new URL("../apps/playground/", import.meta.url));
const recipes = [
  ["parallel-questions", "flow-parallel-questions", "parallelQuestionsCase"],
  ["twitch-chat-filter", "flow-twitch", "twitchCase"],
  ["entity-alignment", "flow-entity", "entityCase"],
  ["citation-checking", "flow-citation", "citationCase"],
  ["confidence-fallback", "flow-confidence", "confidenceCase"],
  ["line-search", "flow-line-search", "lineSearchCase"],
  ["reranking", "flow-reranking", "rerankingCase"],
  ["date-extraction", "flow-date", "dateCase"],
  ["pre-parsed-extraction", "flow-extraction", "extractionCase"],
  ["function-calling", "flow-function-calling", "functionCase"],
  ["guardrails", "flow-guardrails", "guardrailsCase"],
  ["consistency-choices", "flow-consistency-choices", "consistencyCase"],
  ["consistency-nouls", "flow-nouls", "noulCase"],
  ["skill-suggestion", "flow-skills", "cookbookCase"],
  ["rag-passages", "flow-rag", "ragCase"],
  ["sde-cascade", "flow-sde", "sdeCase"],
  ["hierarchical-classification", "flow-hierarchy", "hierarchyCase"],
  ["simple-memory", "flow-memory", "memoryCase"],
  ["structure-recovery", "flow-structure", "structureCase"],
];
await mkdir(output, { recursive: true });
const originalFetch = globalThis.fetch;
const originalKey = process.env.TYPESAFE_API_KEY;
process.env.TYPESAFE_API_KEY = "integration-dummy-key-not-a-credential";
const external = [];
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input));
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    external.push(url.origin);
    throw Error("External inference is forbidden in collection verification");
  }
  return originalFetch(input, init);
};
let server, browser;
const checks = [],
  errors = [];
try {
  server = await createServer({
    root,
    configFile: `${root}vite.config.ts`,
    server: { host: "127.0.0.1", port: 4182, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const run = async () => {
    const response = page.waitForResponse(
      (r) => r.url().includes("/__jev/run") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run sample", exact: true }).click();
    const r = await response;
    assert.equal(r.status(), 200, await r.text());
    await page
      .getByRole("button", { name: "Run sample", exact: true })
      .waitFor();
    await page.locator(".cookbook-result").waitFor();
    assert.equal(await page.locator(".cookbook-result").count(), 1);
    return { body: await r.json(), request: r.request().postDataJSON() };
  };
  const traces = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const events = new EventSource("/api/jev-devtools/events");
          const timer = setTimeout(() => {
            events.close();
            reject(Error("Trace snapshot timed out"));
          }, 5000);
          events.addEventListener("snapshot", (event) => {
            clearTimeout(timer);
            events.close();
            resolve(JSON.parse(event.data).traces);
          });
        }),
    );
  let session;
  for (const [index, [slug, scenario, caseField]] of recipes.entries()) {
    await page.goto(`http://127.0.0.1:4182/?cookbook=${slug}`);
    await page.locator("#scenario").waitFor();
    assert.equal(await page.locator("#scenario").inputValue(), scenario);
    const nextSession = await page.evaluate(() =>
      sessionStorage.getItem("jev-inspector-session"),
    );
    if (session) assert.equal(nextSession, session);
    else session = nextSession;
    assert.equal(await page.locator("#context").getAttribute("readonly"), "");
    if (scenario !== "flow-skills")
      assert.equal(
        await page.locator('#transport option[value="live"]').isDisabled(),
        true,
      );
    const { body, request } = await run();
    assert.equal(request.scenario, scenario);
    assert.ok(request[caseField]);
    const captured = await traces();
    assert.ok(captured.every((t) => t.source === "sample"));
    if (slug === "parallel-questions") {
      assert.equal(body.flow.value.rows.length, 13);
      assert.equal(
        body.flow.value.rows.reduce(
          (n, r) => n + r.batched.length + r.singles.length,
          0,
        ),
        130,
      );
      assert.equal(
        await page.locator(".cookbook-result details pre").count(),
        65,
      );
      assert.equal(captured.length, 50);
      assert.ok(
        captured.filter((t) => t.label.includes("Parallel")).length < 70,
      );
      checks.push({
        check: "trace eviction preserves all 130 application answers",
        retainedTraces: captured.length,
      });
    }
    if (slug === "consistency-choices")
      assert.equal(await page.locator(".consistency-cell").count(), 120);
    if (slug === "consistency-nouls") {
      assert.equal(await page.locator(".noul-matrix tbody td").count(), 210);
      assert.ok(
        body.flow.value.repeats.every(
          (r) => r.returnedModel && r.requestedModel,
        ),
      );
    }
    if (slug === "line-search")
      assert.equal(
        await page.locator(".cookbook-result details li").count(),
        218,
      );
    if (slug === "function-calling")
      assert.ok(
        captured.some(
          (t) => Object.keys(t.result?.answers ?? {}).length === 54,
        ),
      );
    if (index < 13) {
      const statuses = await page.evaluate(
        async ({ request, caseField }) => {
          const post = async (extra) =>
            (
              await fetch(
                `/__jev/run?session=${sessionStorage.getItem("jev-inspector-session")}`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    ...request,
                    runId: crypto.randomUUID(),
                    ...extra,
                  }),
                },
              )
            ).status;
          return [
            await post({ message: request.message + " changed" }),
            await post({ [caseField]: "invalid-case" }),
            await post({ mode: "live" }),
          ];
        },
        { request, caseField },
      );
      assert.deepEqual(statuses, [400, 400, 400]);
      const control = page.locator('select[id$="-case"]');
      const options = await control
        .locator("option")
        .evaluateAll((es) => es.map((e) => e.value));
      if (options.length > 1) {
        await control.selectOption(
          options.find((v) => v !== request[caseField]),
        );
        assert.equal(await page.locator(".cookbook-result").count(), 0);
        await run();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const width = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(
      width.body <= width.viewport + 1,
      `${slug}: mobile overflow ${JSON.stringify(width)}`,
    );
    await page.screenshot({
      path: `${output}/${slug}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push({
      slug,
      scenario,
      outcome: body.flow.outcome,
      status: "passed",
    });
  }
  // Changing the scenario in one mounted app must clear the previous result and select its own input/transport.
  for (const index of [11, 17, 12, 14, 9, 13, 0, 18]) {
    const [, scenario] = recipes[index];
    await page.locator("#scenario").selectOption(scenario);
    assert.equal(await page.locator(".cookbook-result").count(), 0);
    assert.equal(await page.locator("#transport").inputValue(), "sample");
    await run();
  }
  await page.locator("#scenario").selectOption("flow-parallel-questions");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Run sample", exact: true }).waitFor();
  assert.equal(await page.locator(".cookbook-result").count(), 0);
  for (const scenario of [
    "triage",
    "image",
    "retry",
    "error",
    "stress",
    "flow-approve",
    "flow-functions",
    "flow-manual",
    "flow-other",
    "flow-parallel",
    "flow-error",
    "flow-cancel",
  ]) {
    assert.equal(
      await page.locator(`#scenario option[value="${scenario}"]`).count(),
      1,
    );
  }
  await page.locator("#scenario").selectOption("triage");
  const response = page.waitForResponse((r) => r.url().includes("/__jev/run"));
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  assert.equal((await response).status(), 200);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        status: "passed",
        checks,
        sharedSwitches: 8,
        cancellation: "passed",
        ordinaryScenario: "triage passed; all base options retained",
        external,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Collection browser checks passed: 19 URLs, sample guards, desktop/mobile, switching and eviction.",
  );
} finally {
  await browser?.close();
  await server?.close();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = originalKey;
}
