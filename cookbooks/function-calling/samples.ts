import { setTimeout as delay } from "node:timers/promises";
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { functionCases, isFunctionCase, type FunctionCase } from "./cases.js";
import { functionRequest } from "./dispatcher.js";
import { fixtureAnswers } from "./fixtures.js";
export function functionSampleTransport(
  caseId: FunctionCase,
  delayMs = 500,
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
    if (!isFunctionCase(caseId))
      throw new Error("Unknown function-calling sample");
    const expected = functionRequest(functionCases[caseId].message);
    if (
      body.model !== expected.model ||
      body.state !== expected.state ||
      !isDeepStrictEqual(
        body.questions,
        JSON.parse(JSON.stringify(expected.questions)),
      )
    )
      throw new Error(
        "Function-calling sample does not match command and questions",
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    return Response.json({
      model: "synthetic-function-calling-sample",
      answers: fixtureAnswers(caseId),
    });
  };
}
