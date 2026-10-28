export const cookbookCatalog = [
  {
    slug: "confidence-fallback",
    title: "Confidence fallback",
    category: "Classification",
    source:
      "https://docs.typesafe.ai/cookbooks/classification_using_confidence",
    intro:
      "Classify a company once, then use API confidence to decide how specific the returned industry label should be.",
  },
  {
    slug: "skill-suggestion",
    title: "Skill suggestion",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/skill_suggestion",
    intro:
      "Find a useful skill in a large catalog by ranking candidates, checking whether a skill is needed, and reassessing a shortlist.",
  },
  {
    slug: "function-calling",
    title: "Function calling",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/function_calling",
    intro:
      "Translate a request into a proposed function and closed-set arguments, preserving defaults and checking the confidence of relevant choices.",
  },
  {
    slug: "guardrails",
    title: "LLM guardrails",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/llm_guardrails",
    intro:
      "Assess a message once, then apply explicit hazard and severity policies to decide whether to pass, review, or block it.",
  },
  {
    slug: "citation-checking",
    title: "Citation checking",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/citation_check",
    intro:
      "Check that a quotation exists before asking whether its surrounding context supports a claim.",
  },
  {
    slug: "rag-passages",
    title: "RAG passages",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/classifying_rag_passages",
    intro:
      "Evaluate retrieved passages independently, then let application policy choose the evidence that reaches an answering model.",
  },
  {
    slug: "simple-memory",
    title: "Simple memory",
    category: "Agents",
    source: "https://docs.typesafe.ai/cookbooks/basic_memory",
    intro:
      "Process related requests in order and carry forward only memories admitted by an explicit gate.",
  },
  {
    slug: "hierarchical-classification",
    title: "Hierarchical classification",
    category: "Classification",
    source: "https://docs.typesafe.ai/cookbooks/hierarchical_classification",
    intro:
      "Explore a label hierarchy iteratively, comparing greedy selection with a beam that retains multiple plausible paths.",
  },
  {
    slug: "twitch-chat-filter",
    title: "Twitch chat filter",
    category: "Classification",
    source: "https://docs.typesafe.ai/cookbooks/twitch_chat_filter",
    intro:
      "Assess each chat message with several questions and apply moderation rules while keeping concurrency bounded.",
  },
  {
    slug: "sde-cascade",
    title: "SDE cascade",
    category: "Extraction",
    source: "https://docs.typesafe.ai/cookbooks/sde_cascade",
    intro:
      "Verify an initial extraction and escalate only the records whose fields fail the verification policy.",
  },
  {
    slug: "date-extraction",
    title: "Date extraction",
    category: "Extraction",
    source: "https://docs.typesafe.ai/cookbooks/date_extraction_cookbook",
    intro:
      "Ask for the parts of a date, resolve them deterministically, and route low-confidence results for review.",
  },
  {
    slug: "pre-parsed-extraction",
    title: "Pre-parsed extraction",
    category: "Extraction",
    source:
      "https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook",
    intro:
      "Find candidate values with regular expressions, ask which span answers the request, then normalize the selected text.",
  },
  {
    slug: "structure-recovery",
    title: "Structure recovery",
    category: "Extraction",
    source: "https://docs.typesafe.ai/cookbooks/autoformat",
    intro:
      "Recover document structure in two passes: join broken lines, then classify blocks and render Markdown.",
  },
  {
    slug: "reranking",
    title: "Re-ranking",
    category: "Search",
    source: "https://docs.typesafe.ai/cookbooks/rerank_typesafe",
    intro:
      "Start with a retrieval shortlist, assess each candidate independently, then reorder it without changing the captured probabilities.",
  },
  {
    slug: "line-search",
    title: "Line-by-line search",
    category: "Search",
    source: "https://docs.typesafe.ai/cookbooks/semantic_find",
    intro:
      "Ask which document lines answer a query and whether an answer exists, then apply an explicit existence gate.",
  },
  {
    slug: "entity-alignment",
    title: "Entity alignment",
    category: "Search",
    source: "https://docs.typesafe.ai/cookbooks/entity_alignment",
    intro:
      "Compare two records with a Score and companion Nouls, then route the pair to rejection, review, or a proposed match.",
  },
  {
    slug: "parallel-questions",
    title: "Parallel questions",
    category: "Techniques",
    source: "https://docs.typesafe.ai/cookbooks/parallel_questions",
    intro:
      "Compare one request containing a question battery with sequential single-question calls over the same document.",
  },
  {
    slug: "consistency-choices",
    title: "Choice self-consistency",
    category: "Techniques",
    source: "https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook",
    intro:
      "Repeat a fixed Choice battery and separate label agreement from the decision to abstain at low confidence.",
  },
  {
    slug: "consistency-nouls",
    title: "Noul self-consistency",
    category: "Techniques",
    source: "https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook",
    intro:
      "Repeat a fixed Noul rubric, preserve every probability, and route values in the uncertainty band to human review.",
  },
] as const;
export type CookbookSlug = (typeof cookbookCatalog)[number]["slug"];
