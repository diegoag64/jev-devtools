import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

// Independent browser fixtures: repeated step IDs deliberately expose accidental
// parent/child selection sharing; unique question names expose stale trace links.
function request(flow, id, marker) {
  return flow.jev(id, {
    input: marker,
    request: (name) => ({
      state: { marker: name },
      questions: { [name]: noul(`Sample ${name}`) },
    }),
  });
}

function batch(flow, context) {
  return flow.map(
    "batch",
    { items: ["amber", "violet"], input: context, maxItems: 2, concurrency: 1 },
    (item) => {
      const marker = item.task("marker", {
        input: item.input,
        run: ({ item, context }) => `${context}-${item}`,
      });
      request(item, "check", marker);
      return item.task("receipt", { input: marker, run: (value) => value });
    },
  );
}

export const nestedFlowSamples = new Map([
  [
    "flow-map",
    defineJevFlow("nested-map", (flow) => {
      request(flow, "check", "map-parent");
      return flow.output("map-done", batch(flow, "map"));
    }),
  ],
  [
    "flow-loop",
    defineJevFlow("nested-loop", (flow) => {
      request(flow, "check", "loop-parent");
      const result = flow.loop(
        "rounds",
        {
          initial: 0,
          input: null,
          while: (state) => state.lt(2),
          maxIterations: 2,
        },
        (round) => {
          const marker = round.task("marker", {
            input: round.input.get("index"),
            run: (index) => `round-${index + 1}`,
          });
          request(round, "check", marker);
          batch(round, marker);
          return round.task("advance", {
            input: round.input.get("state"),
            run: (state) => state + 1,
          });
        },
      );
      return flow.output("loop-done", result);
    }),
  ],
]);

export async function nestedFlowTransport(_url, init) {
  const { questions } = JSON.parse(String(init.body));
  return Response.json({
    model: "sample",
    answers: Object.fromEntries(
      Object.keys(questions).map((name) => [
        name,
        { type: "noul", noul: 0.75 },
      ]),
    ),
  });
}
