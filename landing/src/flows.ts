// Original, deliberately abbreviated illustrations of the repository cookbooks.
// Every value is authored sample data. No SDK, recorder, or network is involved.
export interface Card {
  id: string;
  x: number;
  y: number;
  kind: "input" | "jev" | "code" | "output";
  title: string;
  subtitle: string;
  rows?: [string, string, number?][];
  at: number;
  muted?: boolean;
}
export interface Edge {
  from: string;
  to: string;
  label?: string;
  inactive?: boolean;
  feedback?: boolean;
}
export interface Flow {
  id: string;
  label: string;

  description: string;

  nodes: Card[];
  edges: Edge[];
  group?: { x: number; y: number; w: number; h: number; label: string };
}
const node = (
  id: string,
  x: number,
  y: number,
  kind: Card["kind"],
  title: string,
  subtitle: string,
  at: number,
  rows?: Card["rows"],
  muted = false,
): Card => ({ id, x, y, kind, title, subtitle, at, rows, muted });
export const flows: Flow[] = [
  {
    id: "rag",
    label: "RAG passages",

    description:
      "Assess passages independently, route each result in code, and bring the evidence back together.",

    group: {
      x: 276,
      y: 32,
      w: 254,
      h: 450,
      label: "MAP / 3 ILLUSTRATIVE ITEMS",
    },
    nodes: [
      node(
        "input",
        30,
        207,
        "input",
        "Retrieved passages",
        "Query + source context",
        0,
        [["Passages shown", "03"]],
      ),
      node("a", 300, 73, "jev", "Passage 01", "Noul · answer evidence", 1, [
        ["Probability of yes", "94%", 0.94],
      ]),
      node("b", 300, 211, "jev", "Passage 02", "Noul · contradiction", 1.5, [
        ["Probability of yes", "89%", 0.89],
      ]),
      node("c", 300, 349, "jev", "Passage 03", "Noul · relevance", 2, [
        ["Probability of yes", "12%", 0.12],
      ]),
      node(
        "route",
        612,
        207,
        "code",
        "Route each passage",
        "Application policy",
        3.2,
        [["Include / conflict / exclude", ""]],
      ),
      node(
        "out",
        895,
        207,
        "output",
        "Assemble evidence",
        "Accepted + conflicting",
        4.5,
        [["Ready for the next step", "✓"]],
      ),
    ],
    edges: [
      { from: "input", to: "a" },
      { from: "input", to: "b" },
      { from: "input", to: "c" },
      { from: "a", to: "route" },
      { from: "b", to: "route" },
      { from: "c", to: "route" },
      { from: "route", to: "out" },
    ],
  },
  {
    id: "skills",
    label: "Skill suggestion",

    description:
      "Rank a skill roster, apply a gate in code, then assess a shortlist or abstain. The application owns the decision.",

    nodes: [
      node("input", 30, 207, "input", "User request", "A task needs a tool", 0),
      node(
        "rank",
        295,
        207,
        "jev",
        "Rank the roster",
        "Choice + independent Nouls",
        1,
        [["182 candidate skills", "→"]],
      ),
      node(
        "gate",
        565,
        207,
        "code",
        "Apply request gate",
        "Application arithmetic",
        2.5,
        [["Gate passes", "true"]],
      ),
      node(
        "fits",
        895,
        110,
        "jev",
        "Assess the shortlist",
        "Noul · fit per candidate",
        3.8,
        [["Best fit (sample)", "91%", 0.91]],
      ),
      node(
        "skip",
        895,
        333,
        "output",
        "No skill needed",
        "Abstain",
        3.8,
        undefined,
        true,
      ),
    ],
    edges: [
      { from: "input", to: "rank" },
      { from: "rank", to: "gate" },
      { from: "gate", to: "fits", label: "pass" },
      { from: "gate", to: "skip", label: "otherwise", inactive: true },
    ],
  },
  {
    id: "cascade",
    label: "Verification cascade",

    description:
      "Verify a candidate record, escalate when a field is flagged, and merge the selected result into one continuation.",

    nodes: [
      node(
        "input",
        30,
        207,
        "input",
        "Candidate record",
        "Illustrative extractor output",
        0,
      ),
      node(
        "verify",
        292,
        207,
        "jev",
        "Verify the fields",
        "Noul · issue probability",
        1,
        [["Flagged field", "84%", 0.84]],
      ),
      node(
        "escalate",
        596,
        100,
        "code",
        "Escalate candidate",
        "Sample replacement record",
        2.8,
      ),
      node(
        "keep",
        596,
        333,
        "code",
        "Keep original",
        "No flagged fields",
        2.8,
        undefined,
        true,
      ),
      node(
        "merge",
        895,
        207,
        "output",
        "Merge the result",
        "One shared continuation",
        4.5,
      ),
    ],
    edges: [
      { from: "input", to: "verify" },
      { from: "verify", to: "escalate", label: "flag > 0.70" },
      { from: "verify", to: "keep", label: "otherwise", inactive: true },
      { from: "escalate", to: "merge" },
      { from: "keep", to: "merge", inactive: true },
    ],
  },
  {
    id: "hierarchy",
    label: "Hierarchical search",

    description:
      "Expand a taxonomy frontier, evaluate candidates, and retain the strongest paths in a bounded loop.",

    group: {
      x: 272,
      y: 116,
      w: 560,
      h: 290,
      label: "BOUNDED LOOP / ONE ILLUSTRATIVE ITERATION",
    },
    nodes: [
      node(
        "input",
        30,
        207,
        "input",
        "Taxonomy root",
        "Start at the broadest level",
        0,
      ),
      node(
        "frontier",
        295,
        207,
        "jev",
        "Assess the frontier",
        "Choice · candidate paths",
        1.3,
        [["Software / hardware", "76 / 24"]],
      ),
      node(
        "beam",
        602,
        207,
        "code",
        "Retain & expand",
        "Beam policy in code",
        2.8,
        [["Continue until stop rule", "↻"]],
      ),
      node(
        "out",
        895,
        207,
        "output",
        "Selected path",
        "Technology → software",
        4.8,
      ),
    ],
    edges: [
      { from: "input", to: "frontier" },
      { from: "frontier", to: "beam" },
      { from: "beam", to: "frontier", label: "next frontier", feedback: true },
      { from: "beam", to: "out", label: "stop" },
    ],
  },
  {
    id: "memory",
    label: "Simple memory",

    description:
      "Combine a ticket with saved context, inspect the route, and let a memory gate decide what the next ticket can use.",

    nodes: [
      node(
        "input",
        30,
        207,
        "input",
        "Ticket + context",
        "Customer history in this run",
        0,
      ),
      node(
        "route",
        295,
        207,
        "jev",
        "Route the ticket",
        "Choice · category",
        1,
        [["Billing", "86%", 0.86]],
      ),
      node(
        "gate",
        565,
        207,
        "jev",
        "Memory gate",
        "Noul · useful to remember?",
        2.5,
        [["Probability of yes", "93%", 0.93]],
      ),
      node(
        "save",
        895,
        110,
        "code",
        "Update context",
        "Available to the next ticket",
        4,
      ),
      node(
        "skip",
        895,
        333,
        "output",
        "Leave unchanged",
        "Nothing useful to retain",
        4,
        undefined,
        true,
      ),
    ],
    edges: [
      { from: "input", to: "route" },
      { from: "route", to: "gate" },
      { from: "gate", to: "save", label: "retain" },
      { from: "gate", to: "skip", label: "skip", inactive: true },
    ],
  },
  {
    id: "structure",
    label: "Structure recovery",

    description:
      "Assess adjacent lines, merge them in code, then classify the resulting blocks before rendering a document.",

    nodes: [
      node(
        "input",
        30,
        207,
        "input",
        "Broken lines",
        "Unformatted source text",
        0,
      ),
      node(
        "stitch",
        295,
        115,
        "jev",
        "Assess line pairs",
        "Batched questions",
        1,
        [["Join adjacent lines?", ""]],
      ),
      node(
        "merge",
        565,
        115,
        "code",
        "Merge text blocks",
        "Deterministic transform",
        2.3,
      ),
      node(
        "classify",
        565,
        337,
        "jev",
        "Classify the blocks",
        "Dynamic question batch",
        3.5,
        [["Heading / body / list", ""]],
      ),
      node(
        "render",
        895,
        207,
        "output",
        "Render Markdown",
        "Formatting in code",
        4.8,
      ),
    ],
    edges: [
      { from: "input", to: "stitch" },
      { from: "stitch", to: "merge" },
      { from: "merge", to: "classify" },
      { from: "classify", to: "render" },
    ],
  },
];
