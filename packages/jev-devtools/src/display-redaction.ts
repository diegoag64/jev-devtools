import type { Trace } from "./protocol.js";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";

// Presentation only. Credential and application redaction happen in the server
// recorder; these personal fields are still present in the received captures.
const sensitiveKeys = new Set([
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "mobile",
  "mobilenumber",
  "address",
  "postaladdress",
  "streetaddress",
  "mailingaddress",
  "ssn",
  "socialsecuritynumber",
  "creditcard",
  "creditcardnumber",
  "cardnumber",
]);

function memoize<T extends object>(project: (value: T) => T) {
  const cache = new WeakMap<T, T>();
  return (value: T): T => {
    const cached = cache.get(value);
    if (cached) return cached;
    const result = project(value);
    cache.set(value, result);
    return result;
  };
}

// Map entries without interpreting their names. Preserve redacted/truncated
// scalar placeholders and retain identity when every value is unchanged.
function mapValues<T>(
  value: T,
  project: (item: unknown, key: string) => unknown,
): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const next = value.map((item, i) => project(item, String(i)));
    return next.every((item, i) => item === value[i]) ? value : (next as T);
  }
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const next = project(item, key);
    changed ||= next !== item;
    return [key, next];
  });
  return changed ? (Object.fromEntries(entries) as T) : value;
}

/** One projection cache per mounted inspector. Stream captures are immutable;
 * unchanged rows and nested runs retain identity across unrelated updates. */
export function createDisplayRedactor() {
  function fields<T>(
    value: T,
    structural: Record<string, (item: unknown) => unknown> = {},
  ): T {
    return mapValues(value, (item, key) =>
      Object.hasOwn(structural, key)
        ? structural[key](item)
        : sensitiveKeys.has(key.replace(/[-_]/g, "").toLowerCase())
          ? "[redacted]"
          : data(item),
    );
  }
  const objects = memoize<object>((value) => fields(value));
  function data<T>(value: T): T {
    return value && typeof value === "object" ? (objects(value) as T) : value;
  }
  const contents = (value: unknown) => mapValues(value, data);
  // SDK maps use arbitrary question IDs, category labels and asset references.
  // Mask their contents, not the entry itself because its name resembles PII.
  const question = (value: unknown) => fields(value, { criteria: contents });
  const answer = (value: unknown) =>
    fields(value, { probabilities: contents, legend: contents });
  const trace = memoize<Trace>((value) => {
    const request = fields(value.request, {
        questions: (items) => mapValues(items, question),
        assets: contents,
      }),
      result = fields(value.result, {
        answers: (items) => mapValues(items, answer),
      });
    return request === value.request && result === value.result
      ? value
      : { ...value, request, result };
  });
  const run: (value: FlowRun) => FlowRun = memoize<FlowRun>((value) => {
    let changed = false;
    // Step IDs are structural metadata, not personal-data field names.
    const steps = Object.fromEntries(
      Object.entries(value.steps).map(([id, step]) => {
        const captured = data(step.data);
        let collection = step.collection;
        if (collection) {
          const items = collection.items.map((item) => {
            const child = item.run && run(item.run);
            return child === item.run ? item : { ...item, run: child };
          });
          if (items.some((item, i) => item !== collection!.items[i]))
            collection = { ...collection, items };
        }
        const next =
          captured === step.data && collection === step.collection
            ? step
            : { ...step, data: captured, collection };
        changed ||= next !== step;
        return [id, next];
      }),
    );
    const output = data(value.value);
    return changed || output !== value.value
      ? { ...value, steps, value: output }
      : value;
  });
  const definition: (value: FlowDefinition) => FlowDefinition =
    memoize<FlowDefinition>((value) => {
      const nodes = value.nodes.map((node) => {
        const rule = data(node.conditionRule);
        const item = node.itemDefinition && definition(node.itemDefinition);
        return rule === node.conditionRule && item === node.itemDefinition
          ? node
          : { ...node, conditionRule: rule, itemDefinition: item };
      });
      return nodes.some((node, i) => node !== value.nodes[i])
        ? { ...value, nodes }
        : value;
    });
  return { trace, run, definition };
}
