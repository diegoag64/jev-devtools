import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { fixtures } from "./fixtures.js";
import { categories } from "./recipe.js";
import { messageRequest } from "./flow.js";
import type { TwitchCase } from "./cases.js";
export function twitchSampleTransport(
  caseId: TwitchCase,
  delayMs = 180,
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
    const rows = fixtures(caseId);
    const index = rows.findIndex(({ message }) => {
      const expected = messageRequest(message);
      return (
        body.model === expected.model &&
        isDeepStrictEqual(body.state, expected.state) &&
        isDeepStrictEqual(
          body.questions,
          JSON.parse(JSON.stringify(expected.questions)),
        )
      );
    });
    if (index < 0)
      throw new Error(
        "Twitch sample does not match stream, message, model and questions",
      );
    // Authored staggering makes concurrent progress visible, not a latency measurement.
    await delay(delayMs * (1 + (index % 3)), undefined, {
      signal: init?.signal ?? undefined,
    });
    const row = rows[index];
    return Response.json({
      model: "synthetic-twitch-sample",
      answers: {
        category: {
          type: "choice",
          choice: row.category,
          confidence: 0.31,
          probabilities: Object.fromEntries(
            categories.map((key) => [key, key === row.category ? 0.8 : 0.05]),
          ),
        },
        toxic: { type: "noul", noul: row.toxic },
        spoiler: { type: "noul", noul: row.spoiler },
      },
    });
  };
}
