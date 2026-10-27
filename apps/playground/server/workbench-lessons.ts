import type { CookbookSlug } from "../src/workbench/catalog.js";

// Narration follows original recipe chapters. Stable operation IDs prevent a
// reordered flow from silently inheriting another operation's explanation.
export const lessons: Record<
  CookbookSlug,
  Record<string, readonly [string, string]>
> = {
  "confidence-fallback": {
    "prepare-filing": [
      "The filings",
      "The original starts with SEC business descriptions. Our first task validates a fixed authored document so its synthetic response cannot be mistaken for a response to edited text.",
    ],
    "classify-industry": [
      "Ask one Choice question, and read the confidence",
      "Ask once over the original 75 industry groups. A Jev node preserves the winning group, the distribution, and API confidence as separate fields for the next operation.",
    ],
    "confident-group": [
      "Return the group when sure, its division when not",
      "Use a returning condition at API confidence ≥ 0.90. The true arm keeps the group; the other looks up its parent division. Both return a value, so Flow draws a merge. The broader answer needs no second request.",
    ],
    "assemble-result": [
      "What the broader answer buys",
      "Keep the original group and its evidence alongside the reported label. This task assembles the application result; it does not reproduce the original evaluation over 60 filings.",
    ],
    classification: [
      "Return the group when sure, its division when not",
      "Return the label and its specificity. The output node is the point where this flow hands its result back to the application.",
    ],
  },
  "skill-suggestion": {
    "rank-roster": [
      "Step 3: rank the whole roster",
      "The original reads all 182 skills before choosing a shortlist. One request ranks the roster and asks the request-level questions together, avoiding a separate request for each skill.",
    ],
    "compute-request-gate": [
      "Step 3: rank the whole roster",
      "Combine the request-level answers in application code. A task makes this gate inspectable without implying that the model itself chose the routing policy.",
    ],
    "needs-skill": [
      "Step 4: rerank the top three",
      "Below 0.30, finish without a suggestion. Otherwise, read the top three in greater detail, ask the second request, and reject the shortlist if its best fit is below 0.30. Terminal branches express the possible outcomes; the hint does not execute a skill.",
    ],
  },
  "function-calling": {
    "validate-command": [
      "Run fourteen commands",
      "Start from a fixed sample command. This preparation is specific to the local fixture runner; the original dispatcher accepts commands for ten trading functions.",
    ],
    dispatch: [
      "Turn the spec into questions",
      "The spec turns closed sets into typed questions. Capture the function selection and argument assessments together in one Jev node.",
    ],
    "select-tool": [
      "Find the closed sets in the signatures",
      "Select the proposed function before interpreting its arguments. A task keeps this deterministic selection separate from the request.",
    ],
    "selected-arguments": [
      "Turn the spec into questions",
      "Map over only the selected function's arguments. The item program handles Choice, set, and flag shapes and respects omitted arguments so function defaults still apply.",
    ],
    "assemble-proposal": [
      "Read the confidence",
      "Assemble the proposed call and the relevant confidence values. Irrelevant function arguments must not affect this proposal.",
    ],
    "proposed-call": [
      "Run fourteen commands",
      "Return a proposal for inspection. Unlike invoking the original trading functions, this local adaptation performs no trade or external action.",
    ],
  },
  guardrails: {
    "select-screened-side": [
      "Define the guardrails",
      "Choose the input or output battery for the sample message. Screening both sides is represented by separate cases, each with the appropriate questions.",
    ],
    "screen-message": [
      "Define the guardrails",
      "Ask the hazard Nouls and severity Score in one request. The Jev node captures evidence that both policies can reuse.",
    ],
    "read-assessment": [
      "Turn the assessment into a decision",
      "Read typed probabilities and severity into an assessment object. This task creates the shared input for deterministic routing.",
    ],
    "apply-strict-policy": [
      "Turn the assessment into a decision",
      "Apply the strict thresholds in code. Policy is an application rule, so it belongs in a task rather than a second model request.",
    ],
    "reapply-permissive-policy": [
      "The same probabilities, different decisions",
      "Apply the permissive policy to exactly the same assessment. Comparing the two decisions shows how changing thresholds can change behavior without new inference.",
    ],
    "support-first": [
      "Look at one decision in full",
      "Express the strict policy's precedence as terminal branches: support, then block, then review, otherwise pass. The diagram shows which explicit decision ends the flow.",
    ],
  },
  "citation-checking": {
    "prepare-source": [
      "Load the source and the citations",
      "Clean the RFC and index its numbered sections deterministically. That gives each citation check a source location before any semantic judgment.",
    ],
    "check-citations": [
      "Find each quote in the source",
      "Check citations in order with a bounded map. Inside each item, string matching rejects fabricated quotes before the Choice request assesses support in context; confidence controls review. The item program keeps these stages together.",
    ],
    "citation-result": [
      "Check every citation",
      "Collect verdicts and their evidence as the output. A missing quote is a deterministic finding; a semantic support verdict comes from the captured Choice answer.",
    ],
  },
  "rag-passages": {
    retrieve: [
      "Retrieve the top passages",
      "Begin with a fixed retrieval shortlist from the original corpus. This task substitutes local candidates for the original retrieval system.",
    ],
    "classify-passages": [
      "Ask four questions about each passage",
      "Use a bounded map because each passage can be assessed independently. The item program asks its question battery and routes the passage in code, preserving each item's request.",
    ],
    "assemble-evidence": [
      "Build the prompt from the accepted evidence",
      "Assemble accepted and conflicting evidence into the answering prompt. Keeping assembly in a task exposes exactly which passages the routing rules admitted.",
    ],
    "sample-answer": [
      "Build the prompt from the accepted evidence",
      "Use a deterministic sample answer to complete the local example. This task is an adaptation, not a captured answering-model inference.",
    ],
    "rag-result": [
      "Compare the six queries",
      "Return the evidence decisions and sample answer for inspection. The fixture illustrates the pipeline; it does not reproduce the original comparison or measure answer quality.",
    ],
  },
  "simple-memory": {
    "start-timeline": [
      "Define the tickets",
      "Create empty per-customer memory before processing tickets. Explicit initial state makes later changes attributable to earlier inputs.",
    ],
    "ticket-timeline": [
      "Wrap the call so it remembers",
      "Use a loop because one ticket can change the state used by the next. Its item program routes the ticket, assesses whether to remember it, and applies the memory gate. Running all tickets in parallel would lose this dependency.",
    ],
    "summarize-memory": [
      "Route the same messages for both customers",
      "Compare the histories after the ordered loop finishes. This task exposes saved memories and routing changes without treating them as measured improvements.",
    ],
    "memory-showcase": [
      "Send the earlier tickets and watch the answers change",
      "Return the completed memory timeline. These synthetic cases demonstrate state propagation and admission rules, not model accuracy.",
    ],
  },
  "hierarchical-classification": {
    "initial-frontier": [
      "Load and visualize the example hierarchies",
      "Start at the selected taxonomy root with a scored frontier. This deterministic state is the common input to both search methods.",
    ],
    "compare-searches": [
      "Implement greedy and beam search",
      "Create independent greedy and beam lanes, each using the same bounded loop helper. Within a round, classify direct children, score paths, and retain the best frontier. The parallel join waits for both searches before comparison.",
    ],
    "compare-results": [
      "Compare the methods",
      "Compare the selected leaves and retained alternatives. A task computes agreement and score separation; separation is not calibrated confidence.",
    ],
    classification: [
      "Results",
      "Return both search histories. Small authored hierarchies demonstrate traversal; this output does not reproduce the original dataset evaluation.",
    ],
  },
  "twitch-chat-filter": {
    "load-chat": [
      "Load a stretch of chat",
      "Load a finite sample feed in order. The flow has a bounded input rather than a live chat connection.",
    ],
    "classify-chat": [
      "Filter the whole chat",
      "Map over messages with concurrency eight. Each item asks the battery and applies moderation rules locally, while the map retains input order in its results.",
    ],
    "assemble-chat": [
      "Change a rule without a new request",
      "Assemble normal and quiet views from the same assessments. The policies can be compared without asking another question.",
    ],
    "filtered-chat": [
      "Decide what the viewer sees",
      "Return the ordered views and decisions. This output demonstrates filtering; it does not modify a live Twitch channel.",
    ],
  },
  "sde-cascade": {
    "cheap-extraction": [
      "Step 2: extract with the mini model (text mode)",
      "Start with a fixed cheap extraction. This local task stands in for the original external model call and is explicitly a sample.",
    ],
    "verify-record": [
      "Step 3: verify with TypeSafe",
      "Ask the full field-verification battery in one Jev request. The answers will decide whether the initial record needs another extraction.",
    ],
    "field-flags": [
      "Step 4: the escalation gate",
      "Read per-field flags in a task. This makes the verifier signals available to a visible application condition.",
    ],
    escalate: [
      "Step 5: escalate to the reasoning model",
      "Use a returning condition to choose a strong sample extraction or retain the cheap one. The merge continues with the chosen record, matching the cascade's selective escalation.",
    ],
    "compare-records": [
      "Step 6: what this looks like on 100 prompts",
      "Compare the initial and final record for this fixture. This task does not claim the quality, cost, or latency measured by the original multi-model experiment.",
    ],
    "extraction-result": [
      "Step 5: escalate to the reasoning model",
      "Return the final structured record and route. Both branches share this output contract.",
    ],
  },
  "date-extraction": {
    "sample-roles": [
      "The questions",
      "Choose fixed documents and requested date roles. The question needs the intended role, not just a request for any date in the text.",
    ],
    "extract-dates": [
      "Resolve it in code",
      "Map over the requested roles. Each item asks for date components, resolves them deterministically, and checks confidence; resolution and review remain visible in its item program.",
    ],
    "summarize-dates": [
      "Confidence to route on",
      "Collect resolved dates and review decisions. This task preserves uncertainty instead of silently accepting every assembled date.",
    ],
    "date-results": [
      "Run it",
      "Return the extracted dates with their evidence. The samples exercise the resolver and routing policy with synthetic Choice answers.",
    ],
  },
  "pre-parsed-extraction": {
    "find-candidates": [
      "Helpers",
      "Find candidate strings in document order using deterministic parsing. The subsequent questions choose among actual source spans.",
    ],
    "has-candidates": [
      "Two limits",
      "Guard the request with a returning condition. With no candidates, return an empty result; otherwise run the separate helper calls. The merge gives the continuation one value either way.",
    ],
    "money-or-contact": [
      "Money: pick the amount, classify the currency, flag credit vs charge",
      "Split money from contact normalization. Money needs amount and credit checks; contacts normalize the selected email or phone. These are application-specific branches over typed answers.",
    ],
    "assemble-result": [
      "Helpers",
      "Attach source candidates, selections, and normalized values. The task keeps the original span visible alongside the normalized result.",
    ],
    "extracted-values": [
      "Two limits",
      "Return the selected values. Candidate discovery still limits what can be extracted; a model choice cannot recover a span the parser never supplied.",
    ],
  },
  "structure-recovery": {
    "prepare-lines": [
      "The document: a team memo that lost its formatting",
      "Normalize and tag input lines before recovery. Stable line identifiers keep later decisions attached to source text.",
    ],
    "has-adjacent-pairs": [
      "Pass 1: stitching split sentences",
      "Only ask the stitching request when adjacent nonblank pairs exist. A returning condition handles empty or trivial inputs without an unnecessary call.",
    ],
    "merge-lines": [
      "Pass 1: stitching split sentences",
      "Apply the join decisions to restore blocks. This task performs text manipulation in code rather than asking the model to rewrite the document.",
    ],
    "has-blocks": [
      "Pass 2: classifying blocks",
      "Ask the second request only when blocks exist. Its typed labels describe block roles; the alternate arm keeps empty documents valid.",
    ],
    "render-markdown": [
      "Rendering",
      "Render Markdown deterministically from the recovered blocks and labels. This makes formatting rules inspectable and preserves the source text.",
    ],
    "recovered-document": [
      "Rendering",
      "Return the recovered document and intermediate evidence so both passes can be examined.",
    ],
  },
  reranking: {
    "retrieve-sample": [
      "Ranking the passages with fast search",
      "Start with a fixed retrieval shortlist. This task replaces the original BM25 retrieval run while retaining the before-order for comparison.",
    ],
    "score-candidates": [
      "Re-ranking it with TypeSafe",
      "Map over candidates and ask an independent relevance Noul for each. A bounded map records each request without conflating these scores with a Choice distribution.",
    ],
    "sort-candidates": [
      "Re-ranking moves the right answer toward the top",
      "Sort candidates by their Noul values in a task. Reordering uses the assessments; it does not modify their probabilities.",
    ],
    "reranking-result": [
      "A re-ranking example",
      "Return both orders and the candidate evidence. This fixture demonstrates re-ranking mechanics, not a retrieval-quality benchmark.",
    ],
  },
  "line-search": {
    "tag-lines": [
      "Step 1: tag every line with an ID",
      "Give every line a stable identifier so a returned option can be resolved to exact source text.",
    ],
    find: [
      "Step 4: send both questions in one request",
      "Ask a Choice over line IDs and an existence Noul together. Choice ranks something even when nothing answers the query, so the existence question serves a different purpose.",
    ],
    "rank-lines": [
      "Step 5: read the result",
      "Sort line probabilities in code. This task keeps ranking distinct from the decision that an answer is present.",
    ],
    "lookup-lines": [
      "Step 5: read the result",
      "Resolve the ranked IDs to original lines. The resulting evidence remains traceable to the document.",
    ],
    "answer-exists": [
      "Step 3: check whether an answer exists",
      "Use terminal branches to return answered, absent, or partial according to the existence gates. These thresholds are explicit application policy, not hidden model routing.",
    ],
  },
  "entity-alignment": {
    "prepare-pair": [
      "Load the candidate pairs",
      "Load one candidate pair. Candidate generation happens before this flow; the example assesses whether this pair describes the same entity.",
    ],
    "assess-pair": [
      "Ask one Score question and three Noul questions per candidate pair",
      "Capture the ordered Score and companion Nouls together. The Score determines the route; companion probabilities give a curator more specific evidence.",
    ],
    "prepare-evidence": [
      "Route every candidate pair",
      "Prepare the pair and its field evidence for inspection. A task assembles the application payload from the typed answers.",
    ],
    "below-lower-boundary": [
      "Route every candidate pair",
      "Branch at the Score level boundaries to leave unlinked, request curator review, or propose a match. This sample proposes an outcome; it does not merge real entities.",
    ],
  },
  "parallel-questions": {
    "validate-sample": [
      "The questions: 8 nouls + 2 choices + 3 scores",
      "Prepare one fixed document and a 13-question battery. Both strategies must use the same document for the comparison to be meaningful.",
    ],
    "batched-repeats": [
      "Ask two ways, 5 times each",
      "Repeat the batched request five times in a loop. One call per repeat carries all 13 questions, each retaining its typed answer.",
    ],
    "single-repeats": [
      "Ask two ways, 5 times each",
      "Repeat the single-question strategy five times. The inner program sends questions sequentially; the recipe's title describes question independence, not concurrent API calls.",
    ],
    "compare-strategies": [
      "Batching doesn't change the answers",
      "Compare means and sample standard deviations in code. The local answers are fixed fixtures, so their statistics cannot establish real model consistency, speed, or cost.",
    ],
    comparison: [
      "The only difference: cost and speed",
      "Return the strategy comparison and request counts. Consult the original recipe for measured performance; these local runs illustrate batching structure.",
    ],
  },
  "consistency-choices": {
    "prepare-repeats": [
      "The state: a borderline user post, as JSON",
      "Prepare 15 distinct request states with fresh uid fields. This mirrors the experiment's changing irrelevant field while keeping the post and rubric fixed.",
    ],
    repeats: [
      "How we ask",
      "Use a map with concurrency one for 15 sequential rubric requests. Each request contains all eight Choice questions, preserving their distributions.",
    ],
    statistics: [
      "How we ask",
      "Compute agreement and variation, then apply the top-probability cutoff of 0.60. Below it the application abstains; this is separate from API confidence.",
    ],
    "consistency-report": [
      "How we ask",
      "Return a synthetic consistency report with raw choices and application decisions. It demonstrates the analysis, not fresh measurements or cross-model comparisons.",
    ],
  },
  "consistency-nouls": {
    "prepare-repeats": [
      "The state: an auto-insurance claim, as JSON",
      "Prepare 15 synthetic repeats of the claim with distinct uid fields, retaining the same 14-question rubric.",
    ],
    "repeat-rubric": [
      "How we ask",
      "Map sequentially over repeats. One request per repeat captures all 14 Noul probabilities without forcing them into binary labels.",
    ],
    "describe-fixtures": [
      "How we ask",
      "Compute descriptive statistics and keep the inclusive 0.30–0.70 uncertainty band visible. The application routes that band to review rather than treating every value as a confident decision.",
    ],
    "noul-results": [
      "How we ask",
      "Return every probability and derived decision. The fixture demonstrates uncertainty handling; it makes no new model-performance or insurance eligibility claim.",
    ],
  },
};
