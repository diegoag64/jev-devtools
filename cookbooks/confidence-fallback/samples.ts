import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { confidenceCases, type ConfidenceCase } from "./cases.js";
import { industryRequest } from "./flow.js";
import { groupCriteria } from "./taxonomy.js";
// Authored values are intentionally independent: confidence is not computed from
// these probabilities. They test control flow, not model calibration or quality.
const fixtures = {
  below: { group: "38", confidence: 0.899, largest: 0.95 },
  equal: { group: "60", confidence: 0.9, largest: 0.65 },
  above: { group: "20", confidence: 0.901, largest: 0.75 },
  services: { group: "87", confidence: 0.22, largest: 0.45 },
} as const;
export function confidenceSampleTransport(
  caseId: ConfidenceCase,
  delayMs = 500,
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
    const expected = industryRequest(confidenceCases[caseId].message);
    if (
      body.model !== expected.model ||
      body.state !== expected.state ||
      !isDeepStrictEqual(body.questions, expected.questions)
    )
      throw new Error(
        "Confidence sample does not match the document and question set",
      );
    const fixture = fixtures[caseId];
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-confidence-sample",
      answers: {
        group: {
          type: "choice",
          choice: fixture.group,
          confidence: fixture.confidence,
          probabilities: Object.fromEntries(
            Object.keys(groupCriteria).map((group) => [
              group,
              group === fixture.group
                ? fixture.largest
                : (1 - fixture.largest) / 74,
            ]),
          ),
        },
      },
    });
  };
}
