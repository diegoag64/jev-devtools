import * as zlib from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import type { Fetch } from "@typesafe-ai/sdk";
import { citationCases, type CitationCase } from "./cases.js";
import {
  sampleCitations,
  source,
  loadSource,
  splitSections,
  locate,
  relationQuestions,
  type Relation,
} from "./recipe.js";
/** Authored answers, not the official cache or measured inference. No usage/timing claims. */
export function citationSampleTransport(
  caseId: CitationCase,
  delayMs = 250,
): Fetch {
  const sections = splitSections(loadSource(source));
  const expected = sampleCitations(caseId, citationCases[caseId].message)
    .map((c) => locate(sections, c))
    .filter((e) => e.status !== "missing");
  let next = 0;
  return async (_url, init) => {
    const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const encoding = new Headers(init?.headers).get("content-encoding");
    const body = JSON.parse(
      encoding === "zstd"
        ? zlib.zstdDecompressSync(bytes).toString()
        : encoding === "gzip"
          ? zlib.gunzipSync(bytes).toString()
          : new TextDecoder().decode(bytes),
    );
    const evidence = expected[next];
    if (
      !evidence ||
      body.model !== "jev-1.12" ||
      JSON.stringify(body.state) !==
        JSON.stringify({
          claim: evidence.citation.claim,
          section: evidence.section,
        }) ||
      JSON.stringify(body.questions) !== JSON.stringify(relationQuestions)
    )
      throw new Error(
        "Citation sample does not match request order, state, model or questions",
      );
    next++;
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    const id = evidence.citation.id;
    const relation: Relation =
      id === "exp_required"
        ? "contradicts"
        : ["pii_encryption", "iat_future"].includes(id)
          ? "says_nothing"
          : "supports";
    const confidence =
      id === "below"
        ? 0.7999
        : id === "at"
          ? 0.8
          : id === "above"
            ? 0.8001
            : relation === "says_nothing"
              ? 0.45
              : 0.91;
    return Response.json({
      model: "synthetic-citation-sample",
      answers: {
        relation: {
          type: "choice",
          choice: relation,
          confidence,
          probabilities: Object.fromEntries(
            (["supports", "contradicts", "says_nothing"] as const).map(
              (key) => [key, key === relation ? 0.6 : 0.2],
            ),
          ),
        },
      },
    });
  };
}
