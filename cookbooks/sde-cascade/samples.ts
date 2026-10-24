import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { sdeCases, type SdeCase } from "./cases.js";
import { verifyRequest } from "./flow.js";
/** Exact-match synthetic verification; never returns a fixture for arbitrary input. */
export function sdeSampleTransport(caseId: SdeCase, delayMs = 600): Fetch {
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
    const sample = sdeCases[caseId];
    const expected = verifyRequest(sample.message, sample.cheap);
    if (
      body.model !== expected.model ||
      !isDeepStrictEqual(body.state, expected.state) ||
      !isDeepStrictEqual(body.questions, expected.questions)
    )
      throw new Error(
        "SDE sample does not match the document, extraction or verification questions",
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-sde-sample",
      answers: Object.fromEntries(
        Object.keys(expected.questions).map((id) => [
          id,
          {
            type: "noul",
            noul:
              id === "__overall__::judge"
                ? sample.overall
                : id === sample.flag
                  ? sample.probability
                  : 0.08,
          },
        ]),
      ),
    });
  };
}
