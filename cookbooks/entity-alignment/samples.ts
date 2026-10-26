import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { entityCases, type EntityCase } from "./cases.js";
import { alignmentRequest, preparePair, levels } from "./flow.js";
/** Authored responses, not the official cache or a model evaluation. */
const fixtures: Record<EntityCase, { score: number; properties: number[] }> = {
  same: { score: 1.8, properties: [0.96, 0.97, 0.76] },
  different: { score: 0.2, properties: [0.04, 0.06, 0.12] },
  style: { score: 1.2, properties: [0.96, 0.93, 0.3] },
  variant: { score: 1.1, properties: [0.6, 0.97, 0.7] },
  // Deliberately opposing companions demonstrate that they never gate routing.
  belowLower: { score: 0.499, properties: [1, 1, 1] },
  atLower: { score: 0.5, properties: [0, 0, 0] },
  aboveLower: { score: 0.501, properties: [1, 1, 1] },
  belowUpper: { score: 1.499, properties: [1, 1, 1] },
  atUpper: { score: 1.5, properties: [0, 0, 0] },
  aboveUpper: { score: 1.501, properties: [0, 0, 0] },
};
export function entitySampleTransport(
  caseId: EntityCase,
  delayMs = 450,
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
    const expected = alignmentRequest(
      preparePair({ caseId, message: entityCases[caseId].message }),
    );
    if (
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(
        body.questions,
        JSON.parse(JSON.stringify(expected.questions)),
      )
    )
      throw new Error("Entity sample does not match the pair and question set");
    const fixture = fixtures[caseId];
    // A synthetic distribution with expected level equal to the authored Score.
    // Score confidence is supplied separately, never inferred from max probability.
    const lower = Math.floor(fixture.score),
      fraction = fixture.score - lower;
    const probabilities = Object.fromEntries(
      levels.map((_, i) => [
        i,
        i === lower ? 1 - fraction : i === lower + 1 ? fraction : 0,
      ]),
    );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-entity-alignment-sample",
      answers: {
        link_state: {
          type: "score",
          score: fixture.score,
          legend: Object.fromEntries(levels.map((label, i) => [i, label])),
          probabilities,
          confidence: 0.37,
        },
        same_name: { type: "noul", noul: fixture.properties[0] },
        same_brewery: { type: "noul", noul: fixture.properties[1] },
        same_style: { type: "noul", noul: fixture.properties[2] },
      },
    });
  };
}
