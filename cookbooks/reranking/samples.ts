import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import type { Fetch } from "@typesafe-ai/sdk";
import type { RerankingCase } from "./cases.js";
import { retrieveSample, sampleProbability, sourceQuestion } from "./flow.js";
/** Local synthetic responses only; never delegates to a remote fetch. */
export function rerankingSampleTransport(
  caseId: RerankingCase,
  delayMs = 600,
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
    const candidates = retrieveSample(caseId, body.state?.query_excerpt);
    const index = candidates.findIndex(
      (row) => row.text === body.state?.candidate_passage,
    );
    if (
      index < 0 ||
      body.model !== "jev-1.12" ||
      JSON.stringify(body.questions) !== JSON.stringify(sourceQuestion) ||
      Object.keys(body.state).sort().join() !==
        "candidate_passage,query_excerpt"
    )
      throw new Error(
        "Re-ranking sample request does not match the source contract",
      );
    // Deliberate UI delay, not model latency. Exercise out-of-order completion.
    await delay(delayMs + ((index % 3) * delayMs) / 3, undefined, {
      signal: init?.signal ?? undefined,
    });
    return Response.json({
      model: "synthetic-reranking-sample",
      answers: {
        is_cited_source: {
          type: "noul",
          noul: sampleProbability(caseId, candidates[index].id),
        },
      },
    });
  };
}
