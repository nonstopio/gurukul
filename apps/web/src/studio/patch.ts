/**
 * A copy of `obj` with `changes` applied. A change whose value is `undefined` removes the key, so
 * an optional field that is cleared leaves the document (Firestore rejects `undefined` values and
 * the course schema's optional fields are absent, not empty).
 */
export function patch<T extends object>(obj: T, changes: { [K in keyof T]?: T[K] | undefined }): T {
  const merged: Record<string, unknown> = { ...obj, ...changes };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as T;
}
