import {
  APIPromise,
  TypeSafeClient,
  type Questions,
  type RequestOptions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import type { FlowFixture } from "../src/flow-fixture.js";
import { stepContext } from "./step-context.js";
export type { FlowFixture } from "../src/flow-fixture.js";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function replayError(
  fixture: FlowFixture,
  questions: Questions,
): Error | undefined {
  const step = stepContext.getStore();
  if (!step)
    return new Error(
      "Replay client was called outside a flow run. Pass it as the client of flow.run().",
    );
  if (fixture.flow !== step.flow)
    return new Error(
      `Fixture was recorded from flow "${fixture.flow}" but is replaying flow "${step.flow}".`,
    );
  if (!Object.hasOwn(fixture.steps, step.stepId))
    return new Error(
      `Fixture has no response for step "${step.stepId}". The run took a route the fixture didn't record, or that step's capture was missing when the fixture was copied.`,
    );
  const response = fixture.steps[step.stepId];
  const answers =
    record(response) && record(response.answers) ? response.answers : {};
  const absent = Object.keys(record(questions) ? questions : {}).filter(
    (name) => !Object.hasOwn(answers, name),
  );
  if (absent.length)
    return new Error(
      `Fixture step "${step.stepId}" has no answer for ${absent.join(", ")}. Re-record the fixture.`,
    );
  return undefined;
}

// Checks run before the SDK so replay failures are not reported as connection errors.
class ReplayClient extends TypeSafeClient {
  constructor(private readonly fixture: FlowFixture) {
    super({
      apiKey: "replay-fixture",
      fetch: async () => {
        const step = stepContext.getStore();
        if (!step || !Object.hasOwn(fixture.steps, step.stepId))
          throw new Error("Replay fetch outside a checked flow step");
        return Response.json(fixture.steps[step.stepId]);
      },
      // Bodies are discarded, so skip compressing them.
      compression: false,
      logLevel: "off",
      retry: { maxRetries: 0 },
    });
  }
  override systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): APIPromise<SystemOneResult<Q>> {
    const error = replayError(this.fixture, request.questions);
    if (!error) return super.systemOne(request, options);
    // Same shape as the SDK's own early rejections.
    const response = Promise.reject(error);
    return new APIPromise(response, () => response);
  }
}

/** Answers each jev step from fixture.steps[stepId]; no network or API key. Use only as a flow run's client. */
export function replayClient(fixture: FlowFixture): TypeSafeClient {
  if (
    fixture?.version !== 1 ||
    typeof fixture.flow !== "string" ||
    !record(fixture.steps)
  )
    throw new TypeError(
      "Expected a version 1 flow fixture with flow and steps",
    );
  // A snapshot, so later edits to the caller's fixture don't change replay.
  return new ReplayClient(structuredClone(fixture));
}
