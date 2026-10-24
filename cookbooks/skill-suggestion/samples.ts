import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import type { Fetch } from "@typesafe-ai/sdk";
import { roster } from "./flow.js";
import { skillCases, type SkillCase } from "./cases.js";

/** Deterministic synthetic responses run through the real SDK and flow. Never inference or official replay. */
export function skillSampleTransport(caseId: SkillCase, delayMs = 350): Fetch {
  return async (_url, init) => {
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
    const encoding = new Headers(init?.headers).get("content-encoding");
    const body = JSON.parse(
      encoding === "zstd"
        ? zlib.zstdDecompressSync(bytes).toString()
        : encoding === "gzip"
          ? zlib.gunzipSync(bytes).toString()
          : new TextDecoder().decode(bytes),
    );
    if (body.state.request !== skillCases[caseId].message)
      throw new Error(
        "No synthetic fixture matches this input. Choose a case or use Live.",
      );
    const wide = !!body.questions["gate::prose_suffices"];
    const names =
      caseId === "deck"
        ? ["powerpoint", "pptx-author", "computer-use"]
        : ["computer-use", "apple-notes", "xurl"];
    const expected = wide ? roster.map((s) => s.name) : names;
    if (
      Object.keys(body.questions.which.criteria).join("|") !==
      expected.join("|")
    )
      throw new Error("Synthetic fixture does not match the candidate set");
    const probabilities = Object.fromEntries(
      expected.map((name) => [
        name,
        wide
          ? [0.65, 0.25, 0.1][names.indexOf(name)] ?? 0
          : name === "pptx-author"
            ? 0.55
            : name === names[0]
              ? caseId === "deck"
                ? 0.4
                : 0.8
              : caseId === "deck"
                ? 0.05
                : 0.1,
      ]),
    );
    const answers: Record<string, unknown> = {
      which: {
        type: "choice",
        choice: !wide && caseId === "deck" ? "pptx-author" : names[0],
        probabilities,
        confidence: wide ? 0.6 : 0.5,
      },
    };
    if (wide) {
      const values =
        caseId === "explain" ? [0.02, 0.12, 0.96] : [0.9, 0.95, 0.1];
      for (const [i, key] of [
        "acts_on_user_system",
        "would_follow_documented_procedure",
        "prose_suffices",
      ].entries())
        answers[`gate::${key}`] = { type: "noul", noul: values[i] };
    } else {
      for (const [i, name] of names.entries())
        answers[`fits::${name}`] = {
          type: "noul",
          noul: (caseId === "deck" ? [0.82, 0.68, 0.1] : [0.18, 0.09, 0.05])[i],
        };
    }
    return Response.json({ model: "synthetic-cookbook-sample", answers });
  };
}
