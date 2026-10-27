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
