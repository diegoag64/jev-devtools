import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import type { NoulCase } from "./cases.js";
import { rubricRequest, questionTexts, repeatCount } from "./flow.js";

// Authored vectors in official question order; never copied from measured outputs.
// Variation crosses 0.5 but remains within the review band for covered/exclusion.
const base = [
  0.49, 0.61, 0.03, 0.12, 0.22, 0.96, 0.98, 0.94, 0.08, 0.31, 0.97, 0.72, 0.99,
  0.92,
];
const offsets = [
  -0.02, 0, 0.01, -0.01, 0.02, 0, -0.01, 0.01, 0, -0.02, 0.02, 0.01, -0.01, 0,
  0.02,
];
const boundaries = [
  0, 0.299, 0.3, 0.301, 0.5, 0.699, 0.7, 0.701, 1, 0.3, 0.7, 0.299, 0.701, 0.5,
  0.5,
];
export function createNoulSample(caseId: NoulCase, delayMs = 120) {
  const returnedModels = new Map<string, string>();
  let next = 0;
  const fetch: Fetch = async (_url, init) => {
    const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const encoding = new Headers(init?.headers).get("content-encoding");
    const body = JSON.parse(
      encoding === "zstd"
        ? zlib.zstdDecompressSync(bytes).toString()
        : encoding === "gzip"
          ? zlib.gunzipSync(bytes).toString()
          : new TextDecoder().decode(bytes),
    );
    const uid = `${next}:synthetic-${caseId}`;
    const expected = rubricRequest(uid);
    if (
      next >= repeatCount ||
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(
        body.questions,
        JSON.parse(JSON.stringify(expected.questions)),
      )
    )
      throw new Error(
        "Noul sample does not match the claim, questions, model or repeat order",
      );
    const index = next++;
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    const model =
      caseId === "variation" && index >= 10
        ? "synthetic-noul-b"
        : "synthetic-noul-a";
    const answers = Object.fromEntries(
      Object.keys(questionTexts).map((key, q) => [
        key,
        {
          type: "noul",
          noul:
            caseId === "boundaries"
              ? boundaries[index]
              : caseId === "stable"
                ? q % 2
                  ? 1
                  : 0
                : Number(
                    Math.min(1, Math.max(0, base[q] + offsets[index])).toFixed(
                      3,
                    ),
                  ),
        },
      ]),
    );
    returnedModels.set(uid, model);
    return Response.json({ model, answers });
  };
  return { fetch, returnedModels };
}
