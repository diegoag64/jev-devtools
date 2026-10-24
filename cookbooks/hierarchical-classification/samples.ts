import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { hierarchyCases, type HierarchyCase } from "./cases.js";
import { childRequest } from "./flow.js";
const distributions = [
  { labels: ["Audio", "Cameras", "Accessories"], values: [0.55, 0.35, 0.1] },
  {
    labels: ["Speakers", "Headphones", "Receivers"],
    values: [0.34, 0.33, 0.33],
  },
  { labels: ["Mirrorless", "Compact"], values: [0.95, 0.05] },
];
export function hierarchySampleTransport(
  caseId: HierarchyCase,
  delayMs = 400,
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
    const fixture = distributions.find(({ labels }) => {
      const expected = childRequest(hierarchyCases[caseId].message, labels);
      return (
        body.model === expected.model &&
        body.state === expected.state &&
        isDeepStrictEqual(body.questions, expected.questions)
      );
    });
    if (!fixture || !["recovery", "limit"].includes(caseId))
      throw new Error(
        "Hierarchy sample does not match the document and sibling set",
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    const winner = fixture.values.indexOf(Math.max(...fixture.values));
    return Response.json({
      model: "synthetic-hierarchy-sample",
      answers: {
        child: {
          type: "choice",
          choice: `c${winner}`,
          confidence: 0.83,
          probabilities: Object.fromEntries(
            fixture.values.map((p, i) => [`c${i}`, p]),
          ),
        },
      },
    });
  };
}
