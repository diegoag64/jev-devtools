import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import * as zlib from "node:zlib";
import type { Fetch } from "@typesafe-ai/sdk";
import { guardrailsCases, type GuardrailsCase } from "./cases.js";
import { batteries, screenRequest } from "./flow.js";

/** Authored edge cases, not the cookbook's cached measurements. Values need not sum to one. */
const fixtures: Record<
  GuardrailsCase,
  { probabilities: number[]; severity: number }
> = {
  ordinary: { probabilities: [0.01, 0.02, 0.01, 0.01], severity: 0 },
  policy: { probabilities: [0.74, 0.01, 0.02, 0.04], severity: 0.51 },
  review: { probabilities: [0, 0, 0.35, 0], severity: 1 },
  strict: { probabilities: [0.7, 0, 0, 0], severity: 1 },
  permissive: { probabilities: [0.85, 0, 0, 0], severity: 1 },
  severity: { probabilities: [0, 0, 0.85, 0], severity: 2 },
  severityOnly: { probabilities: [0.349, 0.1, 0.2, 0.1], severity: 3 },
  overlap: { probabilities: [0.95, 0.92, 0.5, 0.9], severity: 3 },
  refusal: { probabilities: [0.04, 0.02, 0.01, 0.01], severity: 1.3 },
};
export function guardrailsSampleTransport(
  caseId: GuardrailsCase,
  delayMs = 350,
): Fetch {
  return async (_url, init) => {
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const encoding = new Headers(init?.headers).get("content-encoding");
    const request = JSON.parse(
      encoding === "zstd"
        ? zlib.zstdDecompressSync(bytes).toString()
        : encoding === "gzip"
          ? zlib.gunzipSync(bytes).toString()
          : new TextDecoder().decode(bytes),
    );
    const sample = guardrailsCases[caseId];
    const expected = screenRequest(sample.message, sample.side);
    if (
      request.state !== expected.state ||
      request.model !== expected.model ||
      !isDeepStrictEqual(request.questions, expected.questions)
    )
      throw new Error(
        "Guardrails synthetic fixture does not match the message, model or battery",
      );
    const fixture = fixtures[caseId];
    const answers = Object.fromEntries(
      Object.keys(expected.questions).map((key, index) => [
        key,
        key === "severity"
          ? {
              type: "score",
              score: fixture.severity,
              legend: Object.fromEntries(
                (batteries[sample.side].severity.criteria as string[]).map(
                  (label, level) => [String(level), label],
                ),
              ),
            }
          : { type: "noul", noul: fixture.probabilities[index] },
      ]),
    );
    return Response.json({ model: "synthetic-guardrails-sample", answers });
  };
}
