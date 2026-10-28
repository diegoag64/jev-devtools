import { Image } from "@typesafe-ai/sdk";

// Shared limits keep the detached callback view and stored projection bounded.
export const captureLimits = {
  depth: 12,
  entries: 150,
  choices: 256,
  budget: 96_000,
  imageBytes: 48_000,
  text: 16_000,
} as const;

export function captureEntryLimit(key: string | undefined) {
  return key === "criteria" || key === "probabilities"
    ? captureLimits.choices
    : captureLimits.entries;
}

type Projection = {
  value: object;
  omitted?: boolean;
  image?: () => { ref: string; bytes: number } | undefined;
};

/** Bounded detached callback values. Omission guards never expose the source. */
export function detachForRedaction(value: unknown, warnings: Set<string>) {
  const copies = new WeakMap<object, object>();
  const projections = new WeakMap<object, Projection>();
  const views: { proxy: object; target: object; incomplete: () => boolean }[] =
    [];
  let budget: number = captureLimits.budget;
  let accessedOmission = false;
  const deny = (): never => {
    accessedOmission = true;
    warnings.add("Capture policy accessed omitted data.");
    throw new Error("Capture policy accessed omitted data");
  };
  const guard = (
    target: object,
    omitted: (key: PropertyKey) => boolean,
    incomplete: () => boolean,
    projection: Projection,
  ) => {
    // Successful local writes/deletes are authoritative, including replacement
    // of an omitted property. Failed operations must retain its omission guard.
    const written = new Set<PropertyKey>();
    const check = (key: PropertyKey) => {
      if (!written.has(key) && omitted(key)) deny();
    };
    const proxy = new Proxy(target, {
      get(target, key, receiver) {
        check(key);
        return Reflect.get(target, key, receiver);
      },
      has(target, key) {
        check(key);
        return Reflect.has(target, key);
      },
      getOwnPropertyDescriptor(target, key) {
        check(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys(target) {
        if (incomplete()) deny();
        return Reflect.ownKeys(target);
      },
      set(target, key, value) {
        const succeeded = Reflect.set(target, key, value);
        if (succeeded) written.add(key);
        return succeeded;
      },
      defineProperty(target, key, descriptor) {
        const succeeded = Reflect.defineProperty(target, key, descriptor);
        if (succeeded) written.add(key);
        return succeeded;
      },
      deleteProperty(target, key) {
        const succeeded = Reflect.deleteProperty(target, key);
        if (succeeded) written.add(key);
        return succeeded;
      },
    });
    projections.set(proxy, projection);
    views.push({ proxy, target, incomplete });
    return proxy;
  };
  const copy = (input: unknown, depth: number, key?: string): unknown => {
    // Count every visited field, including primitives. Strings are immutable
    // and need no copy/text scan; storage applies its separate text budget.
    budget -= 8 + (key?.length ?? 0);
    if (depth > captureLimits.depth || budget <= 0) {
      warnings.add("Capture size/depth limit reached.");
      const target = Array.isArray(input) ? new Array(input.length) : {};
      // Do not memoize a cutoff: the source may later occur at a usable path.
      return guard(
        target,
        () => true,
        () => true,
        { value: target, omitted: true },
      );
    }
    if (input === null || typeof input !== "object") {
      if (typeof input === "function")
        throw new TypeError("Uncloneable capture");
      return input;
    }
    const previous = copies.get(input);
    if (previous) return previous;
    if (input instanceof Image) {
      const ref = String(input);
      const bytes =
        input.data instanceof Blob ? input.data.size : input.data.byteLength;
      const omitted =
        input.data instanceof Uint8Array &&
        (bytes >= captureLimits.imageBytes || bytes > budget);
      const data = omitted
        ? new Uint8Array(1)
        : input.data instanceof Blob
          ? input.data.slice()
          : Uint8Array.from(input.data);
      if (input.data instanceof Uint8Array && !omitted) budget -= bytes;
      const target = new Image(data);
      target.toString = () => ref;
      target.toJSON = () => ref;
      if (omitted)
        warnings.add(
          "Image preview omitted (Blob, unsupported format, or size limit).",
        );
      const placeholder = target.data;
      const unavailable = () => omitted && target.data === placeholder;
      const detached = guard(
        target,
        (key) => key === "data" && unavailable(),
        unavailable,
        {
          value: target,
          image: () => (unavailable() ? { ref, bytes } : undefined),
        },
      );
      copies.set(input, detached);
      return detached;
    }
    // Supported SDK content is JSON plus Image/TextWithAssets. Native container
    // internals cannot be copied by enumerating bounded content fields.
    if (
      input instanceof Date ||
      input instanceof RegExp ||
      input instanceof Map ||
      input instanceof Set ||
      input instanceof ArrayBuffer ||
      ArrayBuffer.isView(input) ||
      input instanceof Blob
    )
      throw new TypeError("Uncloneable capture");
    const array = Array.isArray(input);
    const target = array
      ? new Array(input.length)
      : Object.create(Object.getPrototypeOf(input));
    const retained = new Set<PropertyKey>(array ? ["length"] : []);
    const blocked = new Set<PropertyKey>();
    let incomplete = false;
    const detached = guard(
      target,
      (key) =>
        blocked.has(key) || (!retained.has(key) && Object.hasOwn(input, key)),
      () => incomplete || blocked.size > 0,
      { value: target },
    );
    copies.set(input, detached);
    const add = (key: string) => {
      retained.add(key);
      const cutoff =
        depth + 1 > captureLimits.depth || budget - (8 + key.length) <= 0;
      // Do not invoke a getter for content that this copy will omit.
      const value = copy(
        cutoff ? undefined : Reflect.get(input, key),
        depth + 1,
        key,
      );
      if (value && typeof value === "object" && projections.get(value)?.omitted)
        blocked.add(key);
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    };
    let count = 0;
    // Do not evaluate every getter with Object.entries before slicing. Sparse
    // arrays keep their length and actual keys without walking every hole.
    for (const child in input) {
      if (!Object.hasOwn(input, child)) continue;
      if (count++ >= (array ? captureLimits.entries : captureEntryLimit(key))) {
        incomplete = true;
        break;
      }
      add(child);
    }
    if (incomplete || (array && input.length > captureLimits.entries))
      warnings.add("Long collection truncated in capture.");
    return detached;
  };
  const copied = copy(value, 0);
  // Complete subtrees remain ordinary cloneable objects. Only a value with
  // omitted members needs a guard. Resolve aliases/cycles in one bounded pass.
  const complete = new WeakMap<object, object>();
  for (const view of views)
    if (!view.incomplete()) complete.set(view.proxy, view.target);
  const resolve = (value: unknown) =>
    value && typeof value === "object" ? (complete.get(value) ?? value) : value;
  for (const { target } of views) {
    for (const key of Object.keys(target)) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
      if ("value" in descriptor)
        Object.defineProperty(target, key, {
          ...descriptor,
          value: resolve(descriptor.value),
        });
    }
  }
  return {
    value: resolve(copied),
    assertPolicyAccess() {
      // A policy catching the guard exception still cannot certify a value
      // after consulting unavailable content.
      if (accessedOmission)
        throw new Error("Capture policy accessed omitted data");
    },
    projection: (value: unknown) =>
      value && typeof value === "object" ? projections.get(value) : undefined,
  };
}
