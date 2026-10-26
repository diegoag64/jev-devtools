import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { dateCases, type DateCase } from "./cases.js";
import { dateRequest, PARTS, type Parts } from "./recipe.js";
const fixtures: Record<string, Parts> = JSON.parse(
  readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"),
);
/** One exact, ordered response per role. All confidences/probabilities are authored samples. */
export function dateSampleTransport(caseId: DateCase, delayMs = 120): Fetch {
  let index = 0;
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
    const entry = dateCases[caseId].entries[index];
    if (!entry) throw new Error("Unexpected extra date sample request");
    const expected = dateRequest(entry.document, entry.role);
    if (
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(body.questions, expected.questions)
    )
      throw new Error(
        "Date sample does not match the next document, role or questions",
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    index++;
    return Response.json({
      model: "synthetic-date-sample",
      answers: Object.fromEntries(
        PARTS.map((part) => {
          const reading = fixtures[entry.id][part]!;
          const labels = Object.keys(expected.questions[part].criteria);
          // Deliberately independent of Choice confidence. Never used for calendar routing.
          const probabilities = Object.fromEntries(
            labels.map((label) => [
              label,
              label === reading.choice ? 0.8 : 0.2 / (labels.length - 1),
            ]),
          );
          return [part, { type: "choice", ...reading, probabilities }];
        }),
      ),
    });
  };
}
