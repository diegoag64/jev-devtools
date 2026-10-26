import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { parallelQuestionsCases, type ParallelQuestionsCase } from "./cases.js";
import {
  questionKeys,
  questionRequest,
  repeats,
  type SampleAnswer,
} from "./flow.js";
// Authored responses. Deliberately distinct Choice confidence and max probability.
const baseline: Record<string, SampleAnswer> = {
  breach_72h: { type: "noul", noul: 0.8 },
  applies_non_eu: { type: "noul", noul: 0.99 },
  dpo_all_orgs: { type: "noul", noul: 0.03 },
  pre_ticked_consent: { type: "noul", noul: 0.04 },
  right_erasure: { type: "noul", noul: 0.99 },
  data_portability: { type: "noul", noul: 0.99 },
  us_federal_law: { type: "noul", noul: 0.01 },
  criminal_penalties: { type: "noul", noul: 0.1 },
  instrument_type: {
    type: "choice",
    choice: "Regulation",
    confidence: 0.42,
    probabilities: {
      Regulation: 0.85,
      Directive: 0.1,
      Treaty: 0.03,
      Recommendation: 0.02,
    },
  },
  max_fine: {
    type: "choice",
    choice: "TwentyM_or_4pct",
    confidence: 0.61,
    probabilities: {
      TwentyM_or_4pct: 0.9,
      TenM_or_2pct: 0.06,
      FixedCap: 0.03,
      NoFines: 0.01,
    },
  },
  individual_rights: { type: "score", score: 3 },
  penalty_severity: { type: "score", score: 3 },
  compliance_burden: { type: "score", score: 3 },
};
export function parallelQuestionsSampleTransport(
  caseId: ParallelQuestionsCase,
  delayMs = 35,
): Fetch {
  let ordinal = 0;
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
    const batch = ordinal < repeats;
    const run = batch
      ? ordinal
      : Math.floor((ordinal - repeats) / questionKeys.length);
    const keys = batch
      ? questionKeys
      : [questionKeys[(ordinal - repeats) % questionKeys.length]];
    const expected = questionRequest(
      parallelQuestionsCases[caseId].message,
      keys,
    );
    if (
      run >= repeats ||
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(
        body.questions,
        JSON.parse(JSON.stringify(expected.questions)),
      )
    )
      throw new Error(
        "Parallel questions sample does not match document, question set or request order",
      );
    ordinal++;
    const answers = Object.fromEntries(
      keys.map((key) => {
        let answer = structuredClone(baseline[key]);
        if (caseId === "varied" && key === "breach_72h")
          answer = {
            type: "noul",
            noul: (batch ? [0, 0.25, 0.5, 0.75, 1] : [0.1, 0.3, 0.5, 0.7, 0.9])[
              run
            ],
          };
        if (caseId === "varied" && key === "compliance_burden")
          answer = { type: "score", score: run };
        return [key, answer];
      }),
    );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({ model: "synthetic-parallel-questions", answers });
  };
}
