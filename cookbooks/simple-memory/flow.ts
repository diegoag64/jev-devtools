import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { recipe } from "./recipe.js";
import {
  memoryTimeline,
  memoryCases,
  isMemoryCase,
  type MemoryCase,
  type TicketState,
  type Entry,
} from "./cases.js";
export const MEMORY_KEY = "earlier_tickets_from_this_customer";
export const REMEMBER_AT = 0.5;
export type Team = keyof typeof recipe.route.criteria;
export type RouteAnswer = {
  type: "choice";
  choice: Team;
  confidence: number;
  probabilities: Record<string, number>;
};
export type Memory = {
  request: TicketState;
  jev_answered: Record<string, string>;
};
export type MemoryStore = Record<string, Memory[]>;
export type TicketRecord = Entry & {
  plain: RouteAnswer | null;
  routed: RouteAnswer;
  remember: number;
  saved: boolean;
  before: string[];
  after: string[];
};
export type MemoryState = {
  index: number;
  total: number;
  entries: Entry[];
  memories: MemoryStore;
  history: TicketRecord[];
};
export type MemoryResult = {
  memories: MemoryStore;
  history: TicketRecord[];
  requests: number;
};
export function routeRequest(
  state: TicketState & { earlier_tickets_from_this_customer?: Memory[] },
) {
  return {
    model: "jev-1.13.0",
    state,
    questions: {
      team: choice(recipe.route.instructions, recipe.route.criteria),
    },
  };
}
export function gateRequest(state: Memory) {
  return {
    model: "jev-1.13.0",
    state,
    questions: {
      remember: noul(recipe.gate.instructions, recipe.gate.criteria),
    },
  };
}
export const memoryFlow = defineJevFlow<{
  caseId: MemoryCase;
  message: string;
}>("Cookbook · Simple memory", (flow) => {
  const initial = flow.task(
    "start-timeline",
    {
      input: flow.input,
      run: ({ caseId, message }): MemoryState => {
        if (!isMemoryCase(caseId) || message !== memoryCases[caseId].message)
          throw new Error("No memory sample matches this timeline");
        const entries = memoryTimeline(caseId);
        return {
          index: 0,
          total: entries.length,
          entries,
          memories: {},
          history: [],
        };
      },
    },
    {
      title: "Start with empty memory",
      description:
        "Each run owns a fresh memory store keyed by customer ID. Replay tickets in order; no database or cross-run persistence.",
    },
  );
  const final = flow.loop(
    "ticket-timeline",
    {
      initial,
      input: {},
      while: (state) => state.get("index").lt(state.get("total")),
      maxIterations: 11,
    },
    (turn) => {
      const loaded = turn.task(
        "load-customer-memory",
        {
          input: turn.input.get("state"),
          run: (state) => {
            const entry = state.entries[state.index];
            const saved = state.memories[entry.state.customer.id] ?? [];
            return {
              entry,
              saved,
              augmented: saved.length
                ? { ...entry.state, [MEMORY_KEY]: saved }
                : entry.state,
            };
          },
        },
        {
          title: "Load this customer's memories",
          description:
            "Use only this customer ID's list. Add earlier_tickets_from_this_customer only when the list is nonempty.",
        },
      );
      const plain = turn.if(
        "compare-without-memory",
        {
          when: loaded.get("entry").get("compare").eq(true),
          then: (path) => {
            const response = path.jev(
              "route-without-memory",
              {
                input: loaded.get("entry").get("state"),
                request: routeRequest,
              },
              {
                title: "Comparison · route without memory",
                description:
                  "The same later ticket and routing question, with no saved tickets injected. This comparison does not write memory.",
              },
            );
            return path.task(
              "read-plain-route",
              {
                input: response.answers,
                run: (answers) => answers.team as RouteAnswer,
              },
              { title: "Keep the baseline answer" },
            );
          },
          else: (path) =>
            path.task(
              "skip-baseline",
              { input: {}, run: (): RouteAnswer | null => null },
              {
                title: "Earlier ticket · no baseline",
                description:
                  "Earlier tickets just pass through the two-request memory wrapper.",
              },
            ),
        },
        { title: "Is this a later comparison ticket?" },
      );
      const routed = turn.jev(
        "route-with-memory",
        { input: loaded.get("augmented"), request: routeRequest },
        {
          title: "Route with available memory",
          description:
            "One Choice request with unchanged routing criteria. Saved tickets provide context; Jev has no implicit memory.",
        },
      );
      const candidate = turn.task(
        "build-memory-candidate",
        {
          input: {
            state: loaded.get("entry").get("state"),
            answers: routed.answers,
          },
          run: ({ state, answers }): Memory => ({
            request: state,
            jev_answered: {
              [recipe.route.instructions]:
                recipe.route.criteria[answers.team.choice],
            },
          }),
        },
        {
          title: "Pair original ticket with readable answer",
          description:
            "Store the original state, before memory injection. Convert the chosen team into its criteria description, not its label or probabilities.",
        },
      );
      const gate = turn.jev(
        "remember-gate",
        { input: candidate, request: gateRequest },
        {
          title: "Does the ticket state a lasting fact?",
          description:
            "Second sequential request. Judge facts in the original ticket; do not infer new facts from Jev's routing answer.",
        },
      );
      const updated = turn.if(
        "save-memory",
        {
          when: gate.answer("remember").noul.gte(REMEMBER_AT),
          then: (path) =>
            path.task(
              "append-memory",
              {
                input: {
                  memories: turn.input.get("state").get("memories"),
                  candidate,
                },
                run: ({ memories, candidate }): MemoryStore => {
                  const cid = candidate.request.customer.id;
                  return {
                    ...memories,
                    [cid]: [...(memories[cid] ?? []), candidate],
                  };
                },
              },
              {
                title: "Save this ticket and answer",
                description:
                  "Append to this customer's list at P(remember) ≥50%. No deduplication, relevance search or expiry is added.",
              },
            ),
          else: (path) =>
            path.task(
              "leave-memory-unchanged",
              {
                input: turn.input.get("state").get("memories"),
                run: (memories) => memories,
              },
              {
                title: "Do not save",
                description:
                  "Below 50%, retain the existing store. The routing answer is still returned.",
              },
            ),
        },
        {
          title: "Remember at least 50%?",
          description:
            "Inclusive threshold: exactly 50% saves; 49.9% does not. This is the application's policy.",
        },
      );
      return turn.task(
        "advance-timeline",
        {
          input: {
            state: turn.input.get("state"),
            loaded,
            plain,
            answers: routed.answers,
            probability: gate.answer("remember").noul,
            updated,
          },
          run: ({
            state,
            loaded,
            plain,
            answers,
            probability,
            updated,
          }): MemoryState => ({
            ...state,
            index: state.index + 1,
            memories: updated,
            history: [
              ...state.history,
              {
                ...loaded.entry,
                plain,
                routed: answers.team as RouteAnswer,
                remember: probability,
                saved: probability >= REMEMBER_AT,
                before: loaded.saved.map((m) => m.request.ticket.id),
                after: (updated[loaded.entry.state.customer.id] ?? []).map(
                  (m) => m.request.ticket.id,
                ),
              },
            ],
          }),
        },
        {
          title: "Return the route and advance",
          description:
            "Return the original routing answer whether saved or not. Carry the updated store into the next ticket.",
        },
      );
    },
    {
      title: "Process tickets in order",
      description:
        "Earlier tickets build memory. Later tickets compare plain routing with the same two-request memory wrapper. Select a turn to inspect every request and save decision.",
    },
  );
  const result = flow.task(
    "summarize-memory",
    {
      input: final,
      run: ({ memories, history }): MemoryResult => ({
        memories,
        history,
        requests: history.reduce((n, t) => n + (t.compare ? 3 : 2), 0),
      }),
    },
    {
      title: "Compare routes and saved memories",
      description:
        "Inspect the timeline, before/after customer memory and every returned team probability. Responses are synthetic, not an accuracy evaluation.",
    },
  );
  return flow.output("memory-showcase", result, {
    title: "Memory walkthrough complete",
  });
});
