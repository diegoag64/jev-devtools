import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import type { ExtractionCase } from "./cases.js";
// Authored request/response transcripts, independent of runtime request builders.
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"),
) as Record<
  ExtractionCase,
  {
    request: {
      model: string;
      state: string;
      questions: Record<string, unknown>;
    };
    answers: Record<string, unknown>;
  }[]
>;
export function extractionSampleTransport(
  caseId: ExtractionCase,
  delayMs = 180,
): Fetch {
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
    const expected = fixtures[caseId][index];
    if (
      !expected ||
      body.model !== expected.request.model ||
      body.state !== expected.request.state ||
      !isDeepStrictEqual(body.questions, expected.request.questions)
    )
      throw new Error(
        `Extraction sample does not match helper request ${index + 1}`,
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    index++;
    return Response.json({
      model: "synthetic-pre-parsed-extraction",
      answers: expected.answers,
    });
  };
}
