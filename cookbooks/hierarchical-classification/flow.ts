import { choice } from "@typesafe-ai/sdk";
import {
  defineJevFlow,
  type FlowBuilder,
  type FlowExpression,
} from "jev-devtools/flow";
import {
  hierarchyCases,
  isHierarchyCase,
  type HierarchyCase,
  type Tree,
} from "./cases.js";
export type Candidate = {
  path: string[];
  product: number;
  decisions: number;
  score: number;
};
export type ChoiceRecord = {
  parent: string[];
  probabilities: Record<string, number>;
};
export type Round = {
  index: number;
  records: ChoiceRecord[];
  kept: Candidate[];
  pruned: Candidate[];
};
export type SearchState = {
  beam: Candidate[];
  active: boolean;
  rounds: Round[];
};
type Input = { message: string; caseId: HierarchyCase };
function children(tree: Tree, path: string[]) {
  let node = tree;
  for (const label of path) {
    if (!Object.hasOwn(node, label)) throw new Error("Unknown taxonomy path");
    node = node[label];
  }
  return Object.keys(node);
}
export function childRequest(document: string, labels: string[]) {
  return {
    model: "jev-1.12",
    state: document,
    questions: {
      child: choice(
        "Which direct child category best matches this document?",
        Object.fromEntries(labels.map((label, i) => [`c${i}`, label])),
      ),
    },
  };
}
function search(
  flow: FlowBuilder<Input>,
  id: string,
  initial: FlowExpression<SearchState>,
  width: number,
  maxIterations: number,
) {
  return flow.loop(
    id,
    {
      initial,
      input: {
        caseId: flow.input.get("caseId"),
        document: flow.input.get("message"),
        width,
      },
      while: (state) => state.get("active").eq(true),
      maxIterations,
    },
    (round) => {
      const frontier = round.task(
        "prepare-frontier",
        {
          input: round.input,
          run: ({ state, context }) => {
            const tree = hierarchyCases[context.caseId].tree;
            return {
              expandable: state.beam.flatMap((candidate) => {
                const labels = children(tree, candidate.path);
                return labels.length ? [{ candidate, labels }] : [];
              }),
              finished: state.beam.filter(
                (candidate) => !children(tree, candidate.path).length,
              ),
            };
          },
        },
        {
          title: "Prepare this frontier",
          description:
            "Keep completed leaves. Expand only paths that still have direct children.",
        },
      );
      const expansions = round.map(
        "frontier",
        {
          items: frontier.get("expandable"),
          input: { document: round.input.get("context").get("document") },
          concurrency: 3,
          maxItems: 3,
        },
        (item) => {
          const probabilities = item.if(
            "needs-choice",
            {
              when: item.input.get("item").get("labels").get("length").gt(1),
              then: (branch) => {
                const response = branch.jev(
                  "choose-child",
                  {
                    input: {
                      document: branch.input.get("context").get("document"),
                      labels: branch.input.get("item").get("labels"),
                    },
                    request: ({ document, labels }) =>
                      childRequest(document, labels),
                  },
                  {
                    title: "Classify direct children",
                    description:
                      "One Choice question per frontier node. Path scoring uses its probabilities, not the selected label or API confidence.",
                  },
                );
                return branch.task(
                  "decode-options",
                  {
                    input: {
                      labels: branch.input.get("item").get("labels"),
                      probabilities: response.answer("child").probabilities,
                    },
                    run: ({ labels, probabilities }): Record<string, number> =>
                      Object.fromEntries(
                        labels.map((label, i) => [
                          label,
                          probabilities[`c${i}`],
                        ]),
                      ),
                  },
                  {
                    title: "Restore category names",
                    description:
                      "Map c0, c1, … back to the actual direct-child labels.",
                  },
                );
              },
              else: (branch) =>
                branch.task(
                  "only-child",
                  {
                    input: branch.input.get("item").get("labels"),
                    run: (labels) => ({ [labels[0]]: 1 }),
                  },
                  {
                    title: "Follow the only child",
                    description:
                      "A single-child edge is deterministic. No Jev request or additional scoring decision.",
                  },
                ),
            },
            {
              title: "Is there a choice to make?",
              description:
                "Only nodes with two or more children require inference.",
            },
          );
          return item.task(
            "expand-candidate",
            {
              input: {
                candidate: item.input.get("item").get("candidate"),
                probabilities,
              },
              run: ({ candidate, probabilities }) => {
                const decision = Object.keys(probabilities).length > 1;
                return {
                  record: { parent: candidate.path, probabilities },
                  candidates: Object.entries(probabilities).map(
                    ([label, probability]): Candidate => {
                      const product =
                        candidate.product *
                        (decision ? Math.max(probability, 1e-9) : 1);
                      const decisions =
                        candidate.decisions + (decision ? 1 : 0);
                      return {
                        path: [...candidate.path, label],
                        product,
                        decisions,
                        score: decisions ? product ** (1 / decisions) : 1,
                      };
                    },
                  ),
                };
              },
            },
            {
              title: "Score every child path",
              description:
                "Geometric mean of decision-edge probabilities. Single-child edges do not change the score; zero probabilities use the source recipe's 1e-9 floor.",
            },
          );
        },
        {
          title: "Assess frontier nodes",
          description:
            "One separate request per nontrivial sibling set, up to three concurrently. Select a frontier item to inspect its complete Choice diagram.",
        },
      );
      return round.task(
        "prune-beam",
        {
          input: {
            state: round.input.get("state"),
            context: round.input.get("context"),
            finished: frontier.get("finished"),
            expansions,
          },
          run: ({ state, context, finished, expansions }): SearchState => {
            const ranked = [
              ...finished,
              ...expansions.flatMap((e) => e.candidates),
            ].sort((a, b) => b.score - a.score);
            const beam = ranked.slice(0, context.width);
            return {
              beam,
              active: beam.some(
                (c) =>
                  children(hierarchyCases[context.caseId].tree, c.path).length >
                  0,
              ),
              rounds: [
                ...state.rounds,
                {
                  index: state.rounds.length,
                  records: expansions.map((e) => e.record),
                  kept: beam,
                  pruned: ranked.slice(context.width),
                },
              ],
            };
          },
        },
        {
          title: `Keep the best ${width} path${width === 1 ? "" : "s"}`,
          description:
            "Rank completed leaves and newly expanded paths together. Carry the retained paths into the next iteration.",
        },
      );
    },
    {
      title: width === 1 ? "Greedy search · width 1" : "Beam search · width 3",
      description:
        width === 1
          ? "Follow the locally strongest path; discarded alternatives cannot recover."
          : "Keep three plausible paths and revisit them at the next depth. Stop when all retained paths are leaves.",
    },
  );
}
export type HierarchyResult = {
  beam: SearchState;
  greedy: SearchState;
  agrees: boolean;
  separation: number | null;
  document: string;
};
export function createHierarchyFlow(maxIterations = 12) {
  return defineJevFlow<Input>(
    maxIterations === 1
      ? "Cookbook · Hierarchy iteration limit"
      : "Cookbook · Hierarchical classification",
    (flow) => {
      const initial = flow.task(
        "initial-frontier",
        {
          input: flow.input,
          run: ({ caseId, message }): SearchState => {
            if (
              !isHierarchyCase(caseId) ||
              message !== hierarchyCases[caseId].message
            )
              throw new Error("No hierarchy sample matches this document");
            const sample = hierarchyCases[caseId];
            return {
              beam: [
                { path: sample.start, product: 1, decisions: 0, score: 1 },
              ],
              active: children(sample.tree, sample.start).length > 0,
              rounds: [],
            };
          },
        },
        {
          title: "Start at the taxonomy root",
          description:
            "Small authored taxonomy and synthetic responses. The leaf case starts at an already selected category.",
        },
      );
      const searches = flow.parallel(
        "compare-searches",
        {
          beam: (lane) =>
            search(lane, "beam-search", initial, 3, maxIterations),
          greedy: (lane) =>
            search(lane, "greedy-search", initial, 1, maxIterations),
        },
        {
          title: "Wait for both searches",
          description:
            "Compare independent beam and greedy traversals over the same document and sample distributions.",
        },
      );
      const result = flow.task(
        "compare-results",
        {
          input: {
            beam: searches.beam,
            greedy: searches.greedy,
            document: flow.input.get("message"),
          },
          run: ({ beam, greedy, document }): HierarchyResult => ({
            beam,
            greedy,
            document,
            agrees:
              JSON.stringify(beam.beam[0].path) ===
              JSON.stringify(greedy.beam[0].path),
            separation:
              beam.beam.length > 1
                ? beam.beam[0].score / Math.max(beam.beam[1].score, 1e-9)
                : null,
          }),
        },
        {
          title: "Compare the selected leaves",
          description:
            "Inspect path scores and pruned alternatives. Separation is a score ratio, not calibrated confidence and not a pruning threshold.",
        },
      );
      return flow.output("classification", result, {
        title: "Final classifications",
        description:
          "Sample outcomes demonstrate traversal behavior, not measured model accuracy.",
      });
    },
  );
}
export const hierarchyFlow = createHierarchyFlow();
export const hierarchyLimitFlow = createHierarchyFlow(1);
