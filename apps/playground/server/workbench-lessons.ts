import type { CookbookSlug } from "../src/workbench/catalog.js";

// Narration follows original recipe chapters. Stable operation IDs prevent a
// reordered flow from silently inheriting another operation's explanation.
export const lessons: Record<
  CookbookSlug,
  Record<
    string,
    readonly [chapter: string, explanation: string, comment: string]
  >
> = {
  "confidence-fallback": {
    "prepare-filing": [
      "The filings",
      "The original starts with SEC business descriptions. Our first task validates a fixed authored document so its synthetic response cannot be mistaken for a response to edited text.",
      "Validate the fixed document before using its synthetic response.",
    ],
    "classify-industry": [
      "Ask one Choice question, and read the confidence",
      "Ask once over the original 75 industry groups. A Jev node preserves the winning group, the distribution, and API confidence as separate fields for the next operation.",
      "Ask once for an industry group, its probabilities, and API confidence.",
    ],
    "confident-group": [
      "Return the group when sure, its division when not",
      "Use a returning condition at API confidence ≥ 0.90. The true arm keeps the group; the other looks up its parent division. Both return a value, so Flow draws a merge. The broader answer needs no second request.",
      "Keep the group at confidence >= 0.90; otherwise use its parent division without another request.",
    ],
    "assemble-result": [
      "What the broader answer buys",
      "Keep the original group and its evidence alongside the reported label. This task assembles the application result; it does not reproduce the original evaluation over 60 filings.",
      "Attach the original group and its evidence to the chosen label.",
    ],
    classification: [
      "Return the group when sure, its division when not",
      "Return the label and its specificity. The output node is the point where this flow hands its result back to the application.",
      "Return the classification and whether it names a group or a division.",
    ],
  },
  "skill-suggestion": {
    "rank-roster": [
      "Step 3: rank the whole roster",
      "The original reads all 182 skills before choosing a shortlist. One request ranks the roster and asks the request-level questions together, avoiding a separate request for each skill.",
      "Rank the full skill roster and assess the request in one call.",
    ],
    "compute-request-gate": [
      "Step 3: rank the whole roster",
      "Combine the request-level answers in application code. A task makes this gate inspectable without implying that the model itself chose the routing policy.",
      "Combine the request answers into the application's skill gate.",
    ],
    "needs-skill": [
      "Step 4: rerank the top three",
      "Below 0.30, finish without a suggestion. Otherwise, read the top three in greater detail, ask the second request, and reject the shortlist if its best fit is below 0.30. Terminal branches express the possible outcomes; the hint does not execute a skill.",
      "Stop below 0.30; otherwise rerank three skills and return a hint only if one meets the cutoff.",
    ],
  },
  "function-calling": {
    "validate-command": [
      "Run fourteen commands",
      "Start from a fixed sample command. This preparation is specific to the local fixture runner; the original dispatcher accepts commands for ten trading functions.",
      "Validate the fixed command before using its synthetic assessment.",
    ],
    dispatch: [
      "Turn the spec into questions",
      "The spec turns closed sets into typed questions. Capture the function selection and argument assessments together in one Jev node.",
      "Ask for the function and its possible arguments in one request.",
    ],
    "select-tool": [
      "Find the closed sets in the signatures",
      "Select the proposed function before interpreting its arguments. A task keeps this deterministic selection separate from the request.",
      "Choose the proposed function before reading its arguments.",
    ],
    "selected-arguments": [
      "Turn the spec into questions",
      "Map over only the selected function's arguments. The item program handles Choice, set, and flag shapes and respects omitted arguments so function defaults still apply.",
      "Resolve only that function's arguments, preserving defaults for omitted values.",
    ],
    "assemble-proposal": [
      "Read the confidence",
      "Assemble the proposed call and the relevant confidence values. Irrelevant function arguments must not affect this proposal.",
      "Assemble the proposed call with confidence for its selected arguments.",
    ],
    "proposed-call": [
      "Run fourteen commands",
      "Return a proposal for inspection. Unlike invoking the original trading functions, this local adaptation performs no trade or external action.",
      "Return the proposal for inspection without executing the tool.",
    ],
  },
  guardrails: {
    "select-screened-side": [
      "Define the guardrails",
      "Choose the input or output battery for the sample message. Screening both sides is represented by separate cases, each with the appropriate questions.",
      "Choose the question battery for the input or output side.",
    ],
    "screen-message": [
      "Define the guardrails",
      "Ask the hazard Nouls and severity Score in one request. The Jev node captures evidence that both policies can reuse.",
      "Assess hazards and severity once so both policies can reuse the answers.",
    ],
    "read-assessment": [
      "Turn the assessment into a decision",
      "Read typed probabilities and severity into an assessment object. This task creates the shared input for deterministic routing.",
      "Collect the typed probabilities and severity for the policy rules.",
    ],
    "apply-strict-policy": [
      "Turn the assessment into a decision",
      "Apply the strict thresholds in code. Policy is an application rule, so it belongs in a task rather than a second model request.",
      "Apply the strict thresholds in application code.",
    ],
    "reapply-permissive-policy": [
      "The same probabilities, different decisions",
      "Apply the permissive policy to exactly the same assessment. Comparing the two decisions shows how changing thresholds can change behavior without new inference.",
      "Apply a second policy to the same assessment without another request.",
    ],
    "support-first": [
      "Look at one decision in full",
      "Express the strict policy's precedence as terminal branches: support, then block, then review, otherwise pass. The diagram shows which explicit decision ends the flow.",
      "End with the first matching strict-policy outcome: support, block, review, or pass.",
    ],
  },
  "citation-checking": {
    "prepare-source": [
      "Load the source and the citations",
      "Clean the RFC and index its numbered sections deterministically. That gives each citation check a source location before any semantic judgment.",
      "Clean and index the source so citations can be checked against exact sections.",
    ],
    "check-citations": [
      "Find each quote in the source",
      "Check citations in order with a bounded map. Inside each item, string matching rejects fabricated quotes before the Choice request assesses support in context; confidence controls review. The item program keeps these stages together.",
      "Check each quote before asking whether its context supports the claim.",
    ],
    "citation-result": [
      "Check every citation",
      "Collect verdicts and their evidence as the output. A missing quote is a deterministic finding; a semantic support verdict comes from the captured Choice answer.",
      "Return each citation's verdict with the evidence behind it.",
    ],
  },
  "rag-passages": {
    retrieve: [
      "Retrieve the top passages",
      "Begin with a fixed retrieval shortlist from the original corpus. This task substitutes local candidates for the original retrieval system.",
      "Load fixed retrieval candidates for this sample query.",
    ],
    "classify-passages": [
      "Ask four questions about each passage",
      "Use a bounded map because each passage can be assessed independently. The item program asks its question battery and routes the passage in code, preserving each item's request.",
      "Assess each passage independently, then apply the evidence-routing rules.",
    ],
    "assemble-evidence": [
      "Build the prompt from the accepted evidence",
      "Assemble accepted and conflicting evidence into the answering prompt. Keeping assembly in a task exposes exactly which passages the routing rules admitted.",
      "Build the answering prompt from the accepted and conflicting evidence.",
    ],
    "sample-answer": [
      "Build the prompt from the accepted evidence",
      "Use a deterministic sample answer to complete the local example. This task is an adaptation, not a captured answering-model inference.",
      "Use a fixed sample answer to complete the example without a generation request.",
    ],
    "rag-result": [
      "Compare the six queries",
      "Return the evidence decisions and sample answer for inspection. The fixture illustrates the pipeline; it does not reproduce the original comparison or measure answer quality.",
      "Return the sample answer alongside the passage decisions.",
    ],
  },
  "simple-memory": {
    "start-timeline": [
      "Define the tickets",
      "Create empty per-customer memory before processing tickets. Explicit initial state makes later changes attributable to earlier inputs.",
      "Start with empty memory for each customer.",
    ],
    "ticket-timeline": [
      "Wrap the call so it remembers",
      "Use a loop because one ticket can change the state used by the next. Its item program routes the ticket, assesses whether to remember it, and applies the memory gate. Running all tickets in parallel would lose this dependency.",
      "Process tickets in order so each accepted memory can affect the next ticket.",
    ],
    "summarize-memory": [
      "Route the same messages for both customers",
      "Compare the histories after the ordered loop finishes. This task exposes saved memories and routing changes without treating them as measured improvements.",
      "Collect the saved memories and routing history after the loop.",
    ],
    "memory-showcase": [
      "Send the earlier tickets and watch the answers change",
      "Return the completed memory timeline. These synthetic cases demonstrate state propagation and admission rules, not model accuracy.",
      "Return the timeline so changes in memory and routing can be inspected.",
    ],
  },
  "hierarchical-classification": {
    "initial-frontier": [
      "Load and visualize the example hierarchies",
      "Start at the selected taxonomy root with a scored frontier. This deterministic state is the common input to both search methods.",
      "Initialize the search frontier at the selected taxonomy root.",
    ],
    "compare-searches": [
      "Implement greedy and beam search",
      "Create independent greedy and beam lanes, each using the same bounded loop helper. Within a round, classify direct children, score paths, and retain the best frontier. The parallel join waits for both searches before comparison.",
      "Run greedy and beam searches independently, then wait for both results.",
    ],
    "compare-results": [
      "Compare the methods",
      "Compare the selected leaves and retained alternatives. A task computes agreement and score separation; separation is not calibrated confidence.",
      "Compare the selected leaves and path scores, which are not calibrated confidence.",
    ],
    classification: [
      "Results",
      "Return both search histories. Small authored hierarchies demonstrate traversal; this output does not reproduce the original dataset evaluation.",
      "Return both search histories and their comparison.",
    ],
  },
  "twitch-chat-filter": {
    "load-chat": [
      "Load a stretch of chat",
      "Load a finite sample feed in order. The flow has a bounded input rather than a live chat connection.",
      "Load the finite chat sample in message order.",
    ],
    "classify-chat": [
      "Filter the whole chat",
      "Map over messages with concurrency eight. Each item asks the battery and applies moderation rules locally, while the map retains input order in its results.",
      "Assess up to eight messages at once while preserving input order in the results.",
    ],
    "assemble-chat": [
      "Change a rule without a new request",
      "Assemble normal and quiet views from the same assessments. The policies can be compared without asking another question.",
      "Build normal and quiet views from the same assessments without new requests.",
    ],
    "filtered-chat": [
      "Decide what the viewer sees",
      "Return the ordered views and decisions. This output demonstrates filtering; it does not modify a live Twitch channel.",
      "Return the filtered views and moderation decisions.",
    ],
  },
  "sde-cascade": {
    "cheap-extraction": [
      "Step 2: extract with the mini model (text mode)",
      "Start with a fixed cheap extraction. This local task stands in for the original external model call and is explicitly a sample.",
      "Use a fixed sample in place of the original cheap extraction call.",
    ],
    "verify-record": [
      "Step 3: verify with TypeSafe",
      "Ask the full field-verification battery in one Jev request. The answers will decide whether the initial record needs another extraction.",
      "Verify all fields in one request before deciding whether to escalate.",
    ],
    "field-flags": [
      "Step 4: the escalation gate",
      "Read per-field flags in a task. This makes the verifier signals available to a visible application condition.",
      "Collect the verifier flags that control escalation.",
    ],
    escalate: [
      "Step 5: escalate to the reasoning model",
      "Use a returning condition to choose a strong sample extraction or retain the cheap one. The merge continues with the chosen record, matching the cascade's selective escalation.",
      "Choose the stronger sample extraction only when verification calls for it.",
    ],
    "compare-records": [
      "Step 6: what this looks like on 100 prompts",
      "Compare the initial and final record for this fixture. This task does not claim the quality, cost, or latency measured by the original multi-model experiment.",
      "Compare the initial and final records for this sample.",
    ],
    "extraction-result": [
      "Step 5: escalate to the reasoning model",
      "Return the final structured record and route. Both branches share this output contract.",
      "Return the chosen structured record and the route taken.",
    ],
  },
  "date-extraction": {
    "sample-roles": [
      "The questions",
      "Choose fixed documents and requested date roles. The question needs the intended role, not just a request for any date in the text.",
      "Pair each sample document with the date role to extract.",
    ],
    "extract-dates": [
      "Resolve it in code",
      "Map over the requested roles. Each item asks for date components, resolves them deterministically, and checks confidence; resolution and review remain visible in its item program.",
      "Ask for date components, resolve them in code, and check confidence for each role.",
    ],
    "summarize-dates": [
      "Confidence to route on",
      "Collect resolved dates and review decisions. This task preserves uncertainty instead of silently accepting every assembled date.",
      "Collect resolved dates and identify those that need review.",
    ],
    "date-results": [
      "Run it",
      "Return the extracted dates with their evidence. The samples exercise the resolver and routing policy with synthetic Choice answers.",
      "Return the dates with their evidence and review decisions.",
    ],
  },
  "pre-parsed-extraction": {
    "find-candidates": [
      "Helpers",
      "Find candidate strings in document order using deterministic parsing. The subsequent questions choose among actual source spans.",
      "Find candidate source spans before asking the model to choose among them.",
    ],
    "has-candidates": [
      "Two limits",
      "Guard the request with a returning condition. With no candidates, return an empty result; otherwise run the separate helper calls. The merge gives the continuation one value either way.",
      "Skip the requests when no candidates exist; otherwise call the extraction helpers.",
    ],
    "money-or-contact": [
      "Money: pick the amount, classify the currency, flag credit vs charge",
      "Split money from contact normalization. Money needs amount and credit checks; contacts normalize the selected email or phone. These are application-specific branches over typed answers.",
      "Normalize money and contact values with their respective rules.",
    ],
    "assemble-result": [
      "Helpers",
      "Attach source candidates, selections, and normalized values. The task keeps the original span visible alongside the normalized result.",
      "Keep the source spans alongside the selected and normalized values.",
    ],
    "extracted-values": [
      "Two limits",
      "Return the selected values. Candidate discovery still limits what can be extracted; a model choice cannot recover a span the parser never supplied.",
      "Return the values selected from the candidates the parser found.",
    ],
  },
  "structure-recovery": {
    "prepare-lines": [
      "The document: a team memo that lost its formatting",
      "Normalize and tag input lines before recovery. Stable line identifiers keep later decisions attached to source text.",
      "Normalize the text and give each line a stable identifier.",
    ],
    "has-adjacent-pairs": [
      "Pass 1: stitching split sentences",
      "Only ask the stitching request when adjacent nonblank pairs exist. A returning condition handles empty or trivial inputs without an unnecessary call.",
      "Ask which adjacent lines belong together only when pairs exist.",
    ],
    "merge-lines": [
      "Pass 1: stitching split sentences",
      "Apply the join decisions to restore blocks. This task performs text manipulation in code rather than asking the model to rewrite the document.",
      "Join lines in code using the stitching decisions.",
    ],
    "has-blocks": [
      "Pass 2: classifying blocks",
      "Ask the second request only when blocks exist. Its typed labels describe block roles; the alternate arm keeps empty documents valid.",
      "Classify the recovered blocks only when there are blocks to label.",
    ],
    "render-markdown": [
      "Rendering",
      "Render Markdown deterministically from the recovered blocks and labels. This makes formatting rules inspectable and preserves the source text.",
      "Render Markdown from the block labels without asking the model to rewrite the text.",
    ],
    "recovered-document": [
      "Rendering",
      "Return the recovered document and intermediate evidence so both passes can be examined.",
      "Return the recovered document and evidence from both passes.",
    ],
  },
  reranking: {
    "retrieve-sample": [
      "Ranking the passages with fast search",
      "Start with a fixed retrieval shortlist. This task replaces the original BM25 retrieval run while retaining the before-order for comparison.",
      "Load the sample shortlist and retain its original order.",
    ],
    "score-candidates": [
      "Re-ranking it with TypeSafe",
      "Map over candidates and ask an independent relevance Noul for each. A bounded map records each request without conflating these scores with a Choice distribution.",
      "Assess each candidate's relevance independently with a Noul question.",
    ],
    "sort-candidates": [
      "Re-ranking moves the right answer toward the top",
      "Sort candidates by their Noul values in a task. Reordering uses the assessments; it does not modify their probabilities.",
      "Sort by relevance without changing the returned probabilities.",
    ],
    "reranking-result": [
      "A re-ranking example",
      "Return both orders and the candidate evidence. This fixture demonstrates re-ranking mechanics, not a retrieval-quality benchmark.",
      "Return the original order, reranked order, and candidate evidence.",
    ],
  },
  "line-search": {
    "tag-lines": [
      "Step 1: tag every line with an ID",
      "Give every line a stable identifier so a returned option can be resolved to exact source text.",
      "Assign line IDs so answers can be traced to exact source text.",
    ],
    find: [
      "Step 4: send both questions in one request",
      "Ask a Choice over line IDs and an existence Noul together. Choice ranks something even when nothing answers the query, so the existence question serves a different purpose.",
      "Ask both which line fits best and whether an answer exists at all.",
    ],
    "rank-lines": [
      "Step 5: read the result",
      "Sort line probabilities in code. This task keeps ranking distinct from the decision that an answer is present.",
      "Rank the line probabilities separately from the answer-existence decision.",
    ],
    "lookup-lines": [
      "Step 5: read the result",
      "Resolve the ranked IDs to original lines. The resulting evidence remains traceable to the document.",
      "Resolve ranked IDs back to the original document lines.",
    ],
    "answer-exists": [
      "Step 3: check whether an answer exists",
      "Use terminal branches to return answered, absent, or partial according to the existence gates. These thresholds are explicit application policy, not hidden model routing.",
      "Apply the existence thresholds to return an answered, absent, or partial result.",
    ],
  },
  "entity-alignment": {
    "prepare-pair": [
      "Load the candidate pairs",
      "Load one candidate pair. Candidate generation happens before this flow; the example assesses whether this pair describes the same entity.",
      "Load the candidate pair that this flow will assess.",
    ],
    "assess-pair": [
      "Ask one Score question and three Noul questions per candidate pair",
      "Capture the ordered Score and companion Nouls together. The Score determines the route; companion probabilities give a curator more specific evidence.",
      "Ask for the routing Score and supporting field probabilities together.",
    ],
    "prepare-evidence": [
      "Route every candidate pair",
      "Prepare the pair and its field evidence for inspection. A task assembles the application payload from the typed answers.",
      "Attach the pair and its field evidence to the proposed outcome.",
    ],
    "below-lower-boundary": [
      "Route every candidate pair",
      "Branch at the Score level boundaries to leave unlinked, request curator review, or propose a match. This sample proposes an outcome; it does not merge real entities.",
      "Use Score boundaries to propose a match, request review, or leave the pair unlinked.",
    ],
  },
  "parallel-questions": {
    "validate-sample": [
      "The questions: 8 nouls + 2 choices + 3 scores",
      "Prepare one fixed document and a 13-question battery. Both strategies must use the same document for the comparison to be meaningful.",
      "Use the same document and 13 questions for both strategies.",
    ],
    "batched-repeats": [
      "Ask two ways, 5 times each",
      "Repeat the batched request five times in a loop. One call per repeat carries all 13 questions, each retaining its typed answer.",
      "Repeat five times, sending all 13 questions in one request per repeat.",
    ],
    "single-repeats": [
      "Ask two ways, 5 times each",
      "Repeat the single-question strategy five times. The inner program sends questions sequentially; the recipe's title describes question independence, not concurrent API calls.",
      "Repeat five times, sending the 13 questions one at a time within each repeat.",
    ],
    "compare-strategies": [
      "Batching doesn't change the answers",
      "Compare means and sample standard deviations in code. The local answers are fixed fixtures, so their statistics cannot establish real model consistency, speed, or cost.",
      "Compare the fixture answers and request counts for the two strategies.",
    ],
    comparison: [
      "The only difference: cost and speed",
      "Return the strategy comparison and request counts. Consult the original recipe for measured performance; these local runs illustrate batching structure.",
      "Return the sample comparison without claiming measured model performance.",
    ],
  },
  "consistency-choices": {
    "prepare-repeats": [
      "The state: a borderline user post, as JSON",
      "Prepare 15 distinct request states with fresh uid fields. This mirrors the experiment's changing irrelevant field while keeping the post and rubric fixed.",
      "Vary only the uid across 15 states, keeping the post and rubric fixed.",
    ],
    repeats: [
      "How we ask",
      "Use a map with concurrency one for 15 sequential rubric requests. Each request contains all eight Choice questions, preserving their distributions.",
      "Run 15 requests sequentially, each containing all eight Choice questions.",
    ],
    statistics: [
      "How we ask",
      "Compute agreement and variation, then apply the top-probability cutoff of 0.60. Below it the application abstains; this is separate from API confidence.",
      "Measure fixture variation and abstain below a top probability of 0.60.",
    ],
    "consistency-report": [
      "How we ask",
      "Return a synthetic consistency report with raw choices and application decisions. It demonstrates the analysis, not fresh measurements or cross-model comparisons.",
      "Return the raw choices and derived application decisions.",
    ],
  },
  "consistency-nouls": {
    "prepare-repeats": [
      "The state: an auto-insurance claim, as JSON",
      "Prepare 15 synthetic repeats of the claim with distinct uid fields, retaining the same 14-question rubric.",
      "Create 15 claim states with distinct uid fields and the same rubric.",
    ],
    "repeat-rubric": [
      "How we ask",
      "Map sequentially over repeats. One request per repeat captures all 14 Noul probabilities without forcing them into binary labels.",
      "Ask all 14 Noul questions in each sequential request.",
    ],
    "describe-fixtures": [
      "How we ask",
      "Compute descriptive statistics and keep the inclusive 0.30–0.70 uncertainty band visible. The application routes that band to review rather than treating every value as a confident decision.",
      "Summarize fixture variation and send probabilities from 0.30 through 0.70 to review.",
    ],
    "noul-results": [
      "How we ask",
      "Return every probability and derived decision. The fixture demonstrates uncertainty handling; it makes no new model-performance or insurance eligibility claim.",
      "Return the probabilities and the decisions derived from them.",
    ],
  },
};
