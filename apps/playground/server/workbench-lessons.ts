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
      "We start with a company business description. `task()` runs ordinary TypeScript, so we use it to validate the fixed sample before classification. Its card makes that preparation visible without adding a model request.",
      "Validate the fixed document before using its synthetic response.",
    ],
    "classify-industry": [
      "Ask one Choice question, and read the confidence",
      "We use `jev()` to ask one Choice question over 75 industry groups. Choice returns a winning group and probabilities across the options, plus a separate API confidence value. The request card keeps that evidence available for our next decision.",
      "Ask once for an industry group, its probabilities, and API confidence.",
    ],
    "confident-group": [
      "Return the group when sure, its division when not",
      "We use `if()` because either path must return a label and then continue. At API confidence ≥ 0.90 we keep the industry group; below it, a `task()` looks up its broader parent division. The diagram adds two paths and a merge, with no second model request.",
      "Keep the group at confidence >= 0.90; otherwise use its parent division without another request.",
    ],
    "assemble-result": [
      "What the broader answer buys",
      "We use `task()` to combine the selected label with the original group, probabilities, and confidence. This is data assembly in TypeScript. Keeping the evidence lets the caller see why a broader division was returned instead of a specific group.",
      "Attach the original group and its evidence to the chosen label.",
    ],
    classification: [
      "Return the group when sure, its division when not",
      "We finish with `output()` to name the outcome and return our assembled result to the caller. The final card marks the end of the flow. The result includes whether the label describes a group or a broader division.",
      "Return the classification and whether it names a group or a division.",
    ],
  },
  "skill-suggestion": {
    "rank-roster": [
      "Step 3: rank the whole roster",
      "We use `jev()` to rank all 182 skills and ask whether this request needs a skill in the same call. Choice ranks the catalog; three Noul questions return independent yes-probabilities about the request. One request card holds both kinds of evidence.",
      "Rank the full skill roster and assess the request in one call.",
    ],
    "compute-request-gate": [
      "Step 3: rank the whole roster",
      "We use `task()` to calculate a skill-needed score from the three Noul answers and sort the ranked skills. This rule belongs to application code, so it needs no model call. The task card exposes the calculation that controls the next branch.",
      "Combine the request answers into the application's skill gate.",
    ],
    "needs-skill": [
      "Step 4: rerank the top three",
      "We use `branch()` because each route ends with its own outcome. Below 0.30 we return no suggestion; otherwise we use a second `jev()` request to reassess the top three skills. We return a hint only when the best fit reaches 0.30. No skill is executed.",
      "Stop below 0.30; otherwise rerank three skills and return a hint only if one meets the cutoff.",
    ],
  },
  "function-calling": {
    "validate-command": [
      "Run fourteen commands",
      "We use `task()` to check the fixed sample command before interpreting it. Validation is ordinary TypeScript, so it gets a task card rather than a request card. This keeps the synthetic assessment tied to the command it was written for.",
      "Validate the fixed command before using its synthetic assessment.",
    ],
    dispatch: [
      "Turn the spec into questions",
      "We use `jev()` to ask which function fits the command and assess possible arguments together. Closed-set questions restrict choices to the functions and values we define. The request card records the answers before application code builds a proposed call.",
      "Ask for the function and its possible arguments in one request.",
    ],
    "select-tool": [
      "Find the closed sets in the signatures",
      "We use `task()` to read the selected function and look up its argument definitions. This is a deterministic lookup. It gives the next step only the arguments that belong to this function, so unrelated answers cannot affect the proposal.",
      "Choose the proposed function before reading its arguments.",
    ],
    "selected-arguments": [
      "Turn the spec into questions",
      "We use `map()` because the selected function can have several arguments, each requiring the same resolution process. Inside each item, `if()` handles omitted values and argument shapes. The collection shows that repeated logic while leaving omitted arguments absent so function defaults still apply.",
      "Resolve only that function's arguments, preserving defaults for omitted values.",
    ],
    "assemble-proposal": [
      "Read the confidence",
      "We use `task()` to combine the selected function, resolved arguments, and relevant confidence values. Assembly needs no further model request. The task card shows the complete proposal and excludes confidence for arguments that this function does not use.",
      "Assemble the proposed call with confidence for its selected arguments.",
    ],
    "proposed-call": [
      "Run fourteen commands",
      "We use `output()` to return the proposed call as data. This ends the flow with a named outcome that you can inspect. The example does not invoke the trading function; a caller would decide what to do with the proposal.",
      "Return the proposal for inspection without executing the tool.",
    ],
  },
  guardrails: {
    "select-screened-side": [
      "Define the guardrails",
      "We use `task()` to choose the questions for the side we are screening: a user input or an assistant output. Selecting this question set is application logic. The first card prepares the message and the appropriate rules for the request.",
      "Choose the question battery for the input or output side.",
    ],
    "screen-message": [
      "Define the guardrails",
      "We use `jev()` to assess hazards and severity in one call. Each Noul gives an independent yes-probability; Score reports a level on an ordered severity scale. The request card preserves these answers so multiple policies can reuse them.",
      "Assess hazards and severity once so both policies can reuse the answers.",
    ],
    "read-assessment": [
      "Turn the assessment into a decision",
      "We use `task()` to read the typed answers into one assessment object. This gives the policy functions consistent inputs without another request. The task card separates what the model assessed from the decisions our code makes next.",
      "Collect the typed probabilities and severity for the policy rules.",
    ],
    "apply-strict-policy": [
      "Turn the assessment into a decision",
      "We use `task()` to apply the strict hazard and severity thresholds. These thresholds are application rules written in TypeScript. The task produces policy decisions from the assessment, making the reason for a later support, block, review, or pass route inspectable.",
      "Apply the strict thresholds in application code.",
    ],
    "reapply-permissive-policy": [
      "The same probabilities, different decisions",
      "We use another `task()` to apply a more permissive policy to the same assessment. Changing policy does not require another model call. This card lets us compare how two rule sets turn identical evidence into different decisions.",
      "Apply a second policy to the same assessment without another request.",
    ],
    "support-first": [
      "Look at one decision in full",
      "We use `branch()` because each decision ends the flow. The strict policy checks support first, then block, then review, and otherwise passes the message. The diagram shows those explicit priorities and a named output for each possible route.",
      "End with the first matching strict-policy outcome: support, block, review, or pass.",
    ],
  },
  "citation-checking": {
    "prepare-source": [
      "Load the source and the citations",
      "We use `task()` to clean the source document and index its numbered sections. Text preparation is deterministic TypeScript. This card gives every later citation check an exact section to search before we ask the model about meaning.",
      "Clean and index the source so citations can be checked against exact sections.",
    ],
    "check-citations": [
      "Find each quote in the source",
      "We use `map()` to apply the same checks to each citation in order. Inside an item, `task()` checks whether the quote exists before `jev()` asks whether its context supports the claim. Conditions reject missing quotes or route uncertain answers for review; the collection contains this repeated process.",
      "Check each quote before asking whether its context supports the claim.",
    ],
    "citation-result": [
      "Check every citation",
      "We use `output()` to return all citation verdicts and their evidence together. The final card ends the flow. A missing quote comes from exact text matching, while a support judgment comes from the captured Choice answer, so callers can distinguish those findings.",
      "Return each citation's verdict with the evidence behind it.",
    ],
  },
  "rag-passages": {
    retrieve: [
      "Retrieve the top passages",
      "We use `task()` to load the retrieved passages for a sample query. This local example uses a fixed shortlist instead of running a search service. The task card makes the candidate text available to the assessment stage.",
      "Load fixed retrieval candidates for this sample query.",
    ],
    "classify-passages": [
      "Ask four questions about each passage",
      "We use `map()` because each passage can be assessed independently with the same question set. Each item uses `jev()` for the assessment and application rules for its route. The collection keeps individual requests inspectable and limits how many assessments run at once.",
      "Assess each passage independently, then apply the evidence-routing rules.",
    ],
    "assemble-evidence": [
      "Build the prompt from the accepted evidence",
      "We use `task()` to build an answering prompt from the accepted and conflicting evidence. Prompt assembly is deterministic code. Its card shows which passages reach the answer stage, so retrieving a passage does not automatically mean trusting it.",
      "Build the answering prompt from the accepted and conflicting evidence.",
    ],
    "sample-answer": [
      "Build the prompt from the accepted evidence",
      "We use `task()` here to supply a fixed sample answer. No answering-model call runs in this playground example. The card completes the pipeline while keeping the sample answer separate from the passage assessments made through `jev()`.",
      "Use a fixed sample answer to complete the example without a generation request.",
    ],
    "rag-result": [
      "Compare the six queries",
      "We use `output()` to return the sample answer alongside the passage decisions. The final card ends the pipeline and preserves the evidence for inspection. This makes it possible to follow a passage from retrieval through its route into the answer context.",
      "Return the sample answer alongside the passage decisions.",
    ],
  },
  "simple-memory": {
    "start-timeline": [
      "Define the tickets",
      "We use `task()` to create an empty memory store keyed by customer and prepare the ordered tickets. Initialization is ordinary TypeScript. This first card establishes the state that later tickets can update; each run starts with fresh memory.",
      "Start with empty memory for each customer.",
    ],
    "ticket-timeline": [
      "Wrap the call so it remembers",
      "We use `loop()` because each ticket can change the memory used by the next ticket. Inside a turn, requests assess routing and whether to remember the ticket, then code applies the memory rule. The loop carries the updated state forward and stops at its explicit iteration bound.",
      "Process tickets in order so each accepted memory can affect the next ticket.",
    ],
    "summarize-memory": [
      "Route the same messages for both customers",
      "We use `task()` to collect the saved memories and routing history after the loop. This is a deterministic summary of the completed state. The card lets us inspect how earlier accepted memories affected the context available to later tickets.",
      "Collect the saved memories and routing history after the loop.",
    ],
    "memory-showcase": [
      "Send the earlier tickets and watch the answers change",
      "We use `output()` to return the completed timeline. The final card ends the flow with the memories and routing decisions together. These fixed samples illustrate state passing between turns; they do not establish that memory improves model accuracy.",
      "Return the timeline so changes in memory and routing can be inspected.",
    ],
  },
  "hierarchical-classification": {
    "initial-frontier": [
      "Load and visualize the example hierarchies",
      "We use `task()` to start at the root of the chosen label hierarchy. It creates a frontier: the candidate paths still being explored. Both search methods receive this same starting state, so the diagram begins with one shared preparation card.",
      "Initialize the search frontier at the selected taxonomy root.",
    ],
    "compare-searches": [
      "Implement greedy and beam search",
      "We use `parallel()` because greedy and beam search can run independently. Each lane uses a bounded `loop()` to classify child labels and update its candidate paths. Greedy keeps one path; beam keeps several. The join waits for both searches before comparison.",
      "Run greedy and beam searches independently, then wait for both results.",
    ],
    "compare-results": [
      "Compare the methods",
      "We use `task()` to compare the selected leaf labels and retained path scores. This is arithmetic over the two search results, so no new request is needed. A gap between path scores describes this search; it is not a calibrated confidence value.",
      "Compare the selected leaves and path scores, which are not calibrated confidence.",
    ],
    classification: [
      "Results",
      "We use `output()` to return both search histories and their comparison. The final card exposes the paths that led to each label. These small sample hierarchies make traversal inspectable without reproducing a large dataset evaluation.",
      "Return both search histories and their comparison.",
    ],
  },
  "twitch-chat-filter": {
    "load-chat": [
      "Load a stretch of chat",
      "We use `task()` to load a finite chat sample in message order. Loading data is ordinary TypeScript and does not require inference. The first card supplies the list that the next step will process; this example is not connected to a live channel.",
      "Load the finite chat sample in message order.",
    ],
    "classify-chat": [
      "Filter the whole chat",
      "We use `map()` because each message can be assessed independently. Up to eight items run at once; each asks its questions through `jev()` and applies moderation rules in code. The collection returns results in input order even when requests finish in a different order.",
      "Assess up to eight messages at once while preserving input order in the results.",
    ],
    "assemble-chat": [
      "Change a rule without a new request",
      "We use `task()` to build normal and quiet chat views from the same assessments. The two policies apply different rules without repeating requests. This card shows how changing application policy changes which messages are displayed.",
      "Build normal and quiet views from the same assessments without new requests.",
    ],
    "filtered-chat": [
      "Decide what the viewer sees",
      "We use `output()` to return the ordered views and moderation decisions. The final card ends the flow and lets the caller inspect both policies. Returning these results does not modify a live Twitch channel.",
      "Return the filtered views and moderation decisions.",
    ],
  },
  "sde-cascade": {
    "cheap-extraction": [
      "Step 2: extract with the mini model (text mode)",
      "We use `task()` to load a fixed sample of a cheap model's extracted record. The original pattern starts with a lower-cost extraction; this local task supplies its sample result. The card gives the verifier a concrete structured record to check.",
      "Use a fixed sample in place of the original cheap extraction call.",
    ],
    "verify-record": [
      "Step 3: verify with TypeSafe",
      "We use `jev()` to check all fields of that record in one request. The question set tests the extraction against the source text. The request card preserves the verification answers that our application uses to decide whether stronger extraction is needed.",
      "Verify all fields in one request before deciding whether to escalate.",
    ],
    "field-flags": [
      "Step 4: the escalation gate",
      "We use `task()` to turn the verification answers into per-field flags. Reading and combining those answers is application logic. The task card exposes which fields trigger escalation before the diagram reaches the condition.",
      "Collect the verifier flags that control escalation.",
    ],
    escalate: [
      "Step 5: escalate to the reasoning model",
      "We use `if()` because both routes return a record and continue to the same comparison. Failed verification selects the stronger sample extraction; the other route keeps the cheap result. The diagram shows the two paths merging around the chosen record.",
      "Choose the stronger sample extraction only when verification calls for it.",
    ],
    "compare-records": [
      "Step 6: what this looks like on 100 prompts",
      "We use `task()` to compare the initial extraction with the selected record. This deterministic step makes any changed fields visible. The sample demonstrates selective escalation, but its fixed results do not measure a real model's quality or cost.",
      "Compare the initial and final records for this sample.",
    ],
    "extraction-result": [
      "Step 5: escalate to the reasoning model",
      "We use `output()` to return the chosen record and the route taken. Both paths share this result shape, so callers can consume the extraction while still seeing whether verification caused escalation. The output card marks the completed cascade.",
      "Return the chosen structured record and the route taken.",
    ],
  },
  "date-extraction": {
    "sample-roles": [
      "The questions",
      "We use `task()` to pair each sample document with a requested date role, such as the date of a particular event. A document can contain several dates, so the role matters. This card prepares explicit extraction targets for the next stage.",
      "Pair each sample document with the date role to extract.",
    ],
    "extract-dates": [
      "Resolve it in code",
      "We use `map()` to repeat date extraction for each requested role. Inside an item, `jev()` asks for date parts, `task()` resolves them into a calendar date, and `if()` chooses acceptance or review. This keeps model interpretation, date arithmetic, and confidence checks visible as separate operations.",
      "Ask for date components, resolve them in code, and check confidence for each role.",
    ],
    "summarize-dates": [
      "Confidence to route on",
      "We use `task()` to collect the resolved dates and their review decisions. This summary runs in TypeScript after the collection finishes. Keeping the review status means that an assembled date is not silently treated as a certain answer.",
      "Collect resolved dates and identify those that need review.",
    ],
    "date-results": [
      "Run it",
      "We use `output()` to return the dates together with their evidence and review status. The final card marks the completed extraction. A caller can use accepted results while handling unresolved or uncertain dates separately.",
      "Return the dates with their evidence and review decisions.",
    ],
  },
  "pre-parsed-extraction": {
    "find-candidates": [
      "Helpers",
      "We use `task()` to find candidate values with regular expressions and retain their source spans. Parsing is deterministic TypeScript. The model will choose among these actual strings, so this first card defines what the later questions can extract.",
      "Find candidate source spans before asking the model to choose among them.",
    ],
    "has-candidates": [
      "Two limits",
      "We use `if()` to avoid requests when the parser finds no candidates. Otherwise the path asks the extraction helpers to choose relevant spans. Both paths return a value, so the diagram merges them before normalization continues.",
      "Skip the requests when no candidates exist; otherwise call the extraction helpers.",
    ],
    "money-or-contact": [
      "Money: pick the amount, classify the currency, flag credit vs charge",
      "We use `if()` because money and contact details need different normalization rules. The money path checks amounts and credits; the contact path normalizes the selected email or phone. Each returns normalized rows, and the merge lets the rest of the flow use one shared result.",
      "Normalize money and contact values with their respective rules.",
    ],
    "assemble-result": [
      "Helpers",
      "We use `task()` to combine the original candidates, selected spans, and normalized values. This is data assembly, not another inference request. Its card preserves the source text beside the normalized result so each value remains traceable.",
      "Keep the source spans alongside the selected and normalized values.",
    ],
    "extracted-values": [
      "Two limits",
      "We use `output()` to return the extracted values. The final card marks the end of the flow. Because the questions choose from parser candidates, a value that the parser missed cannot be recovered by the model in this recipe.",
      "Return the values selected from the candidates the parser found.",
    ],
  },
  "structure-recovery": {
    "prepare-lines": [
      "The document: a team memo that lost its formatting",
      "We use `task()` to normalize the document and assign each line a stable ID. This preparation preserves the connection to the original text. The first card gives the following questions explicit line references instead of asking the model to rewrite the document.",
      "Normalize the text and give each line a stable identifier.",
    ],
    "has-adjacent-pairs": [
      "Pass 1: stitching split sentences",
      "We use `if()` to ask the stitching request only when adjacent nonblank line pairs exist. The request identifies which pairs belong to one sentence. An empty or trivial document takes the other path; both paths return join decisions for the next step.",
      "Ask which adjacent lines belong together only when pairs exist.",
    ],
    "merge-lines": [
      "Pass 1: stitching split sentences",
      "We use `task()` to join the lines selected by the stitching answers. The model supplies decisions, while TypeScript performs the text transformation. This card produces the recovered blocks that the second request will classify.",
      "Join lines in code using the stitching decisions.",
    ],
    "has-blocks": [
      "Pass 2: classifying blocks",
      "We use `if()` to send the block-classification request only when blocks exist. The request assigns structural roles, such as headings or paragraphs. The other path handles an empty document, and the merge supplies labels to the renderer.",
      "Classify the recovered blocks only when there are blocks to label.",
    ],
    "render-markdown": [
      "Rendering",
      "We use `task()` to render Markdown from the recovered blocks and their labels. Formatting is deterministic TypeScript, so it needs no generation request. This card shows how the classification decisions become document structure while preserving the text.",
      "Render Markdown from the block labels without asking the model to rewrite the text.",
    ],
    "recovered-document": [
      "Rendering",
      "We use `output()` to return the recovered document and evidence from both passes. The final card completes the flow. You can inspect the stitching decisions and block labels separately from the Markdown they produced.",
      "Return the recovered document and evidence from both passes.",
    ],
  },
  reranking: {
    "retrieve-sample": [
      "Ranking the passages with fast search",
      "We use `task()` to load a fixed retrieval shortlist and retain its original order. Retrieval has already supplied the candidates in this local example. The task card gives us a before-order to compare with the relevance-based order.",
      "Load the sample shortlist and retain its original order.",
    ],
    "score-candidates": [
      "Re-ranking it with TypeSafe",
      "We use `map()` to assess each candidate independently through `jev()`. Each request asks a Noul relevance question, returning its own yes-probability. The collection limits concurrency and preserves individual requests; these values are not a Choice distribution that must sum to one.",
      "Assess each candidate's relevance independently with a Noul question.",
    ],
    "sort-candidates": [
      "Re-ranking moves the right answer toward the top",
      "We use `task()` to sort candidates by their returned relevance probabilities. Sorting is application code and requires no new request. The task changes the order, while preserving the probabilities and original candidate text.",
      "Sort by relevance without changing the returned probabilities.",
    ],
    "reranking-result": [
      "A re-ranking example",
      "We use `output()` to return both the original and reranked lists with their evidence. The final card makes the change in order inspectable. Fixed sample answers demonstrate the mechanics without measuring retrieval quality.",
      "Return the original order, reranked order, and candidate evidence.",
    ],
  },
  "line-search": {
    "tag-lines": [
      "Step 1: tag every line with an ID",
      "We use `task()` to tag every document line with a stable ID. A model answer can then name an ID that our code resolves to exact source text. The first card prepares those choices without a model request.",
      "Assign line IDs so answers can be traced to exact source text.",
    ],
    find: [
      "Step 4: send both questions in one request",
      "We use `jev()` to ask two questions together: which line fits best, and whether an answer exists. Choice ranks line IDs even if none answers the query; a separate Noul estimates answer existence. The request card preserves both signals for different decisions.",
      "Ask both which line fits best and whether an answer exists at all.",
    ],
    "rank-lines": [
      "Step 5: read the result",
      "We use `task()` to sort the line probabilities returned by Choice. This produces a ranked list without another request. Ranking alone does not establish that the document contains an answer, so the existence decision remains a separate step.",
      "Rank the line probabilities separately from the answer-existence decision.",
    ],
    "lookup-lines": [
      "Step 5: read the result",
      "We use `task()` to look up the source text for each ranked line ID. This deterministic lookup makes the evidence readable and traceable. The card now holds actual document lines rather than only model-selected identifiers.",
      "Resolve ranked IDs back to the original document lines.",
    ],
    "answer-exists": [
      "Step 3: check whether an answer exists",
      "We use `branch()` because answered, absent, and partial are terminal outcomes. Application thresholds on the existence answer choose the route. Each path returns its own output, so the diagram ends at a named result instead of merging into shared work.",
      "Apply the existence thresholds to return an answered, absent, or partial result.",
    ],
  },
  "entity-alignment": {
    "prepare-pair": [
      "Load the candidate pairs",
      "We use `task()` to load the two records we want to compare. Candidate generation happens before this flow; here we assess one supplied pair. This card prepares both records for the same request.",
      "Load the candidate pair that this flow will assess.",
    ],
    "assess-pair": [
      "Ask one Score question and three Noul questions per candidate pair",
      "We use `jev()` to ask for a match level on an ordered Score scale and supporting Noul probabilities for individual fields. The Score controls routing; the field answers explain specific evidence. One request card keeps these signals together without treating them as interchangeable.",
      "Ask for the routing Score and supporting field probabilities together.",
    ],
    "prepare-evidence": [
      "Route every candidate pair",
      "We use `task()` to assemble the record pair and its field-level evidence. This deterministic step prepares the payload for any eventual route. The task card lets a reviewer inspect the records and supporting answers together.",
      "Attach the pair and its field evidence to the proposed outcome.",
    ],
    "below-lower-boundary": [
      "Route every candidate pair",
      "We use `branch()` because each Score range ends with a different outcome. Low values leave the pair unlinked, intermediate values request review, and high values propose a match. Each path has its own output; this example returns a proposal rather than merging records.",
      "Use Score boundaries to propose a match, request review, or leave the pair unlinked.",
    ],
  },
  "parallel-questions": {
    "validate-sample": [
      "The questions: 8 nouls + 2 choices + 3 scores",
      "We use `task()` to prepare one document and the same 13 questions for both strategies. Eight Nouls, two Choices, and three Scores cover different answer types. This shared input makes the comparison about request grouping rather than different prompts.",
      "Use the same document and 13 questions for both strategies.",
    ],
    "batched-repeats": [
      "Ask two ways, 5 times each",
      "We use `loop()` to repeat the batched strategy five times while collecting its results. Each turn sends all 13 questions through one `jev()` request. The loop carries the count and prior answers forward, with an explicit limit of five turns.",
      "Repeat five times, sending all 13 questions in one request per repeat.",
    ],
    "single-repeats": [
      "Ask two ways, 5 times each",
      "We use a second `loop()` for five repeats of the single-question strategy. Inside each turn, `map()` with concurrency one sends the 13 questions sequentially. The nested collection makes the extra requests visible; the recipe title refers to independent questions, not concurrent calls here.",
      "Repeat five times, sending the 13 questions one at a time within each repeat.",
    ],
    "compare-strategies": [
      "Batching doesn't change the answers",
      "We use `task()` to compare answer statistics and request counts for the two strategies. This arithmetic runs after both loops. The fixed fixtures demonstrate how to compute the comparison, but cannot establish real model consistency, latency, or cost.",
      "Compare the fixture answers and request counts for the two strategies.",
    ],
    comparison: [
      "The only difference: cost and speed",
      "We use `output()` to return the comparison and request counts together. The final card exposes the structural difference: one request per batched repeat versus 13 per single-question repeat. Model-performance conclusions require measured responses, not these synthetic samples.",
      "Return the sample comparison without claiming measured model performance.",
    ],
  },
  "consistency-choices": {
    "prepare-repeats": [
      "The state: a borderline user post, as JSON",
      "We use `task()` to create 15 request states that differ only in a uid field. The post and eight-question rubric stay fixed. This card prepares a controlled comparison where an irrelevant input changes but the content being assessed does not.",
      "Vary only the uid across 15 states, keeping the post and rubric fixed.",
    ],
    repeats: [
      "How we ask",
      "We use `map()` with concurrency one to send the 15 requests sequentially. Each item asks all eight Choice questions through `jev()`. The collection retains each distribution, so later analysis can compare probabilities as well as winning labels.",
      "Run 15 requests sequentially, each containing all eight Choice questions.",
    ],
    statistics: [
      "How we ask",
      "We use `task()` to calculate agreement and variation across repeats. Our code also abstains when the winning option's probability is below 0.60. That cutoff uses Choice probability, not API confidence, and the task card keeps the rule separate from the requests.",
      "Measure fixture variation and abstain below a top probability of 0.60.",
    ],
    "consistency-report": [
      "How we ask",
      "We use `output()` to return the raw choices and derived decisions. The final card lets you inspect both the answers and the abstention policy. Synthetic repeats explain the analysis process without supplying new evidence of model consistency.",
      "Return the raw choices and derived application decisions.",
    ],
  },
  "consistency-nouls": {
    "prepare-repeats": [
      "The state: an auto-insurance claim, as JSON",
      "We use `task()` to create 15 versions of a claim with different uid fields and the same 14-question rubric. Keeping the claim content fixed isolates an irrelevant input change. The preparation card supplies the repeated assessments that follow.",
      "Create 15 claim states with distinct uid fields and the same rubric.",
    ],
    "repeat-rubric": [
      "How we ask",
      "We use `map()` with concurrency one to assess the claim states sequentially. Each `jev()` request asks all 14 Noul questions, which return independent yes-probabilities. The collection preserves every value instead of immediately reducing answers to yes or no.",
      "Ask all 14 Noul questions in each sequential request.",
    ],
    "describe-fixtures": [
      "How we ask",
      "We use `task()` to summarize variation and apply an explicit uncertainty rule. Probabilities from 0.30 through 0.70, including both boundaries, go to review. This card shows how application policy turns continuous probabilities into decisions.",
      "Summarize fixture variation and send probabilities from 0.30 through 0.70 to review.",
    ],
    "noul-results": [
      "How we ask",
      "We use `output()` to return the probabilities and derived decisions together. The final card preserves the evidence behind the review route. These synthetic cases demonstrate uncertainty handling; they do not decide real insurance eligibility or measure model performance.",
      "Return the probabilities and the decisions derived from them.",
    ],
  },
};
