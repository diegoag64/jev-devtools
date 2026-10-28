import type { FlowRun } from "../src/flow-protocol.js";
import type { Json } from "../src/protocol.js";

/** Project already redacted captures. Execution and callback values stay intact. */
export class FlowCaptureBudget {
  private sizes = new WeakMap<object, number>();
  private children = new WeakMap<
    FlowRun,
    { available: number; used: number; run: FlowRun }
  >();

  constructor(private limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new RangeError(
        "flowCaptureBytes must be a nonnegative safe integer",
      );
  }

  apply(source: FlowRun): FlowRun {
    let remaining = this.limit;
    const admit = (value: Json) => {
      if (remaining === 0) return false;
      const object = value !== null && typeof value === "object";
      let bytes = object ? this.sizes.get(value) : undefined;
      if (bytes === undefined) {
        bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
        if (object) this.sizes.set(value, bytes);
      }
      if (bytes > remaining) return false;
      remaining -= bytes;
      return true;
    };
    const project = (source: FlowRun, child = false): FlowRun => {
      const available = remaining;
      const cached = child ? this.children.get(source) : undefined;
      if (cached?.available === available) {
        remaining -= cached.used;
        return cached.run;
      }
      const run: FlowRun = { ...source, steps: Object.create(null) };
      // Prefer the outcome, then authored step order and item index. Every
      // occurrence costs bytes, even when immutable captures share an object.
      if (source.value !== undefined && !admit(source.value)) {
        delete run.value;
        run.valueOmitted = "budget";
        run.captureWarnings = [
          ...new Set([
            ...(source.captureWarnings ?? []),
            "Outcome value omitted by flow capture byte budget.",
          ]),
        ];
      }
      for (const [id, sourceStep] of Object.entries(source.steps)) {
        const step = { ...sourceStep };
        if (sourceStep.data !== undefined && !admit(sourceStep.data)) {
          delete step.data;
          step.dataOmitted = "budget";
          step.captureWarnings = [
            ...new Set([
              ...(sourceStep.captureWarnings ?? []),
              "Step data omitted by flow capture byte budget.",
            ]),
          ];
        }
        if (sourceStep.collection)
          step.collection = {
            ...sourceStep.collection,
            items: sourceStep.collection.items.map((item) => ({
              ...item,
              ...(item.run ? { run: project(item.run, true) } : {}),
            })),
          };
        run.steps[id] = step;
      }
      if (child)
        this.children.set(source, {
          available,
          used: available - remaining,
          run,
        });
      return run;
    };
    return project(source);
  }
}
