import {
  memoryCases,
  type MemoryCase,
} from "../../../cookbooks/simple-memory/cases.js";
import { MemoryCookbookResult } from "./MemoryCookbookResult.js";
import { postPlayground, RunError } from "./playground-request.js";
import {
  structureCases,
  type StructureCase,
} from "../../../cookbooks/structure-recovery/cases.js";
import { StructureCookbookResult } from "./StructureCookbookResult.js";
import {
  hierarchyCases,
  type HierarchyCase,
} from "../../../cookbooks/hierarchical-classification/cases.js";
import { HierarchyCookbookResult } from "./HierarchyCookbookResult.js";
import {
  sdeCases,
  type SdeCase,
} from "../../../cookbooks/sde-cascade/cases.js";
import { SdeCookbookResult } from "./SdeCookbookResult.js";
import {
  ragCases,
  type RagCase,
} from "../../../cookbooks/rag-passages/cases.js";
import { RagCookbookResult } from "./RagCookbookResult.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { JevDevtools } from "jev-devtools";
import { ScenarioResult, type RunState } from "./ScenarioResult";
import { sampleProfiles, type SampleProfile } from "./sample-profiles";
import { Button } from "./components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "./components/ui/native-select";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { ArrowRight, LoaderCircle } from "lucide-react";
import "./controls.css";
import "./style.css";
import {
  skillCases,
  type SkillCase,
} from "../../../cookbooks/skill-suggestion/cases.js";
import { SkillCookbookResult } from "./SkillCookbookResult.js";

import { defaultStress, type StressOptions } from "./stress-options";
const sandbox = new URLSearchParams(location.search).has("sandbox");
const cookbookRequested =
  new URLSearchParams(location.search).get("cookbook") === "skill-suggestion";
const ragRequested =
  new URLSearchParams(location.search).get("cookbook") === "rag-passages";
const sdeRequested =
  new URLSearchParams(location.search).get("cookbook") === "sde-cascade";
const memoryRequested =
  new URLSearchParams(location.search).get("cookbook") === "simple-memory";
const structureRequested =
  new URLSearchParams(location.search).get("cookbook") === "structure-recovery";
const hierarchyRequested =
  new URLSearchParams(location.search).get("cookbook") ===
  "hierarchical-classification";
const savedSession = sessionStorage.getItem("jev-inspector-session");
const session = savedSession || crypto.randomUUID();
sessionStorage.setItem("jev-inspector-session", session);
const endpoint = (path: string) => `/__jev/${path}?session=${session}`;
const post = (
  path: string,
  body: unknown = {},
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
) => postPlayground(endpoint(path), body, options);
function App() {
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const [memoryCase, setMemoryCase] = useState<MemoryCase>("timeline");
  const [structureCase, setStructureCase] = useState<StructureCase>("memo");
  const [hierarchyCase, setHierarchyCase] = useState<HierarchyCase>("recovery");
  const [sdeCase, setSdeCase] = useState<SdeCase>("fabricated");
  const [ragCase, setRagCase] = useState<RagCase>("premise");
  const [cookbookCase, setCookbookCase] = useState<SkillCase>("deck");
  const [stress, setStress] = useState<StressOptions>(defaultStress);
  const [flowResult, setFlowResult] = useState<{
    outcome: string;
    value?: unknown;
  } | null>(null);
  const [profile, setProfile] = useState<SampleProfile>("billing");
  const [outcome, setOutcome] = useState<RunState>({
    id: "initial",
    status: "idle",
    scenario: "triage",
    mode: "sample",
    message: "",
  });
  const resetOutcome = () => {
    setFlowResult(null);
    setOutcome({ id: "idle", status: "idle", scenario, mode, message });
    setFeedback("Ready to capture a request.");
  };
  const [scenario, setScenario] = useState(
      memoryRequested
        ? "flow-memory"
        : structureRequested
          ? "flow-structure"
          : hierarchyRequested
            ? "flow-hierarchy"
            : sdeRequested
              ? "flow-sde"
              : ragRequested
                ? "flow-rag"
                : cookbookRequested
                  ? "flow-skills"
                  : sandbox
                    ? "stress"
                    : "triage",
    ),
    [mode, setMode] = useState("sample"),
    [live, setLive] = useState(false);
  const [message, setMessage] = useState(
    memoryRequested
      ? memoryCases.timeline.message
      : structureRequested
        ? structureCases.memo.message
        : hierarchyRequested
          ? hierarchyCases.recovery.message
          : sdeRequested
            ? sdeCases.fabricated.message
            : ragRequested
              ? ragCases.premise.message
              : cookbookRequested
                ? skillCases.deck.message
                : "I was charged twice and checkout is blocked. I need a human to help me today.",
  );
  const [runId, setRunId] = useState<string>(),
    [feedback, setFeedback] = useState("Ready to capture a request.");
  useEffect(() => {
    void fetch(endpoint("config"))
      .then((r) => r.json())
      .then((c) => setLive(c.liveAvailable))
      .catch(() => setFeedback("Cannot connect to the local recorder."));
  }, []);
  async function run() {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    activeRequest.current = controller;
    const started = performance.now();
    const captured = { id, scenario, mode, message };
    setFlowResult(null);
    setOutcome({ ...captured, status: "pending" });
    setRunId(id);
    setFeedback("Request running…");
    try {
      const data = await post(
        "run",
        {
          runId: id,
          scenario,
          mode,
          message,
          profile,
          stress,
          cookbookCase,
          ragCase,
          sdeCase,
          hierarchyCase,
          structureCase,
          memoryCase,
        },
        {
          signal: controller.signal,
          timeoutMs: mode === "sample" ? 30_000 : 300_000,
        },
      );
      if (data.flow) setFlowResult(data.flow);
      setOutcome({
        ...captured,
        status: "success",
        result: data.result,
        elapsedMs: Math.round(performance.now() - started),
      });
      setFeedback(
        data.flow
          ? "Flow complete. Explore Flows in Jev DevTools."
          : "Response ready. Explore the result below.",
      );
    } catch (e) {
      if (e instanceof RunError && e.timedOut)
        void post("cancel", { runId: id }, { timeoutMs: 5000 }).catch(() => {});
      setOutcome({
        ...captured,
        status: e instanceof RunError && e.cancelled ? "cancelled" : "error",
        error: e instanceof Error ? e.message : "Request failed",
      });
      setFeedback(
        e instanceof RunError && (e.timedOut || e.cancelled)
          ? e.message
          : `${e instanceof Error ? e.message : "Request failed"}. See the inspector for details.`,
      );
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      setRunId(undefined);
    }
  }
  return (
    <>
      <main className="playground dark">
        {scenario === "flow-memory" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · Simple memory
            </span>
            <h1>Remember facts. Route the next ticket.</h1>
            <p>
              Follow two customers over time. Route each ticket, decide whether
              it contains a lasting fact, then see how saved context changes
              later answers.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/basic_memory"
              target="_blank"
              rel="noreferrer"
            >
              Read the official Simple Memory cookbook ↗
            </a>
            <p className="sample-note">
              Official ticket examples · synthetic responses · fresh memory on
              every run. No API key or persistent storage.
            </p>
          </div>
        )}

        {scenario === "flow-structure" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · two-pass structure recovery
            </span>
            <h1>Recover structure. Keep the words.</h1>
            <p>
              Stitch broken sentences, classify the resulting blocks, then
              render headings, lists, code and callouts in ordinary code.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/autoformat"
              target="_blank"
              rel="noreferrer"
            >
              Read the official Structure Recovery cookbook ↗
            </a>
            <p className="sample-note">
              Authored short documents · synthetic Jev answers · no API key or
              text-generation calls.
            </p>
          </div>
        )}
        {scenario === "flow-hierarchy" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · bounded flow.loop()
            </span>
            <h1>Explore paths. Keep the strongest.</h1>
            <p>
              Compare beam search with greedy search. Each iteration assesses
              the frontier, scores every child path and carries the best
              candidates into the next depth.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/hierarchical_classification"
              target="_blank"
              rel="noreferrer"
            >
              Read the official hierarchical classification cookbook ↗
            </a>
            <p>
              Small authored taxonomy · synthetic probabilities · no API key or
              model calls. The limit case intentionally fails so you can inspect
              unfinished work.
            </p>
          </div>
        )}
        {scenario === "flow-sde" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · returning flow.if()
            </span>
            <h1>Verify, escalate, rejoin.</h1>
            <p>
              A cheap extractor proposes a record. Jev checks each field. If any
              field flag exceeds 70%, a stronger extractor takes over; both
              paths meet at the final comparison.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/sde_cascade"
              target="_blank"
              rel="noreferrer"
            >
              Read the official SDE cascade cookbook ↗
            </a>
            <p>
              Local adaptation · authored synthetic documents, extractor results
              and probabilities. No model calls or API key required.
            </p>
          </div>
        )}
        {scenario === "flow-rag" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · bounded flow.map()
            </span>
            <h1>RAG passage classification</h1>
            <p>
              Retrieve 12 passages, assess four at a time, separate evidence
              from conflicts, and build a cited answer preview.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/classifying_rag_passages"
              target="_blank"
              rel="noreferrer"
            >
              Official recipe ↗
            </a>
            <p className="sample-note">
              Official questions and routing policy, with fixed retrieval lists,
              synthetic Jev scores and a deterministic answer preview. No
              external API calls or reproduced evaluation claims.
            </p>
          </div>
        )}
        {scenario === "flow-skills" && (
          <div className="cookbook-intro">
            <span className="cookbook-eyebrow">
              TypeSafe cookbook · 182 skills
            </span>
            <h1>Skill suggestion</h1>
            <p>
              Rank the full roster, check whether a skill is needed, then
              re-assess the top three. Follow every function, request, and
              decision in Jev DevTools.
            </p>
            <a
              href="https://docs.typesafe.ai/cookbooks/skill_suggestion"
              target="_blank"
              rel="noreferrer"
            >
              Official recipe ↗
            </a>
            <p className="sample-note">
              {mode === "sample"
                ? "Official selection logic and roster, with authored synthetic responses. These are not the published measurements."
                : "Live Jev inference: one request, or two if the first gate passes. No agent or skill is executed."}
            </p>
          </div>
        )}
        {scenario.startsWith("flow-") &&
          ![
            "flow-skills",
            "flow-rag",
            "flow-sde",
            "flow-hierarchy",
            "flow-structure",
            "flow-memory",
          ].includes(scenario) && (
            <p>
              Sample-only flow. Run a sample, open Jev DevTools, and choose
              Flows. Select a node to inspect its captured request.
            </p>
          )}
        {flowResult &&
          ![
            "flow-skills",
            "flow-rag",
            "flow-sde",
            "flow-hierarchy",
            "flow-structure",
            "flow-memory",
          ].includes(scenario) && (
            <div role="status">
              <strong>Outcome: {flowResult.outcome}</strong>
              <pre>{JSON.stringify(flowResult.value, null, 2)}</pre>
            </div>
          )}
        <section className="run-form" aria-label="Request playground">
          <div className="form-row">
            <div className="form-field scenario-field">
              <Label htmlFor="scenario">Scenario</Label>
              <NativeSelect
                id="scenario"
                className="w-full"
                value={scenario}
                disabled={!!runId}
                onChange={(e) => {
                  setScenario(e.target.value);
                  resetOutcome();
                  if (e.target.value === "flow-memory")
                    setMessage(memoryCases[memoryCase].message);
                  if (e.target.value === "flow-structure")
                    setMessage(structureCases[structureCase].message);
                  if (e.target.value === "flow-hierarchy")
                    setMessage(hierarchyCases[hierarchyCase].message);
                  if (e.target.value === "flow-sde")
                    setMessage(sdeCases[sdeCase].message);
                  if (e.target.value === "flow-rag")
                    setMessage(ragCases[ragCase].message);
                  if (e.target.value === "flow-skills")
                    setMessage(skillCases[cookbookCase].message);
                  if (
                    ["retry", "error", "stress"].includes(e.target.value) ||
                    e.target.value.startsWith("flow-")
                  )
                    setMode("sample");
                }}
              >
                {Object.entries({
                  "flow-approve": "Flow · Approve",
                  "flow-functions":
                    "Flow · Functions + dynamic questions (synthetic)",
                  "flow-skills": "Cookbook · Skill suggestion (182 skills)",
                  "flow-hierarchy": "Cookbook · Hierarchical classification",
                  "flow-structure": "Cookbook · Structure recovery",
                  "flow-memory": "Cookbook · Simple memory",
                  "flow-sde": "Cookbook · SDE cascade",
                  "flow-rag": "Cookbook · RAG passages (12 items)",
                  "flow-manual": "Flow · Manual review",
                  "flow-other": "Flow · Other",
                  "flow-parallel": "Flow · Parallel checks + join",
                  "flow-error": "Flow · Failed review",
                  "flow-cancel": "Flow · Slow call (try Cancel)",
                }).map(([key, label]) => (
                  <NativeSelectOption key={key} value={key}>
                    {label}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value="stress">
                  Edge-case sandbox · Choice
                </NativeSelectOption>
                <NativeSelectOption value="triage">
                  Support triage · Choice, Score, Noul
                </NativeSelectOption>
                <NativeSelectOption value="image">
                  Locate a mug · Box, Noul
                </NativeSelectOption>
                <NativeSelectOption value="retry">
                  Rate limit → retry
                </NativeSelectOption>
                <NativeSelectOption value="error">
                  Failed request
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="form-field">
              <Label htmlFor="transport">Transport</Label>
              <NativeSelect
                id="transport"
                className="w-full"
                value={mode}
                disabled={!!runId}
                onChange={(e) => {
                  setMode(e.target.value);
                  if (scenario === "flow-skills" && e.target.value === "sample")
                    setMessage(skillCases[cookbookCase].message);
                  resetOutcome();
                }}
              >
                <NativeSelectOption value="sample">Sample</NativeSelectOption>
                <NativeSelectOption
                  value="live"
                  disabled={
                    !live ||
                    ["retry", "error", "stress"].includes(scenario) ||
                    (scenario.startsWith("flow-") && scenario !== "flow-skills")
                  }
                >
                  Live{!live ? " · no server key" : ""}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {scenario === "flow-memory" && (
              <div className="form-field">
                <Label htmlFor="memory-case">Memory sample</Label>
                <NativeSelect
                  id="memory-case"
                  value={memoryCase}
                  disabled={!!runId}
                  onChange={(event) => {
                    const next = event.target.value as MemoryCase;
                    setMemoryCase(next);
                    setMessage(memoryCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(memoryCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {scenario === "flow-structure" && (
              <div className="form-field">
                <Label htmlFor="structure-case">Structure sample</Label>
                <NativeSelect
                  id="structure-case"
                  value={structureCase}
                  disabled={!!runId}
                  onChange={(event) => {
                    const next = event.target.value as StructureCase;
                    setStructureCase(next);
                    setMessage(structureCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(structureCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {scenario === "flow-hierarchy" && (
              <div className="form-field">
                <Label htmlFor="hierarchy-case">Hierarchy sample</Label>
                <NativeSelect
                  id="hierarchy-case"
                  value={hierarchyCase}
                  disabled={!!runId}
                  onChange={(event) => {
                    const next = event.target.value as HierarchyCase;
                    setHierarchyCase(next);
                    setMessage(hierarchyCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(hierarchyCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {scenario === "flow-sde" && (
              <div className="form-field">
                <Label htmlFor="sde-case">SDE sample</Label>
                <NativeSelect
                  id="sde-case"
                  value={sdeCase}
                  disabled={!!runId}
                  onChange={(event) => {
                    const next = event.target.value as SdeCase;
                    setSdeCase(next);
                    setMessage(sdeCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(sdeCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {scenario === "flow-rag" && (
              <div className="form-field">
                <Label htmlFor="rag-case">RAG sample</Label>
                <NativeSelect
                  id="rag-case"
                  value={ragCase}
                  disabled={!!runId}
                  onChange={(event) => {
                    const next = event.target.value as RagCase;
                    setRagCase(next);
                    setMessage(ragCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(ragCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {scenario === "flow-skills" && (
              <div className="form-field">
                <Label htmlFor="cookbook-case">
                  {mode === "sample" ? "Synthetic case" : "Starting example"}
                </Label>
                <NativeSelect
                  id="cookbook-case"
                  value={cookbookCase}
                  disabled={!!runId}
                  onChange={(e) => {
                    const next = e.target.value as SkillCase;
                    setCookbookCase(next);
                    setMessage(skillCases[next].message);
                    resetOutcome();
                  }}
                >
                  {Object.entries(skillCases).map(([key, value]) => (
                    <NativeSelectOption key={key} value={key}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {mode === "sample" &&
              !scenario.startsWith("flow-") &&
              scenario !== "image" &&
              scenario !== "stress" && (
                <div className="form-field">
                  <Label htmlFor="sample-outcome">Sample outcome</Label>
                  <NativeSelect
                    id="sample-outcome"
                    className="w-full"
                    value={profile}
                    disabled={!!runId}
                    onChange={(e) => {
                      const key = e.target.value as SampleProfile;
                      setProfile(key);
                      setMessage(sampleProfiles[key].message);
                      resetOutcome();
                    }}
                  >
                    {Object.entries(sampleProfiles).map(([key, fixture]) => (
                      <NativeSelectOption key={key} value={key}>
                        {fixture.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
          </div>
          {scenario === "stress" && (
            <fieldset className="stress-controls">
              <legend>Choice sandbox · deterministic samples only</legend>
              <div className="form-row">
                <div className="form-field">
                  <Label htmlFor="stress-count">Categories</Label>
                  <NativeSelect
                    id="stress-count"
                    disabled={!!runId}
                    value={stress.choices}
                    onChange={(e) =>
                      setStress({
                        ...stress,
                        choices: Number(
                          e.target.value,
                        ) as StressOptions["choices"],
                      })
                    }
                  >
                    {[3, 6, 7, 150].map((n) => (
                      <NativeSelectOption key={n} value={n}>
                        {n} choices
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="form-field">
                  <Label htmlFor="stress-distribution">Distribution</Label>
                  <NativeSelect
                    id="stress-distribution"
                    disabled={!!runId}
                    value={stress.distribution}
                    onChange={(e) =>
                      setStress({
                        ...stress,
                        distribution: e.target
                          .value as StressOptions["distribution"],
                      })
                    }
                  >
                    <NativeSelectOption value="peaked">
                      One clear winner
                    </NativeSelectOption>
                    <NativeSelectOption value="tied">
                      All tied
                    </NativeSelectOption>
                    <NativeSelectOption value="zeros">
                      Zero-probability alternatives
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
              {(
                [
                  ["longLabels", "Long category labels"],
                  ["largeContext", "Large context (~80 KB)"],
                  [
                    "returnedLast",
                    "Return last category (synthetic edge case)",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label className="stress-toggle" key={key}>
                  <input
                    type="checkbox"
                    disabled={!!runId}
                    checked={stress[key]}
                    onChange={(e) =>
                      setStress({ ...stress, [key]: e.target.checked })
                    }
                  />{" "}
                  {label}
                </label>
              ))}
              <p>
                Run a sample, open Jev DevTools, and select the latest Sandbox
                request. Compare the compact Flow overview with All
                probabilities. The returned-choice toggle deliberately tests a
                response that may differ from the highest probability.
              </p>
            </fieldset>
          )}
          {scenario === "image" ? (
            <div className="image-input">
              <img
                src="/mug.png"
                alt="Sample illustration of a pink mug and a book"
              />
              <p>Find the mug and estimate whether a mug is present.</p>
            </div>
          ) : (
            <div className="form-field context-field">
              <Label htmlFor="context">Context</Label>
              <Textarea
                readOnly={
                  [
                    "flow-skills",
                    "flow-rag",
                    "flow-sde",
                    "flow-hierarchy",
                    "flow-structure",
                    "flow-memory",
                  ].includes(scenario) && mode === "sample"
                }
                id="context"
                className="min-h-32 resize-y"
                disabled={!!runId}
                maxLength={8000}
                value={message}
                aria-describedby="sample-note"
                onChange={(e) => {
                  setMessage(e.target.value);
                  resetOutcome();
                }}
              />
            </div>
          )}
          <div className="run-actions">
            <Button disabled={!!runId} onClick={() => void run()}>
              {runId ? (
                <>
                  <LoaderCircle
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />{" "}
                  Running…
                </>
              ) : (
                <>
                  {mode === "sample" ? "Run sample" : "Run live query"}
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
            {runId && (
              <Button
                variant="outline"
                onClick={() => {
                  activeRequest.current?.abort();
                  // Stop waiting locally even if the server cancellation cannot arrive.
                  void post("cancel", { runId }, { timeoutMs: 5000 }).catch(
                    () => {},
                  );
                }}
              >
                Cancel
              </Button>
            )}
            <span role="status">{feedback}</span>
          </div>
          <p id="sample-note" className="sample-note">
            {scenario === "flow-memory"
              ? "Run a sample, then open Jev DevTools → Flows. Choose a ticket iteration and View Flow to inspect routing, the memory gate and the selected save path."
              : scenario === "flow-structure"
                ? "Run a sample, then open Jev DevTools → Flows. Inspect both batched requests, the line-merge decisions and the deterministic Markdown renderer."
                : scenario === "flow-hierarchy"
                  ? "Run a sample, then open Flows. Choose an iteration in either Loop card and View Flow; expand a frontier item to inspect its request. The limit case returns FlowLoopLimitError on purpose."
                  : scenario === "flow-sde"
                    ? "Choose a fixed sample, run it, then open Jev DevTools → Flows to inspect the selected path and shared continuation."
                    : scenario === "flow-rag"
                      ? "Fixed sample retrieval and scores. Choose a case, run it, then inspect the collection in Flows. Cancel stops queued passages."
                      : scenario === "flow-skills" && mode === "sample"
                        ? "Fixed synthetic case. Switch to Live to try your own request; unmatched sample inputs are rejected."
                        : mode === "sample"
                          ? "Fixed sample answers, including when you edit context. No external API calls."
                          : "Live inference uses your server key and may incur API charges."}
          </p>
        </section>
        {scenario === "flow-memory" && flowResult && (
          <MemoryCookbookResult result={flowResult} />
        )}
        {scenario === "flow-structure" && flowResult && (
          <StructureCookbookResult result={flowResult} />
        )}
        {scenario === "flow-hierarchy" && flowResult && (
          <HierarchyCookbookResult result={flowResult} />
        )}
        {scenario === "flow-sde" && flowResult && (
          <SdeCookbookResult result={flowResult} />
        )}
        {scenario === "flow-rag" && flowResult && (
          <RagCookbookResult result={flowResult} />
        )}
        {scenario === "flow-skills" && flowResult && (
          <SkillCookbookResult result={flowResult} mode={mode} />
        )}
        {!scenario.startsWith("flow-") && outcome.status !== "idle" && (
          <ScenarioResult run={outcome} />
        )}
      </main>
      <JevDevtools
        enabled={import.meta.env.DEV}
        endpoint="/api/jev-devtools"
        defaultOpen={false}
      />
    </>
  );
}
export function mount() {
  createRoot(document.getElementById("root")!).render(<App />);
}
