import test from "node:test";
import assert from "node:assert/strict";
import { apiPreviews, markApiLinks } from "../api-previews.js";
import { compile } from "../site.js";

test("API previews reuse compiled entry content and keep links at a subdirectory base", async () => {
  const { html } = await compile(
    '## Server adapter\n\n### adapter.run\n\nRuns work in a session.\n\n#### Example\n\n```ts\nconst text = "<h3>not a heading</h3>";\n```\n\n[Other](#adapter-handle)\n\n### adapter.handle\n\nServes requests.',
  );
  const { index, fragments } = apiPreviews(html, "/docs/");
  assert.deepEqual(Object.keys(index), ["adapter-run", "adapter-handle"]);
  assert.equal(index["adapter-run"].title, "adapter.run");
  assert.equal(index["adapter-run"].source, "jev-devtools/server");
  assert.equal(index["adapter-run"].summaryHtml, "Runs work in a session.");
  assert.match(
    fragments["adapter-run"],
    /href="\/docs\/api\/reference\/#adapter-handle"/,
  );
  assert.match(
    fragments["adapter-run"],
    /data-api-entry="adapter-handle" data-api-title="adapter.handle"/,
  );
  assert.doesNotMatch(fragments["adapter-run"], /data-api-preview=/);
  assert.match(fragments["adapter-run"], /not a heading/);
  assert.doesNotMatch(fragments["adapter-run"], /Serves requests/);
  const links =
    '<a href="/docs/api/reference/#adapter-run">run</a><a href="#adapter-handle">handle</a><a href="https://elsewhere.test/api/reference/#adapter-run">external</a><a href="#missing">missing</a><a class="heading-link" href="#adapter-run">#</a>';
  assert.equal(
    (
      markApiLinks(links, "/docs/", index, true).match(/data-api-preview=/g) ??
      []
    ).length,
    2,
  );
  assert.equal(
    (
      markApiLinks(links, "/docs/", index, false).match(/data-api-preview=/g) ??
      []
    ).length,
    1,
  );
});

test("standalone entries include shared code-help definitions", async () => {
  const { html } = await compile(
    "## Server adapter\n\n### First\n\nFirst entry.\n\n```ts\nlet options: JevDevtoolsServerOptions;\n```\n\n### Second\n\nSecond entry.\n\n```ts\nlet options: JevDevtoolsServerOptions;\n```",
    "/",
    true,
  );
  const { fragments } = apiPreviews(html, "/");
  for (const body of Object.values(fragments)) {
    const helpId = body.match(/data-type-info="([^"]+)"/)?.[1];
    assert.ok(helpId, "The example includes code help");
    assert.equal(body.split(`id="${helpId}"`).length - 1, 1);
    assert.match(body, /class="type-popup-label">JevDevtoolsServerOptions/);
  }
});
