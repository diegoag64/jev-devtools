import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import type { Fetch } from "@typesafe-ai/sdk";
import { passageQuestions, retrieveSample } from "./flow.js";
import { ragCases, type RagCase } from "./cases.js";
/** Authored scores; never the official cache, inference or a reported accuracy result. */
export function ragSampleTransport(caseId: RagCase, delayMs = 600): Fetch {
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
    const candidates = retrieveSample(caseId, body.state.query);
    const index = candidates.findIndex((p) => p.id === body.state.passage?.id);
    if (
      index < 0 ||
      JSON.stringify(body.state.passage) !==
        JSON.stringify(candidates[index]) ||
      JSON.stringify(body.questions) !== JSON.stringify(passageQuestions)
    )
      throw new Error(
        "RAG sample does not match the query, passage or questions",
      );
    // Different completion times make concurrency and stable result order visible.
    await delay(delayMs + ((index % 3) * delayMs) / 3, undefined, {
      signal: init?.signal ?? undefined,
    });
    const id = candidates[index].id;
    const values =
      id === "forum-injection"
        ? [0.9, 0.9, 0.95, 0.98]
        : caseId === "premise" && id === "sessions-01"
          ? [0.49, 0.5, 0.94, 0.05]
          : caseId === "lifetime" &&
              [
                "sessions-05",
                "signing-keys-51-c",
                "sessions-01",
                "sessions-09",
              ].includes(id)
            ? [0.96, 0.91, 0.04, 0.03]
            : id === "sessions-08-a"
              ? [0.75, 0.5, 0.05, 0.04]
              : [0.2, 0.3, 0.07, 0.04];
    return Response.json({
      model: "synthetic-rag-sample",
      answers: Object.fromEntries(
        Object.keys(passageQuestions).map((key, i) => [
          key,
          { type: "noul", noul: values[i] },
        ]),
      ),
    });
  };
}
