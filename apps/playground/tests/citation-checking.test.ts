import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  citationFlow,
  type CitationResult,
} from "../../../cookbooks/citation-checking/flow.js";
import {
  citationCases,
  type CitationCase,
} from "../../../cookbooks/citation-checking/cases.js";
import { citationSampleTransport } from "../../../cookbooks/citation-checking/samples.js";
import {
  citations,
  source,
  loadSource,
  splitSections,
  normalize,
  locate,
  relationQuestions,
} from "../../../cookbooks/citation-checking/recipe.js";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CitationCookbookResult } from "../src/CitationCookbookResult.js";

// Contract: normalization and numeric section selection precede inference. A
// substring in the wrong cited section must send its actual matching section.
test("citation matching retains the RFC parser and exact normalized substring semantics", () => {
  const sections = splitSections(loadSource(source));
  assert.equal(Object.keys(sections).length, 45);
  assert.equal(loadSource(source).length, 58365);
  assert.deepEqual(
    citations.map((c) => locate(sections, c).section?.length ?? null),
    [3122, 761, null, 529, 529, 1653, 270, 918],
  );
  assert.deepEqual(
    citations.map((c) => locate(sections, c).status),
    [
      "found",
      "found",
      "missing",
      "found",
      "found",
      "found",
      "section-only",
      "found",
    ],
  );
  assert.equal(normalize(" \t‘A’\n“B”\u0085C "), "'A' \"B\" C");
  assert.equal(
    locate(sections, { ...citations[1], section: "nonexistent" }).sectionNumber,
    "4.1.3",
  );
  assert.equal(locate(sections, citations[6]).section, sections["4.1.6"]);
  assert.throws(
    () => locate(sections, { ...citations[6], section: "nonexistent" }),
    /Unknown cited section/,
  );
  assert.equal(
    locate(
      { "10": "same", "2.10": "same", "2.2": "same", "2": "same" },
      { ...citations[0], quote: "same" },
    ).sectionNumber,
    "2",
  );
  assert.equal(
    locate(sections, { ...citations[1], quote: "" }).sectionNumber,
    "1",
  ); // Upstream empty-string behavior, distinct from null.
  assert.equal(
    locate(sections, {
      ...citations[1],
      quote: citations[1].quote!.toLowerCase(),
    }).status,
    "missing",
  );
  assert.deepEqual(
    splitSections(
      "1.  First\nbody\n2.1.  Nested\ntext\nAppendix A. End\nappendix",
    ),
    { "1": "1.  First\nbody", "2.1": "2.1.  Nested\ntext" },
  );
  assert.equal(
    loadSource(
      "RFC 7519                  JSON Web Token (JWT)                  May 2015\nhello\nJones, et al.                Standards Track                    [Page 1]\n\f\nworld",
    ),
    "hello\n\nworld",
  );
});

test("pinned official assets retain their provenance hashes and copyright notice", () => {
  const root = new URL(
    "../../../cookbooks/citation-checking/",
    import.meta.url,
  );
  const provenance = JSON.parse(
    readFileSync(new URL("provenance.json", root), "utf8"),
  );
  for (const asset of provenance.assets)
    assert.equal(
      createHash("sha256")
        .update(readFileSync(new URL(asset.path, root)))
        .digest("hex"),
      asset.sha256,
    );
  assert.match(source, /Copyright \(c\) 2015 IETF Trust/);
});

async function runCase(caseId: CitationCase) {
  const requests: any[] = [];
  const transport = citationSampleTransport(caseId, 0);
  let captured: FlowRun | undefined;
  const client = new TypeSafeClient({
    apiKey: "sample-only",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return transport(url, init);
    },
  });
  const output = await citationFlow.run(
    { caseId, message: citationCases[caseId].message },
    {
      client,
      devtools: {
        startFlow: () => ({
          update: (run) => {
            captured = run;
          },
          request: (_label, _tags, callback) => callback(),
        }),
      },
    },
  );
  return {
    rows: (output.value as CitationResult).rows,
    requests,
    captured: captured!,
  };
}

// Contract: public Flow execution must conditionally skip inference and preserve
// citation order and the selected verdict independently of confidence routing.
test("all five citation samples execute real tasks and exact conditional requests", async () => {
  const counts = {
    original: 7,
    missing: 0,
    section: 1,
    boundary: 3,
    matching: 2,
  };
  for (const caseId of Object.keys(citationCases) as CitationCase[]) {
    const { rows, requests, captured } = await runCase(caseId);
    assert.equal(requests.length, counts[caseId]);
    assert.equal(captured.status, "success");
    const items = captured.steps["check-citations"].collection!.items;
    assert.equal(items.length, rows.length);
    for (const [index, row] of rows.entries()) {
      const steps = items[index].run!.steps;
      assert.equal(steps["locate-quote"].status, "completed");
      assert.equal(
        steps["assess-support"].status,
        row.answer === null ? "untaken" : "completed",
      );
      assert.equal(
        steps["fabricated"].status,
        row.answer === null ? "completed" : "untaken",
      );
      if (row.answer !== null) {
        assert.equal(
          steps[row.auto ? "accept-verdict" : "human-review"].status,
          "completed",
        );
        assert.equal(
          steps[row.auto ? "human-review" : "accept-verdict"].status,
          "untaken",
        );
      }
    }
    const inferred = rows.filter((row) => row.answer !== null);
    assert.deepEqual(
      requests.map((request) => request.state),
      inferred.map((row) => ({
        claim: row.citation.claim,
        section: row.section,
      })),
    );
    for (const request of requests) {
      assert.deepEqual(request.questions, relationQuestions);
      assert.equal(request.model, "jev-1.12");
    }
    for (const row of rows) {
      if (row.status === "missing") {
        assert.equal(row.verdict, "fabricated");
        assert.equal(row.confidence, null);
        assert.equal(row.answer, null);
        assert.equal(row.auto, true);
      } else {
        assert.equal(row.auto, row.confidence! >= 0.8);
        assert.equal(row.answer!.probabilities[row.answer!.choice], 0.6);
      }
    }
    if (caseId === "original") {
      assert.deepEqual(
        rows.map((row) => row.citation.id),
        citations.map((c) => c.id),
      );
      assert.deepEqual(
        rows.map((row) => row.verdict),
        [
          "verified",
          "verified",
          "fabricated",
          "verified",
          "contradicted",
          "unsupported",
          "unsupported",
          "verified",
        ],
      );
      assert.deepEqual(
        rows.filter((row) => !row.auto).map((row) => row.citation.id),
        ["pii_encryption", "iat_future"],
      );
    }
    if (caseId === "boundary") {
      assert.deepEqual(
        rows.map((row) => row.auto),
        [false, true, true],
      );
      assert.deepEqual(
        rows.map((row) => row.confidence),
        [0.7999, 0.8, 0.8001],
      );
    }
    if (caseId === "matching") {
      assert.deepEqual(
        rows.map((row) => row.status),
        ["found", "found", "missing"],
      );
      assert.equal(rows[1].sectionNumber, "4.1.3");
    }
    if (caseId === "missing") {
      const html = renderToStaticMarkup(
        createElement(CitationCookbookResult, { result: { value: { rows } } }),
      );
      assert.match(html, /null · no Jev call/);
      assert.match(html, /fabricated deterministically/);
    }
    if (caseId === "section") {
      const html = renderToStaticMarkup(
        createElement(CitationCookbookResult, { result: { value: { rows } } }),
      );
      assert.match(html, /Human review required/);
      assert.match(html, /No quote supplied/);
      assert.match(html, /Choice probabilities · separate from confidence/);
    }
  }
});

test("citation fixtures reject stale inputs, altered prompts and unexpected calls", async () => {
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: citationSampleTransport("original", 0),
  });
  await assert.rejects(
    citationFlow.run({ caseId: "original", message: "edited" }, { client }),
    /No citation sample/,
  );
  const section = locate(
    splitSections(loadSource(source)),
    citations[0],
  ).section;
  const body = {
    model: "jev-1.12",
    state: { claim: citations[0].claim, section },
    questions: relationQuestions,
  };
  for (const changed of [
    { ...body, model: "different" },
    { ...body, questions: {} },
    { ...body, state: { ...body.state, section: "wrong" } },
  ]) {
    await assert.rejects(
      citationSampleTransport("original", 0)("https://sample.invalid", {
        body: JSON.stringify(changed),
      }),
      /does not match/,
    );
  }
  await assert.rejects(
    citationSampleTransport("missing", 0)("https://sample.invalid", {
      body: JSON.stringify(body),
    }),
    /does not match/,
  );
});

test("failed citation inference never yields a completed verdict list", async () => {
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      calls++;
      throw new Error("synthetic failure");
    },
  });
  await assert.rejects(
    citationFlow.run(
      { caseId: "original", message: citationCases.original.message },
      { client },
    ),
  );
  assert.equal(calls, 1);
});
