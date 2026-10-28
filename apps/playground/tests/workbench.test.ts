import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript-source";
import { sourceWithComments } from "../src/workbench/source-comments.js";
import { cookbookCatalog } from "../src/workbench/catalog.js";
import { readCookbook } from "../server/workbench.js";
import { mapCookbookSource } from "../server/workbench-source.js";
import type { SourceRange } from "../src/workbench/types.js";

test("every cookbook operation has an exact source range and one tutorial stage", async () => {
  for (const recipe of cookbookCatalog) {
    const detail = await readCookbook(recipe.slug);
    assert.ok(detail);
    assert.ok(detail.overview.purpose && detail.overview.flow);
    const ids = detail.steps.flatMap((step) => step.nodeIds);
    assert.deepEqual(
      [...ids].sort(),
      detail.definition.nodes.map((node) => node.id).sort(),
      recipe.slug,
    );
    const lines = detail.source.split("\n");
    for (const node of detail.definition.nodes) {
      const range: SourceRange = detail.sourceRanges[node.id];
      assert.ok(
        range.start > 0 &&
          range.end <= lines.length &&
          range.start <= range.end,
      );
      const snippet = lines.slice(range.start - 1, range.end).join("\n");
      const id = node.merge?.condition ?? node.id;
      assert.ok(
        snippet.includes(id) || snippet.includes("${"),
        `${recipe.slug}/${id}: range must contain its authoring operation`,
      );
    }
    for (const step of detail.steps) {
      assert.ok(step.explanation.length > 80 && step.originalChapter);
      assert.ok(
        step.explanation.includes("`" + step.api.replace("flow.", "") + "`"),
        `${recipe.slug}/${step.id}: explain the method this step actually adds`,
      );
      assert.ok(
        step.comment.trim(),
        `${recipe.slug}/${step.id}: missing source comment`,
      );
      assert.ok(
        step.ranges.every(
          (range) => range.start > 0 && range.end <= lines.length,
        ),
      );
    }
    assert.ok(
      Object.values(detail.samples).every(
        (sample) => Object.keys(sample).sort().join() === "label,message",
      ),
    );
  }
});

test("source changes cannot silently leave a node mapped to unrelated code", async () => {
  const detail = (await readCookbook("confidence-fallback"))!;
  assert.throws(
    () =>
      mapCookbookSource(
        detail.source.replace('"classify-industry"', '"renamed-request"'),
        detail.definition,
      ),
    /No source mapping/,
  );
  assert.throws(
    () =>
      mapCookbookSource(
        detail.source + '\nflow.jev("classify-industry", {});',
        detail.definition,
      ),
    /Ambiguous source mapping/,
  );
  assert.deepEqual(
    detail.sourceRanges["confident-group-result"],
    detail.sourceRanges["confident-group"],
  );
  assert.equal(
    detail.steps[2].nodeIds.length,
    4,
    "if, two arms, and generated merge form one authored operation",
  );
  const hierarchy = (await readCookbook("hierarchical-classification"))!;
  assert.ok(
    hierarchy.steps
      .find((step) => step.api === "flow.parallel()")
      ?.nodeIds.includes("beam-search"),
    "helper-authored loops belong to the parallel operation",
  );
});

test("cookbook lookup never treats a URL slug as a filesystem path", async () => {
  for (const slug of [
    "../confidence-fallback",
    "__proto__",
    "constructor",
    "%2e%2e/package.json",
    "missing",
  ])
    assert.equal(await readCookbook(slug), undefined);
});

// Notes are copied as real TypeScript comments. Inserting them at an unsafe
// boundary could change a return expression or turn source text into a comment.
test("annotated cookbook copies compile to exactly the original program", async () => {
  for (const recipe of cookbookCatalog) {
    const detail = (await readCookbook(recipe.slug))!;
    const annotated = sourceWithComments(detail);
    assert.notEqual(annotated, detail.source);
    const compile = (source: string) =>
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          removeComments: true,
        },
        reportDiagnostics: true,
      });
    const result = compile(annotated);
    assert.deepEqual(result.diagnostics, [], recipe.slug);
    assert.equal(
      result.outputText,
      compile(detail.source).outputText,
      recipe.slug,
    );
  }
});

// A diagram needs the recorder's real request links, including nested collection
// runs. The authored definition alone cannot supply state, questions, or answers.
test("sample previews retain the drawer capture for every executed request", async () => {
  for (const recipe of cookbookCatalog) {
    const { preview } = (await readCookbook(recipe.slug))!;
    assert.equal(preview.run.status, "success", recipe.slug);
    const traces = new Map(preview.traces.map((trace) => [trace.id, trace]));
    let requests = 0;
    function inspect(run: typeof preview.run) {
      for (const step of Object.values(run.steps)) {
        if (step.traceId) {
          const trace = traces.get(step.traceId);
          assert.ok(trace, `${recipe.slug}: missing request ${step.traceId}`);
          assert.equal(trace.status, "success");
          assert.ok(trace.request && trace.result);
          requests++;
        }
        for (const item of step.collection?.items ?? [])
          if (item.run) inspect(item.run);
      }
    }
    inspect(preview.run);
    assert.equal(requests, preview.traces.length, recipe.slug);
    assert.ok(requests > 0);
    if (recipe.slug === "parallel-questions")
      assert.equal(
        requests,
        70,
        "Preview capture retains the first items even beyond normal drawer history retention",
      );
    if (recipe.slug === "confidence-fallback") {
      const trace = preview.traces[0];
      assert.equal(
        Object.keys(trace.result!.answers.group.probabilities!).length,
        75,
      );
      assert.equal(trace.result!.answers.group.confidence, 0.899);
    }
  }
});

test("preview selection preserves sample boundaries and expected failure captures", async () => {
  assert.equal(await readCookbook("confidence-fallback", "missing"), undefined);
  assert.equal(
    await readCookbook("confidence-fallback", "__proto__"),
    undefined,
  );
  const below = (await readCookbook("confidence-fallback", "below"))!.preview;
  const equal = (await readCookbook("confidence-fallback", "equal"))!.preview;
  assert.equal(below.run.steps["confident-group"].decision, false);
  assert.equal(equal.run.steps["confident-group"].decision, true);
  assert.notEqual(below.run.id, equal.run.id);
  const limit = (await readCookbook("hierarchical-classification", "limit"))!
    .preview;
  assert.equal(limit.run.status, "error");
  assert.match(limit.run.error ?? "", /FlowLoopLimitError/);
});
