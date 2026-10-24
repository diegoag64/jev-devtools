import { setTimeout as delay } from "node:timers/promises";
// Node 22.12 lacks zstd; the SDK sends uncompressed bodies on that runtime.
import * as zlib from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import type { Fetch } from "@typesafe-ai/sdk";
import { memoryTimeline, type MemoryCase } from "./cases.js";
import {
  routeRequest,
  gateRequest,
  type MemoryStore,
  type Team,
  type RouteAnswer,
} from "./flow.js";
import { recipe } from "./recipe.js";

// Authored responses, not measured accuracy or official probabilities. Expected
// memory is constructed separately from the flow's tasks to validate requests.
const plainTeams: Record<string, Team> = {
  "T-101": "selfhosted_windows",
  "T-102": "general",
  "T-103": "billing",
  "T-104": "general",
  "T-105": "enterprise_desk",
  "T-201": "cloud_ops",
  "T-202": "none_suitable",
  "T-203": "billing",
  "T-204": "cloud_ops",
  "T-205": "cloud_ops",
  "T-206": "enterprise_desk",
};
const gates: Record<string, number> = {
  "T-101": 0.88,
  "T-102": 0.85,
  "T-103": 0.08,
  "T-104": 0.12,
  "T-105": 0.9,
};
function answer(choice: Team, probability: number): RouteAnswer {
  return {
    type: "choice",
    choice,
    confidence: 0.86,
    probabilities: Object.fromEntries(
      Object.keys(recipe.route.criteria).map((key) => [
        key,
        key === choice ? probability : (1 - probability) / 6,
      ]),
    ),
  };
}
export function memorySampleTransport(
  caseId: MemoryCase,
  delayMs = 100,
): Fetch {
  const expected: {
    request: ReturnType<typeof routeRequest> | ReturnType<typeof gateRequest>;
    answers: unknown;
  }[] = [];
  const memories: MemoryStore = {};
  for (const { state, compare } of memoryTimeline(caseId)) {
    const id = state.ticket.id,
      cid = state.customer.id,
      saved = memories[cid] ?? [];
    const baseline = plainTeams[id];
    if (compare)
      expected.push({
        request: routeRequest(state),
        answers: { team: answer(baseline, 0.72) },
      });
    let selected = baseline;
    const ids = saved.map((m) => m.request.ticket.id);
    if (["T-201", "T-202"].includes(id) && ids.includes("T-101"))
      selected = "selfhosted_windows";
    if (id === "T-203" && ids.includes("T-105")) selected = "enterprise_desk";
    if (id === "T-206" && ids.includes("T-102")) selected = "billing";
    expected.push({
      request: routeRequest(
        saved.length
          ? { ...state, earlier_tickets_from_this_customer: [...saved] }
          : state,
      ),
      answers: { team: answer(selected, saved.length ? 0.94 : 0.72) },
    });
    const candidate = {
      request: state,
      jev_answered: {
        [recipe.route.instructions]: recipe.route.criteria[selected],
      },
    };
    const probability =
      id === "T-101" && caseId === "boundary"
        ? 0.5
        : id === "T-101" && caseId === "below"
          ? 0.499
          : gates[id] ?? 0.07;
    expected.push({
      request: gateRequest(candidate),
      answers: { remember: { type: "noul", noul: probability } },
    });
    if (probability >= 0.5) memories[cid] = [...saved, candidate];
  }
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
    const fixture = expected[index];
    if (
      !fixture ||
      body.model !== fixture.request.model ||
      !isDeepStrictEqual(body.state, fixture.request.state) ||
      !isDeepStrictEqual(body.questions, fixture.request.questions)
    )
      throw new Error(
        `Memory sample does not match request ${index + 1}: expected original ticket, customer-local memories and exact questions`,
      );
    await delay(delayMs, undefined, { signal: init?.signal ?? undefined });
    index++;
    return Response.json({
      model: "synthetic-memory-sample",
      answers: fixture.answers,
    });
  };
}
