import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { lineSearchCases, type LineSearchCase } from "./cases.js";
import { lineId, searchRequest, sourceLines, tagLines } from "./flow.js";

// Authored distributions inspired by the printed recipe examples, not recorded API responses.
const fixtures = {
  ownership: {
    exists: 0.98,
    weights: { L052: 0.95, L046: 0.02, L051: 0.02, L217: 0.01 },
  },
  termination: { exists: 0.97, weights: { L168: 0.97, L167: 0.03 } },
  absent: { exists: 0.14, weights: { L205: 0.86, L168: 0.02 } },
  partial: { exists: 0.46, weights: { L029: 0.9, L012: 0.07, L217: 0.03 } },
};
const boundary = {
  belowAbsent: 0.3499,
  atAbsent: 0.35,
  aboveAbsent: 0.3501,
  belowFound: 0.6999,
  atFound: 0.7,
  aboveFound: 0.7001,
};
export function lineSearchSampleTransport(
  caseId: LineSearchCase,
  delayMs = 400,
): Fetch {
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
    const expected = searchRequest(
      lineSearchCases[caseId].message,
      tagLines(sourceLines),
    );
    if (
      body.model !== expected.model ||
      body.state !== expected.state ||
      !isDeepStrictEqual(body.questions, expected.questions)
    )
      throw new Error(
        "Line-search fixture does not match the complete request",
      );
    const base =
      caseId in fixtures
        ? fixtures[caseId as keyof typeof fixtures]
        : caseId.endsWith("Absent")
          ? fixtures.absent
          : fixtures.ownership;
    const exists =
      caseId in boundary
        ? boundary[caseId as keyof typeof boundary]
        : base.exists;
    const weights: Record<string, number> = base.weights;
    // Spread the unprinted residual mass below the source example’s second-ranked line.
    const residual =
      base === fixtures.absent ? 0.12 / (sourceLines.length - 2) : 0;
    const probabilities = Object.fromEntries(
      sourceLines.map((_, i) => [lineId(i), weights[lineId(i)] ?? residual]),
    );
    const winner = Object.keys(probabilities).sort(
      (a, b) => probabilities[b] - probabilities[a],
    )[0];
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-line-search-sample",
      answers: {
        where: {
          type: "choice",
          choice: winner,
          probabilities,
          confidence: 0.41,
        },
        exists: { type: "noul", noul: exists },
      },
    });
  };
}
