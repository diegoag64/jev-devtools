import type { CookbookSlug } from "../src/workbench/catalog.js";
import type { CookbookDetail } from "../src/workbench/types.js";

export const overviews: Record<CookbookSlug, CookbookDetail["overview"]> = {
  "confidence-fallback": {
    purpose:
      "In this cookbook, we classify a company from its business description. The key idea is to change the specificity of the answer when confidence is low: keep the industry group at API confidence ≥ 0.90, or return its broader parent division. Choice probabilities rank the groups; API confidence is a separate value used by this rule.",
    flow: "We use `task()` for validation and lookups, `jev()` for one classification request, and `if()` to choose the label. Both paths return a value, so Flow draws a merge before we assemble the evidence and return it with `output()`. The fallback requires no second request.",
  },
  "skill-suggestion": {
    purpose:
      "In this cookbook, we decide whether an assistant request needs a skill and which skill to suggest. Ranking the whole catalog avoids selecting from a prematurely narrow list. Request-level questions first check whether a skill is useful; a second assessment reads the top three candidates in more detail.",
    flow: "`jev()` captures the ranking and request assessment together. `task()` computes the application gate, and `branch()` ends with no suggestion or continues to the shortlist assessment and a final hint. The 0.30 thresholds are explicit rules in code. Returning a hint does not execute a skill.",
  },
  "function-calling": {
    purpose:
      "In this cookbook, we translate a command into a proposed function call. Functions and argument values come from defined options, which makes the answers typed and inspectable. We resolve only the chosen function's arguments and leave unstated arguments absent so its defaults can apply.",
    flow: "One `jev()` request assesses the function and possible arguments. `task()` selects the function, `map()` resolves its arguments, and `if()` handles their different shapes or omission. A final `task()` assembles the proposal and `output()` returns it as data. This example never invokes the proposed trading function.",
  },
  guardrails: {
    purpose:
      "In this cookbook, we screen a message for hazards and severity, then decide how to handle it. A Noul is an independent yes-probability, while Score reports a level on an ordered scale. These assessments are evidence; strict and permissive application policies can make different decisions from the same answers.",
    flow: "`task()` selects the input or output question set, and `jev()` captures one assessment. Further `task()` calls apply both policies without new inference. `branch()` expresses the strict policy's priority order and ends with support, block, review, or pass. The diagram separates model answers from application rules.",
  },
  "citation-checking": {
    purpose:
      "In this cookbook, we check whether a citation supports a claim. Two separate questions matter: does the quoted text actually occur in the source, and does its surrounding context support the claim? Exact matching can reject an invented quote before a model is asked to judge meaning.",
    flow: "`task()` prepares the source, and `map()` repeats a small checking program for each citation. Inside it, text matching precedes a `jev()` Choice request; conditions handle missing quotes and confidence-based review. `output()` returns each verdict with its evidence so a caller can distinguish textual and semantic findings.",
  },
  "rag-passages": {
    purpose:
      "In this cookbook, we decide which retrieved passages belong in an answer's context. Retrieval finds candidates, but a passage may be irrelevant, unsupported, or in conflict with other evidence. Assessing each passage before assembling the prompt makes those decisions explicit instead of trusting every search result.",
    flow: "`task()` loads a fixed shortlist, `map()` assesses passages through `jev()`, and application rules choose their routes. Another `task()` assembles accepted and conflicting evidence into a prompt. A fixed sample answer completes the local pipeline, and `output()` returns it with the passage decisions. No answering-model generation runs here.",
  },
  "simple-memory": {
    purpose:
      "In this cookbook, we process customer tickets while retaining selected information from earlier tickets. Memory belongs to the customer, and an explicit rule decides what gets saved. Order matters because an accepted memory changes the context available to a later ticket.",
    flow: "`task()` initializes a fresh memory store, then `loop()` carries that state through the ticket sequence. Each turn uses requests for routing and memory assessment, with code applying the admission rule. A summary `task()` and `output()` expose the full history. The samples demonstrate state passing, not persistent storage or measured accuracy gains.",
  },
  "hierarchical-classification": {
    purpose:
      "In this cookbook, we find a label by moving through a hierarchy of increasingly specific categories. Greedy search keeps one candidate path; beam search retains several plausible paths before choosing. Comparing them shows how an early choice can affect the final label. Path scores are not calibrated confidence.",
    flow: "`task()` prepares a common starting frontier, the paths still under consideration. `parallel()` builds independent greedy and beam lanes, each using a bounded `loop()` to assess children and update its frontier. Flow joins the lanes before `task()` compares their results and `output()` returns both search histories.",
  },
  "twitch-chat-filter": {
    purpose:
      "In this cookbook, we assess chat messages and build filtered views. Several questions describe each message, then application rules decide what a viewer sees. Reusing the same assessments for normal and quiet policies shows how moderation rules can change without sending the messages for another assessment.",
    flow: "`task()` loads a finite chat sample. `map()` runs each message's `jev()` assessment and policy logic with at most eight items in progress, while retaining input order in the results. `task()` builds both views, and `output()` returns the decisions. The example does not control a live Twitch channel.",
  },
  "sde-cascade": {
    purpose:
      "In this cookbook, we verify an initial structured extraction before deciding whether to use a stronger extraction. The principle is selective escalation: spend extra work on records that fail field checks, while retaining records that pass. The verifier's answers and the application's escalation rule are separate parts of the process.",
    flow: "A `task()` supplies a fixed cheap-extraction sample, `jev()` verifies its fields, and `task()` reads the flags. `if()` chooses the stronger sample or the original record and merges the paths. A comparison `task()` and `output()` expose the result and route. Both extractions are samples, so this run does not measure model cost or quality.",
  },
  "date-extraction": {
    purpose:
      "In this cookbook, we extract the date of a specified event from a document. Asking for a date role avoids confusing several dates in the same text. Typed questions identify date parts, while code resolves and validates the calendar date. Unresolved dates or uncertain components require review.",
    flow: "`task()` prepares document-and-role pairs. `map()` repeats a program that uses `jev()` for interpretation, `task()` for date arithmetic, and `if()` for acceptance or review. A summary `task()` and `output()` retain the resolved dates and their evidence. The diagram makes interpretation, calculation, and policy separate inspectable operations.",
  },
  "pre-parsed-extraction": {
    purpose:
      "In this cookbook, we extract values by choosing among text spans found by a parser. Regular expressions find candidate money or contact details; typed questions select the relevant spans. Code then normalizes those values. Candidate discovery sets a real limit: the model cannot choose a span the parser never found.",
    flow: "`task()` finds candidates, and `if()` skips requests when none exist. Another `if()` separates money checks from contact normalization, with both paths returning rows. `task()` attaches the source spans and `output()` returns the result. The diagram keeps parsing, selection, and normalization distinct.",
  },
  "structure-recovery": {
    purpose:
      "In this cookbook, we restore document formatting in two passes. First we decide which adjacent lines should be joined; then we label the recovered blocks by their structural role. The model supplies decisions about structure, while code applies them to the original text and renders Markdown.",
    flow: "`task()` prepares line IDs. `if()` guards each request so empty inputs do not trigger unnecessary work, and `jev()` captures the stitching and block-label questions. `task()` joins lines and renders the labels, then `output()` returns the document with evidence from both passes. There is no model-generated rewrite.",
  },
  reranking: {
    purpose:
      "In this cookbook, we reorder a retrieval shortlist by assessing each candidate's relevance to a query. Each Noul question returns an independent yes-probability. Multiple passages can be relevant at once, so these values are not competing options in a Choice distribution and need not sum to one.",
    flow: "`task()` loads fixed retrieval candidates. `map()` applies the same `jev()` assessment to each candidate with bounded concurrency, then `task()` sorts by the returned probabilities. `output()` preserves both orders and their evidence. The sample illustrates reranking mechanics without establishing retrieval-quality improvements.",
  },
  "line-search": {
    purpose:
      "In this cookbook, we find document lines that answer a query without assuming an answer exists. Choice can rank line IDs even when none is useful, so a separate Noul question estimates whether the document contains an answer. Those two signals support ranking and answer-existence decisions respectively.",
    flow: "`task()` assigns line IDs, and `jev()` asks both questions in one request. Further `task()` calls rank the IDs and retrieve their exact source text. `branch()` applies the existence thresholds and ends with answered, absent, or partial. The diagram shows why selecting a best line alone is not enough.",
  },
  "entity-alignment": {
    purpose:
      "In this cookbook, we assess whether two records describe the same entity. An ordered Score provides the routing signal, while independent Noul probabilities describe supporting field evidence. Application boundaries determine when to leave the pair unlinked, request review, or propose a match.",
    flow: "`task()` prepares one candidate pair and `jev()` assesses it. Another `task()` attaches the records and field evidence, then `branch()` ends with the outcome selected by the Score boundaries. Each result remains inspectable. Candidate discovery is outside this flow, and a proposed match does not merge real records.",
  },
  "parallel-questions": {
    purpose:
      "In this cookbook, we compare sending 13 independent questions together with sending them one at a time over the same document. The question set contains Nouls, Choices, and Scores. Holding the questions and document fixed lets us examine request grouping without changing the assessment task.",
    flow: "`task()` prepares shared input. Two `loop()` operations repeat each strategy five times; the single-question strategy uses `map()` with concurrency one inside each turn. `task()` compares statistics and request counts, then `output()` returns the comparison. The fixed answers illustrate batching, not measured speed, cost, or model consistency.",
  },
  "consistency-choices": {
    purpose:
      "In this cookbook, we inspect repeated answers to eight Choice questions while changing only an irrelevant uid field. A winning label can stay the same even when its probabilities vary, so we retain both. A separate application rule abstains below a top probability of 0.60; this value is not API confidence.",
    flow: "`task()` creates 15 input states. `map()` with concurrency one sends the same rubric through `jev()` for each state. `task()` computes agreement and variation and applies the abstention rule. `output()` returns the raw choices and decisions. Synthetic responses teach the analysis but cannot demonstrate real model consistency.",
  },
  "consistency-nouls": {
    purpose:
      "In this cookbook, we inspect repeated Noul answers to a fixed 14-question claim rubric. A Noul preserves a yes-probability instead of forcing an immediate binary decision. Our application sends values from 0.30 through 0.70 to review, making uncertainty handling an explicit policy.",
    flow: "`task()` prepares 15 states with distinct uid fields, and `map()` runs their `jev()` assessments sequentially. `task()` summarizes variation and applies the inclusive review band, then `output()` returns probabilities and decisions together. These synthetic cases demonstrate the calculation, not real insurance decisions or model-performance measurements.",
  },
};
