import { parallelQuestionsFlow } from "../../../cookbooks/parallel-questions/flow.js";
import { readCookbook } from "./workbench.js";
import { parallelQuestionsSampleTransport } from "../../../cookbooks/parallel-questions/samples.js";
import {
  parallelQuestionsCases,
  isParallelQuestionsCase,
  type ParallelQuestionsCase,
} from "../../../cookbooks/parallel-questions/cases.js";
import { twitchFlow } from "../../../cookbooks/twitch-chat-filter/flow.js";
import { twitchSampleTransport } from "../../../cookbooks/twitch-chat-filter/samples.js";
import {
  twitchCases,
  isTwitchCase,
  type TwitchCase,
} from "../../../cookbooks/twitch-chat-filter/cases.js";
import { entityFlow } from "../../../cookbooks/entity-alignment/flow.js";
import { entitySampleTransport } from "../../../cookbooks/entity-alignment/samples.js";
import {
  entityCases,
  isEntityCase,
  type EntityCase,
} from "../../../cookbooks/entity-alignment/cases.js";
import { citationFlow } from "../../../cookbooks/citation-checking/flow.js";
import { citationSampleTransport } from "../../../cookbooks/citation-checking/samples.js";
import {
  citationCases,
  isCitationCase,
  type CitationCase,
} from "../../../cookbooks/citation-checking/cases.js";
import { confidenceFlow } from "../../../cookbooks/confidence-fallback/flow.js";
import { confidenceSampleTransport } from "../../../cookbooks/confidence-fallback/samples.js";
import {
  confidenceCases,
  isConfidenceCase,
  type ConfidenceCase,
} from "../../../cookbooks/confidence-fallback/cases.js";
import { lineSearchFlow } from "../../../cookbooks/line-search/flow.js";
import { lineSearchSampleTransport } from "../../../cookbooks/line-search/samples.js";
import {
  lineSearchCases,
  isLineSearchCase,
  type LineSearchCase,
} from "../../../cookbooks/line-search/cases.js";
import { rerankingFlow } from "../../../cookbooks/reranking/flow.js";
import { rerankingSampleTransport } from "../../../cookbooks/reranking/samples.js";
import {
  rerankingCases,
  isRerankingCase,
  type RerankingCase,
} from "../../../cookbooks/reranking/cases.js";
import { dateFlow } from "../../../cookbooks/date-extraction/flow.js";
import { dateSampleTransport } from "../../../cookbooks/date-extraction/samples.js";
import {
  dateCases,
  isDateCase,
  type DateCase,
} from "../../../cookbooks/date-extraction/cases.js";
import { extractionFlow } from "../../../cookbooks/pre-parsed-extraction/flow.js";
import { extractionSampleTransport } from "../../../cookbooks/pre-parsed-extraction/samples.js";
import {
  extractionCases,
  isExtractionCase,
  type ExtractionCase,
} from "../../../cookbooks/pre-parsed-extraction/cases.js";
import { functionFlow } from "../../../cookbooks/function-calling/flow.js";
import { functionSampleTransport } from "../../../cookbooks/function-calling/samples.js";
import {
  functionCases,
  isFunctionCase,
  type FunctionCase,
} from "../../../cookbooks/function-calling/cases.js";
import { guardrailsFlow } from "../../../cookbooks/guardrails/flow.js";
import { guardrailsSampleTransport } from "../../../cookbooks/guardrails/samples.js";
import {
  guardrailsCases,
  isGuardrailsCase,
  type GuardrailsCase,
} from "../../../cookbooks/guardrails/cases.js";
import { consistencyFlow } from "../../../cookbooks/consistency-choices/flow.js";
import { consistencySampleTransport } from "../../../cookbooks/consistency-choices/samples.js";
import {
  consistencyCases,
  isConsistencyCase,
  type ConsistencyCase,
} from "../../../cookbooks/consistency-choices/cases.js";
import {
  createNoulFlow,
  flowName as noulFlowName,
} from "../../../cookbooks/consistency-nouls/flow.js";
import { createNoulSample } from "../../../cookbooks/consistency-nouls/samples.js";
import {
  noulCases,
  isNoulCase,
  type NoulCase,
} from "../../../cookbooks/consistency-nouls/cases.js";
import { memoryFlow } from "../../../cookbooks/simple-memory/flow.js";
import { memorySampleTransport } from "../../../cookbooks/simple-memory/samples.js";
import {
  memoryCases,
  isMemoryCase,
  type MemoryCase,
} from "../../../cookbooks/simple-memory/cases.js";
import { structureFlow } from "../../../cookbooks/structure-recovery/flow.js";
import { structureSampleTransport } from "../../../cookbooks/structure-recovery/samples.js";
import {
  structureCases,
  isStructureCase,
  type StructureCase,
} from "../../../cookbooks/structure-recovery/cases.js";
import {
  hierarchyFlow,
  hierarchyLimitFlow,
} from "../../../cookbooks/hierarchical-classification/flow.js";
import { hierarchySampleTransport } from "../../../cookbooks/hierarchical-classification/samples.js";
import {
  hierarchyCases,
  isHierarchyCase,
  type HierarchyCase,
} from "../../../cookbooks/hierarchical-classification/cases.js";
import { sdeFlow } from "../../../cookbooks/sde-cascade/flow.js";
import { sdeSampleTransport } from "../../../cookbooks/sde-cascade/samples.js";
import {
  sdeCases,
  isSdeCase,
  type SdeCase,
} from "../../../cookbooks/sde-cascade/cases.js";
import { ragFlow } from "../../../cookbooks/rag-passages/flow.js";
import { ragSampleTransport } from "../../../cookbooks/rag-passages/samples.js";
import {
  ragCases,
  isRagCase,
  type RagCase,
} from "../../../cookbooks/rag-passages/cases.js";
import {
  refundFlow,
  parallelFlow,
  skillShortlistFlow,
  flowTransport,
} from "./flows.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

import { createJevDevtools } from "jev-devtools/server";
import { makeRequest, sampleTransport } from "./scenarios.ts";
import { sampleProfiles, type SampleProfile } from "../src/sample-profiles.js";
import { validStress, type StressOptions } from "../src/stress-options.js";
import type { Scenario } from "./scenarios.ts";
import {
  createSkillSuggestionFlow,
  defaultModel,
} from "../../../cookbooks/skill-suggestion/flow.js";
import { skillSampleTransport } from "../../../cookbooks/skill-suggestion/samples.js";
import {
  isSkillCase,
  skillCases,
} from "../../../cookbooks/skill-suggestion/cases.js";

const send = (res: ServerResponse, status: number, data: unknown) => {
  res
    .writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    })
    .end(JSON.stringify(data));
};
const validSession = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
export function jevInspectorServer(
  apiKey?: string,
  cookbookModel = defaultModel,
  captureLimit?: number,
): Plugin {
  const cookbook = createSkillSuggestionFlow(cookbookModel);
  const running = new Map<
    string,
    { session: string; controller: AbortController }
  >();

  return {
    name: "jev-inspector-server",
    apply: "serve",
    configureServer(server) {
      // Use Vite's resolved port, including CLI overrides, for both route guards.
      // Keep the trusted loopback host independent of request headers.
      const host = `127.0.0.1:${server.config.server.port ?? 4182}`;
      const origin = `http://${host}`;
      const inspector = createJevDevtools({
        enabled: true,
        origin,
        limit: captureLimit,
      });
      server.httpServer?.once("close", () => {
        for (const r of running.values()) r.controller.abort();
        inspector.dispose();
      });
      server.middlewares.use(inspector.middleware);
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next) => {
          if (!req.url?.startsWith("/__jev/")) return next();
          if (
            req.headers.host !== host ||
            (req.headers.origin && req.headers.origin !== origin) ||
            req.headers["sec-fetch-site"] === "cross-site"
          ) {
            send(res, 403, { error: "Local same-origin requests only." });
            return;
          }
          const url = new URL(req.url, origin),
            session = url.searchParams.get("session");
          if (!validSession(session)) {
            send(res, 400, { error: "A valid inspector session is required." });
            return;
          }
          if (req.method === "GET" && url.pathname === "/__jev/config") {
            send(res, 200, { liveAvailable: !!apiKey, version: 1 });
            return;
          }
          if (
            req.method === "GET" &&
            url.pathname.startsWith("/__jev/cookbooks/")
          ) {
            try {
              const cookbook = await readCookbook(
                url.pathname.slice("/__jev/cookbooks/".length),
                url.searchParams.get("sample") ?? undefined,
              );
              send(
                res,
                cookbook ? 200 : 404,
                cookbook ?? { error: "Unknown cookbook" },
              );
            } catch {
              send(res, 500, {
                error: "The cookbook source could not be loaded.",
              });
            }
            return;
          }
          if (req.method !== "POST") {
            send(res, 405, { error: "Method not allowed" });
            return;
          }
          // A POST must originate in this page. The inspector never exposes a proxy
          // accepting arbitrary endpoints, headers, or API credentials from a browser.
          if (req.headers.origin !== origin) {
            send(res, 403, { error: "Same-origin POST required." });
            return;
          }
          let body: {
            scenario?: string;
            mode?: string;
            message?: string;
            runId?: string;
            profile?: SampleProfile;
            stress?: StressOptions;
            cookbookCase?: string;
            ragCase?: string;
            sdeCase?: string;
            hierarchyCase?: string;
            twitchCase?: string;
            structureCase?: string;
            entityCase?: string;
            confidenceCase?: string;
            memoryCase?: string;
            parallelQuestionsCase?: string;
            citationCase?: string;
            lineSearchCase?: string;
            rerankingCase?: string;
            dateCase?: string;
            extractionCase?: string;
            functionCase?: string;
            guardrailsCase?: string;
            consistencyCase?: string;
            noulCase?: string;
          };
          try {
            let text = "";
            for await (const chunk of req) {
              text += chunk;
              if (Buffer.byteLength(text) > 16_000) {
                send(res, 413, { error: "Request too large" });
                return;
              }
            }
            body = JSON.parse(text || "{}");
            if (!body || typeof body !== "object" || Array.isArray(body))
              throw new Error("Expected object");
          } catch {
            send(res, 400, { error: "Invalid JSON" });
            return;
          }
          if (url.pathname === "/__jev/cancel") {
            const item = running.get(body.runId || "");
            if (item?.session === session) item.controller.abort();
            send(res, 200, { ok: true });
            return;
          }
          if (url.pathname !== "/__jev/run") {
            send(res, 404, { error: "Not found" });
            return;
          }
          if (
            ![
              "triage",
              "image",
              "retry",
              "error",
              "stress",
              "flow-approve",
              "flow-functions",
              "flow-skills",
              "flow-rag",
              "flow-sde",
              "flow-hierarchy",
              "flow-twitch",
              "flow-structure",
              "flow-entity",
              "flow-confidence",
              "flow-memory",
              "flow-parallel-questions",
              "flow-citation",
              "flow-line-search",
              "flow-reranking",
              "flow-date",
              "flow-extraction",
              "flow-function-calling",
              "flow-guardrails",
              "flow-consistency-choices",
              "flow-nouls",
              "flow-manual",
              "flow-other",
              "flow-parallel",
              "flow-error",
              "flow-cancel",
            ].includes(body.scenario || "") ||
            !["sample", "live"].includes(body.mode || "") ||
            !validSession(body.runId) ||
            typeof body.message !== "string" ||
            body.message.length > 8000 ||
            (body.scenario === "stress" && !validStress(body.stress)) ||
            (body.scenario === "flow-parallel-questions" &&
              (!isParallelQuestionsCase(body.parallelQuestionsCase) ||
                body.message !==
                  parallelQuestionsCases[body.parallelQuestionsCase]
                    .message)) ||
            (body.scenario === "flow-citation" &&
              (!isCitationCase(body.citationCase) ||
                body.message !== citationCases[body.citationCase].message)) ||
            (body.scenario === "flow-line-search" &&
              (!isLineSearchCase(body.lineSearchCase) ||
                body.message !==
                  lineSearchCases[body.lineSearchCase].message)) ||
            (body.scenario === "flow-reranking" &&
              (!isRerankingCase(body.rerankingCase) ||
                body.message !== rerankingCases[body.rerankingCase].message)) ||
            (body.scenario === "flow-date" &&
              (!isDateCase(body.dateCase) ||
                body.message !== dateCases[body.dateCase].message)) ||
            (body.scenario === "flow-extraction" &&
              (!isExtractionCase(body.extractionCase) ||
                body.message !==
                  extractionCases[body.extractionCase].message)) ||
            (body.scenario === "flow-function-calling" &&
              (!isFunctionCase(body.functionCase) ||
                body.message !== functionCases[body.functionCase].message)) ||
            (body.scenario === "flow-guardrails" &&
              (!isGuardrailsCase(body.guardrailsCase) ||
                body.message !==
                  guardrailsCases[body.guardrailsCase].message)) ||
            (body.scenario === "flow-consistency-choices" &&
              (!isConsistencyCase(body.consistencyCase) ||
                body.message !==
                  consistencyCases[body.consistencyCase].message)) ||
            (body.scenario === "flow-nouls" &&
              (body.mode !== "sample" ||
                !isNoulCase(body.noulCase) ||
                body.message !== noulCases[body.noulCase].message)) ||
            (body.scenario === "flow-memory" &&
              (!isMemoryCase(body.memoryCase) ||
                body.message !== memoryCases[body.memoryCase].message)) ||
            (body.scenario === "flow-entity" &&
              (!isEntityCase(body.entityCase) ||
                body.message !== entityCases[body.entityCase].message)) ||
            (body.scenario === "flow-confidence" &&
              (!isConfidenceCase(body.confidenceCase) ||
                body.message !==
                  confidenceCases[body.confidenceCase].message)) ||
            (body.scenario === "flow-structure" &&
              (!isStructureCase(body.structureCase) ||
                body.message !== structureCases[body.structureCase].message)) ||
            (body.scenario === "flow-twitch" &&
              (!isTwitchCase(body.twitchCase) ||
                body.message !== twitchCases[body.twitchCase].message)) ||
            (body.scenario === "flow-hierarchy" &&
              (!isHierarchyCase(body.hierarchyCase) ||
                body.message !== hierarchyCases[body.hierarchyCase].message)) ||
            (body.scenario === "flow-sde" &&
              (!isSdeCase(body.sdeCase) ||
                body.message !== sdeCases[body.sdeCase].message)) ||
            (body.scenario === "flow-rag" &&
              (!isRagCase(body.ragCase) ||
                body.message !== ragCases[body.ragCase].message)) ||
            (body.scenario === "flow-skills" &&
              (!isSkillCase(body.cookbookCase) ||
                (body.mode === "sample" &&
                  body.message !== skillCases[body.cookbookCase].message))) ||
            (body.profile !== undefined &&
              (typeof body.profile !== "string" ||
                !Object.hasOwn(sampleProfiles, body.profile)))
          ) {
            send(res, 400, {
              error: "Invalid scenario, mode, message, or run ID.",
            });
            return;
          }
          if (body.mode === "live" && !apiKey) {
            send(res, 409, {
              error: "Set TYPESAFE_API_KEY on the server to enable live calls.",
            });
            return;
          }
          if (
            body.mode === "live" &&
            (["retry", "error", "stress"].includes(body.scenario!) ||
              (body.scenario!.startsWith("flow-") &&
                body.scenario !== "flow-skills"))
          ) {
            send(res, 400, {
              error:
                "Error and sandbox scenarios use the sample transport only.",
            });
            return;
          }
          if (running.size >= 6 || running.has(body.runId)) {
            send(res, 429, { error: "A maximum of six runs can be active." });
            return;
          }
          const controller = new AbortController(),
            id = body.runId;
          running.set(id, { session, controller });
          try {
            if (body.scenario!.startsWith("flow-")) {
              const flow =
                body.scenario === "flow-rag"
                  ? ragFlow
                  : body.scenario === "flow-skills"
                    ? cookbook
                    : body.scenario === "flow-functions"
                      ? skillShortlistFlow
                      : body.scenario === "flow-parallel"
                        ? parallelFlow
                        : refundFlow;
              const noulSample =
                body.scenario === "flow-nouls"
                  ? createNoulSample(body.noulCase as NoulCase)
                  : null;
              const client = inspector.createClient(
                {
                  apiKey: body.mode === "live" ? apiKey : "sample-only",
                  fetch:
                    body.scenario === "flow-parallel-questions"
                      ? parallelQuestionsSampleTransport(
                          body.parallelQuestionsCase as ParallelQuestionsCase,
                        )
                      : body.scenario === "flow-twitch"
                        ? twitchSampleTransport(body.twitchCase as TwitchCase)
                        : body.scenario === "flow-entity"
                          ? entitySampleTransport(body.entityCase as EntityCase)
                          : body.scenario === "flow-citation"
                            ? citationSampleTransport(
                                body.citationCase as CitationCase,
                              )
                            : body.scenario === "flow-confidence"
                              ? confidenceSampleTransport(
                                  body.confidenceCase as ConfidenceCase,
                                )
                              : body.scenario === "flow-line-search"
                                ? lineSearchSampleTransport(
                                    body.lineSearchCase as LineSearchCase,
                                  )
                                : body.scenario === "flow-reranking"
                                  ? rerankingSampleTransport(
                                      body.rerankingCase as RerankingCase,
                                    )
                                  : body.scenario === "flow-date"
                                    ? dateSampleTransport(
                                        body.dateCase as DateCase,
                                      )
                                    : body.scenario === "flow-extraction"
                                      ? extractionSampleTransport(
                                          body.extractionCase as ExtractionCase,
                                        )
                                      : body.scenario ===
                                          "flow-function-calling"
                                        ? functionSampleTransport(
                                            body.functionCase as FunctionCase,
                                          )
                                        : body.scenario === "flow-guardrails"
                                          ? guardrailsSampleTransport(
                                              body.guardrailsCase as GuardrailsCase,
                                            )
                                          : body.scenario ===
                                              "flow-consistency-choices"
                                            ? consistencySampleTransport(
                                                body.consistencyCase as ConsistencyCase,
                                              )
                                            : noulSample
                                              ? noulSample.fetch
                                              : body.scenario === "flow-memory"
                                                ? memorySampleTransport(
                                                    body.memoryCase as MemoryCase,
                                                  )
                                                : body.scenario ===
                                                    "flow-structure"
                                                  ? structureSampleTransport(
                                                      body.structureCase as StructureCase,
                                                    )
                                                  : body.scenario ===
                                                      "flow-hierarchy"
                                                    ? hierarchySampleTransport(
                                                        body.hierarchyCase as HierarchyCase,
                                                      )
                                                    : body.scenario ===
                                                        "flow-sde"
                                                      ? sdeSampleTransport(
                                                          body.sdeCase as SdeCase,
                                                        )
                                                      : body.scenario ===
                                                          "flow-rag"
                                                        ? ragSampleTransport(
                                                            body.ragCase as RagCase,
                                                          )
                                                        : body.scenario ===
                                                            "flow-skills"
                                                          ? body.mode === "live"
                                                            ? globalThis.fetch
                                                            : skillSampleTransport(
                                                                body.cookbookCase as keyof typeof skillCases,
                                                              )
                                                          : flowTransport(
                                                              body.scenario!,
                                                            ),
                  logLevel: "off",
                  retry: { maxRetries: 0 },
                  timeout: 120_000,
                },
                {
                  label:
                    body.scenario === "flow-parallel-questions"
                      ? parallelQuestionsFlow.definition.name
                      : body.scenario === "flow-twitch"
                        ? twitchFlow.definition.name
                        : body.scenario === "flow-entity"
                          ? entityFlow.definition.name
                          : body.scenario === "flow-citation"
                            ? citationFlow.definition.name
                            : body.scenario === "flow-confidence"
                              ? confidenceFlow.definition.name
                              : body.scenario === "flow-line-search"
                                ? lineSearchFlow.definition.name
                                : body.scenario === "flow-reranking"
                                  ? rerankingFlow.definition.name
                                  : body.scenario === "flow-date"
                                    ? dateFlow.definition.name
                                    : body.scenario === "flow-extraction"
                                      ? extractionFlow.definition.name
                                      : body.scenario ===
                                          "flow-function-calling"
                                        ? functionFlow.definition.name
                                        : body.scenario === "flow-guardrails"
                                          ? guardrailsFlow.definition.name
                                          : body.scenario ===
                                              "flow-consistency-choices"
                                            ? consistencyFlow.definition.name
                                            : noulSample
                                              ? noulFlowName
                                              : body.scenario === "flow-memory"
                                                ? memoryFlow.definition.name
                                                : body.scenario ===
                                                    "flow-structure"
                                                  ? structureFlow.definition
                                                      .name
                                                  : body.scenario ===
                                                      "flow-hierarchy"
                                                    ? hierarchyFlow.definition
                                                        .name
                                                    : body.scenario ===
                                                        "flow-sde"
                                                      ? sdeFlow.definition.name
                                                      : flow.definition.name,
                  source: body.mode === "live" ? "live" : "sample",
                },
              );
              const result =
                body.scenario === "flow-parallel-questions"
                  ? await parallelQuestionsFlow.run(
                      {
                        message: body.message,
                        caseId:
                          body.parallelQuestionsCase as ParallelQuestionsCase,
                      },
                      {
                        client,
                        devtools: inspector,
                        signal: controller.signal,
                      },
                    )
                  : body.scenario === "flow-twitch"
                    ? await twitchFlow.run(
                        {
                          message: body.message,
                          caseId: body.twitchCase as TwitchCase,
                        },
                        {
                          client,
                          devtools: inspector,
                          signal: controller.signal,
                        },
                      )
                    : body.scenario === "flow-entity"
                      ? await entityFlow.run(
                          {
                            message: body.message,
                            caseId: body.entityCase as EntityCase,
                          },
                          {
                            client,
                            devtools: inspector,
                            signal: controller.signal,
                          },
                        )
                      : body.scenario === "flow-citation"
                        ? await citationFlow.run(
                            {
                              message: body.message,
                              caseId: body.citationCase as CitationCase,
                            },
                            {
                              client,
                              devtools: inspector,
                              signal: controller.signal,
                            },
                          )
                        : body.scenario === "flow-confidence"
                          ? await confidenceFlow.run(
                              {
                                message: body.message,
                                caseId: body.confidenceCase as ConfidenceCase,
                              },
                              {
                                client,
                                devtools: inspector,
                                signal: controller.signal,
                              },
                            )
                          : body.scenario === "flow-line-search"
                            ? await lineSearchFlow.run(
                                {
                                  message: body.message,
                                  caseId: body.lineSearchCase as LineSearchCase,
                                },
                                {
                                  client,
                                  devtools: inspector,
                                  signal: controller.signal,
                                },
                              )
                            : body.scenario === "flow-reranking"
                              ? await rerankingFlow.run(
                                  {
                                    message: body.message,
                                    caseId: body.rerankingCase as RerankingCase,
                                  },
                                  {
                                    client,
                                    devtools: inspector,
                                    signal: controller.signal,
                                  },
                                )
                              : body.scenario === "flow-date"
                                ? await dateFlow.run(
                                    {
                                      message: body.message,
                                      caseId: body.dateCase as DateCase,
                                    },
                                    {
                                      client,
                                      devtools: inspector,
                                      signal: controller.signal,
                                    },
                                  )
                                : body.scenario === "flow-extraction"
                                  ? await extractionFlow.run(
                                      {
                                        message: body.message,
                                        caseId:
                                          body.extractionCase as ExtractionCase,
                                      },
                                      {
                                        client,
                                        devtools: inspector,
                                        signal: controller.signal,
                                      },
                                    )
                                  : body.scenario === "flow-function-calling"
                                    ? await functionFlow.run(
                                        {
                                          message: body.message,
                                          caseId:
                                            body.functionCase as FunctionCase,
                                        },
                                        {
                                          client,
                                          devtools: inspector,
                                          signal: controller.signal,
                                        },
                                      )
                                    : body.scenario === "flow-guardrails"
                                      ? await guardrailsFlow.run(
                                          {
                                            message: body.message,
                                            caseId:
                                              body.guardrailsCase as GuardrailsCase,
                                          },
                                          {
                                            client,
                                            devtools: inspector,
                                            signal: controller.signal,
                                          },
                                        )
                                      : body.scenario ===
                                          "flow-consistency-choices"
                                        ? await consistencyFlow.run(
                                            {
                                              message: body.message,
                                              caseId:
                                                body.consistencyCase as ConsistencyCase,
                                            },
                                            {
                                              client,
                                              devtools: inspector,
                                              signal: controller.signal,
                                            },
                                          )
                                        : noulSample
                                          ? await createNoulFlow(
                                              noulSample.returnedModels,
                                            ).run(
                                              {
                                                message: body.message,
                                                caseId:
                                                  body.noulCase as NoulCase,
                                              },
                                              {
                                                client,
                                                devtools: inspector,
                                                signal: controller.signal,
                                              },
                                            )
                                          : body.scenario === "flow-memory"
                                            ? await memoryFlow.run(
                                                {
                                                  message: body.message,
                                                  caseId:
                                                    body.memoryCase as MemoryCase,
                                                },
                                                {
                                                  client,
                                                  devtools: inspector,
                                                  signal: controller.signal,
                                                },
                                              )
                                            : body.scenario === "flow-structure"
                                              ? await structureFlow.run(
                                                  {
                                                    message: body.message,
                                                    caseId:
                                                      body.structureCase as StructureCase,
                                                  },
                                                  {
                                                    client,
                                                    devtools: inspector,
                                                    signal: controller.signal,
                                                  },
                                                )
                                              : body.scenario ===
                                                  "flow-hierarchy"
                                                ? await (
                                                    body.hierarchyCase ===
                                                    "limit"
                                                      ? hierarchyLimitFlow
                                                      : hierarchyFlow
                                                  ).run(
                                                    {
                                                      message: body.message,
                                                      caseId:
                                                        body.hierarchyCase as HierarchyCase,
                                                    },
                                                    {
                                                      client,
                                                      devtools: inspector,
                                                      signal: controller.signal,
                                                    },
                                                  )
                                                : body.scenario === "flow-sde"
                                                  ? await sdeFlow.run(
                                                      {
                                                        message: body.message,
                                                        caseId:
                                                          body.sdeCase as SdeCase,
                                                      },
                                                      {
                                                        client,
                                                        devtools: inspector,
                                                        signal:
                                                          controller.signal,
                                                      },
                                                    )
                                                  : await flow.run(
                                                      {
                                                        message: body.message,
                                                        caseId:
                                                          body.ragCase as RagCase,
                                                      },
                                                      {
                                                        client,
                                                        devtools: inspector,
                                                        signal:
                                                          controller.signal,
                                                      },
                                                    );
              send(res, 200, { ok: true, flow: result });
              return;
            }
            const request = await makeRequest(
              body.scenario! as Scenario,
              body.message,
              body.stress,
            );
            const client = inspector.createClient(
              {
                apiKey: body.mode === "live" ? apiKey : "sample-not-a-real-key",
                fetch:
                  body.mode === "live"
                    ? globalThis.fetch
                    : sampleTransport(
                        body.scenario! as Scenario,
                        body.profile,
                        body.stress,
                      ),
                logLevel: "off",
                retry: { maxRetries: body.scenario === "retry" ? 1 : 0 },
                defaultHeaders:
                  body.scenario === "image"
                    ? { "TypeSafe-Danger-Zone-Images": "true" }
                    : {},
              },
              {
                label:
                  body.scenario === "stress"
                    ? `Sandbox · ${body.stress!.choices} choices`
                    : body.scenario === "image"
                      ? "Locate a mug"
                      : body.scenario === "retry"
                        ? "Recover from rate limit"
                        : body.scenario === "error"
                          ? "Inspect a failed request"
                          : "Triage a support message",
                source: body.mode as "sample" | "live",
              },
            );
            const response = await client.systemOne(request, {
              signal: controller.signal,
            });
            send(res, 200, {
              ok: true,
              answerCount: Object.keys(response.answers).length,
              result: { model: response.model, answers: response.answers },
            });
          } catch (error) {
            send(res, 502, {
              error: error instanceof Error ? error.name : "RequestError",
              detail: "Inspect the captured request for details.",
              cancelled: controller.signal.aborted,
            });
          } finally {
            running.delete(id);
          }
        },
      );
    },
  };
}
