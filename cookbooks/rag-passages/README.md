# RAG passage classification

Local adaptation of [TypeSafe's cookbook](https://docs.typesafe.ai/cookbooks/classifying_rag_passages). Uses `flow.map()` from Jev DevTools 0.4.0. Run the cookbook from this repository; its application code and fixtures are not bundled in npm.

## Try the full sample flow

```sh
npm install
npm run dev
```

Open [RAG passages](http://127.0.0.1:4182/?cookbook=rag-passages), choose a case, and **Run sample**. No keys or external API calls are needed.

- **False premise:** twelve candidates; a conflicting passage survives while the planted injection is excluded.
- **Answerable:** twelve candidates; four sources reach the evidence block. Other passages show injection, relevance and insufficient-evidence exclusions.
- **Empty retrieval:** zero candidates; the collection completes without Jev calls and the answer reports insufficient evidence.

Open **Jev DevTools → Flows**, select **Classify retrieved passages**, choose a **Collection item** inside its card, and click **View Flow**. Its connected diagram appears below the collection on the same canvas, with the actual Jev request, four answer options, routing function and result. Change the item selector to switch that diagram in place; **Hide Flow** collapses it. The parent flow stays visible and shares pan/zoom with the item diagram. The collection shows completed/running/queued counts; at most four passages execute at a time. **Cancel** stops active and queued work. The result cards use the same item numbers and expose all scores, reasons and passage text.

## Fidelity and sample boundaries

The flow preserves the source's four Noul questions, request state fields, one-request-per-passage structure, concurrency of four, ordered results and routing precedence:

1. Injection **> 0.70** → exclude.
2. Contradiction **> 0.70** → conflicting evidence.
3. Relevance **< 0.45** → exclude.
4. Answer evidence **> 0.55** → include.
5. Otherwise exclude.

The prompt keeps accepted and conflicting evidence separate and drops excluded passages. These thresholds are the cookbook's policy, not a general guarantee that content is safe.

This is a **sample-only end-to-end execution of the flow**, not a reproduction of the notebook evaluation:

- Retrieval returns the source page's fixed twelve-candidate lists. It does **not** run embeddings or search all 81 passages. The fourteen unique source passages needed by those lists are vendored unchanged.
- The SDK receives **authored synthetic Noul values**, labeled `synthetic-rag-sample`. They are not the official cache or measured model results. Query, passage and question mismatches fail rather than returning unrelated fixtures.
- Final generation is a deterministic cited-excerpt preview using only accepted/conflicting sources. It does **not** call Claude or claim to reproduce its answer.
- All sorting/grouping, routing, prompt assembly, map scheduling, cancellation and request recording execute normally. No fabricated usage or evaluation metrics are supplied. Live mode is disabled for this example.

A future live adaptation can replace the retrieval and generation tasks with server-side provider calls and use the normal Jev client; keep the same typed map and routing steps. It needs separate provider configuration, capture review and live verification.

## Files and attribution

- [flow.ts](flow.ts): map program, routing policy, evidence assembly and sample-answer task.
- [samples.ts](samples.ts): synthetic SDK transport; [cases.ts](cases.ts): sample inputs.
- [passages.json](passages.json): 14 unmodified records selected from the pinned official corpus; [provenance.json](provenance.json): hashes and transformation.
- [TypeSafe MIT license](LICENSE.typesafe) and [Supabase Apache 2.0 license](LICENSE.supabase).

The upstream cookbook attributes official-documentation passages to Supabase Auth docs at abbreviated revision `2440b06`; that abbreviated URL did not resolve during this implementation. We pin the retrievable TypeSafe corpus snapshot instead. The Apache notice was retrieved from the Supabase repository's `master/LICENSE`. The `forum-injection` record was authored upstream as an adversarial example and is treated only as data. This community adaptation is not an official TypeSafe or Supabase product.
