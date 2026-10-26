import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { isConsistencyCase, type ConsistencyCase } from "./cases.js";
import { rubric, rubricHash, rubricRequest } from "./recipe.js";
import type { RawAnswer } from "./analysis.js";
// Authored fixtures: these are not upstream model outputs or measured repeatability.
const winners = [
  "Violence",
  "Harassment",
  "Person",
  "Strike",
  "Threat",
  "RmLink",
  "Senior",
  "High",
];
const alternates = [
  "Harass",
  "Violence",
  "Platform",
  "Remove",
  "General",
  "Brigade",
  "Human",
  "Medium",
];
export function fixtureAnswers(
  caseId: ConsistencyCase,
  index: number,
): Record<string, RawAnswer> {
  return Object.fromEntries(
    Object.entries(rubric).map(([key, [, criteria]], q) => {
      const labels = Object.keys(criteria);
      let winner = winners[q];
      let probability = 0.75 + (index % 3) * 0.05;
      if (caseId === "varying") {
        if (q === 1 || q === 5) {
          winner = index % 2 ? alternates[q] : winners[q];
          probability = 0.51 + (index % 3) * 0.02;
        } else if (q === 0) probability = index % 3 === 0 ? 0.59 : 0.65;
        else if (q === 3) winner = index < 10 ? winners[q] : alternates[q];
      } else if (caseId === "boundaries") {
        probability = [0.599, 0.6, 0.601][index % 3];
      }
      const second = winner === winners[q] ? alternates[q] : winners[q];
      return [
        key,
        {
          type: "choice",
          choice: winner,
          // Deliberately contrast confidence with probability in both directions.
          confidence: index % 3 === 0 ? 0.99 : 0.1,
          probabilities: Object.fromEntries(
            labels.map((label) => [
              label,
              label === winner
                ? probability
                : label === second
                  ? 1 - probability
                  : 0,
            ]),
          ),
        },
      ];
    }),
  );
}
export function consistencySampleTransport(
  caseId: ConsistencyCase,
  delayMs = 120,
): Fetch {
  if (!isConsistencyCase(caseId)) throw new Error("Unknown consistency sample");
  let nextIndex = 0;
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
    const uid = body.state?.uid;
    const match =
      typeof uid === "string" &&
      new RegExp(`^${rubricHash}:(\\d+):[a-f0-9]{8}$`).exec(uid);
    const index = match ? Number(match[1]) : -1;
    const expected = rubricRequest({ uid });
    if (
      index !== nextIndex ||
      index >= 15 ||
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(body.questions, expected.questions)
    )
      throw new Error(
        "Consistency sample does not match the post, rubric, uid or sequential repeat index",
      );
    nextIndex++;
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-consistency-choices",
      answers: fixtureAnswers(caseId, index),
    });
  };
}
