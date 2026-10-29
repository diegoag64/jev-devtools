import { types } from "node:util";

// A provenance preflight must not materialize every property descriptor. This
// cap covers the largest retained JSON map; larger snapshots stay uncertain.
const propertyLimit = 256;

/** Inspect before a snapshot can erase accessors, without reading their values.
 * Does not bound engine key enumeration or the snapshot's execution work. */
export function snapshotIsUncertain(value: object): boolean {
  if (types.isProxy(value)) return true;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    (array
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null) ||
    "toJSON" in value
  )
    return true;
  if (array) {
    if (value.length > propertyLimit) return true;
    for (let index = 0; index < value.length; index++) {
      const field = Object.getOwnPropertyDescriptor(value, String(index));
      if (!field || field.get || field.set) return true;
    }
  } else {
    let remaining = propertyLimit;
    for (const key in value) {
      if (--remaining < 0 || !Object.hasOwn(value, key)) return true;
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || field.get || field.set) return true;
    }
  }
  return false;
}

/** SDK preparation reads these named fields even when JSON copying omits them.
 * Presence/descriptor checks must not invoke the property or inspect its graph. */
export function hasOmittedSdkFields(
  value: object,
  keys: readonly string[],
): boolean {
  if (types.isProxy(value)) return true;
  return keys.some((key) => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field ? !field.enumerable : key in value;
  });
}
