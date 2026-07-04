// No-offset scanner — the SC-4 runtime guard.
//
// The ViewModel TYPE is offset-free by construction (src/view-model.ts has no `offset`
// key at any depth — SC-4 type-level). But a parser bug or an `as any` bypass could leak
// an offset into an actual view-model object. This function catches that at test time by
// recursively walking an object/array and throwing if any key named `offset` is present
// at any depth (SC-4 runtime guard).
//
// Used by Wave 3's save-parser test (the projection step) to assert the emitted view
// model is offset-free. Also used by test/field-table.test.ts to prove the guard itself
// works (passes on a clean ViewModel, throws on an offset-bearing object).

/**
 * Recursively scan a value and throw an Error if any object key named `offset` is present
 * at any depth. The SC-4 runtime guard — catches a byte-offset leak in an actual
 * view-model object even if the type system was bypassed.
 *
 * Walks plain objects (via `Object.keys`) and arrays (by index). The ViewModel is
 * JSON-serializable (D-02 — no Maps/Sets/Buffers), so this covers its shape exactly.
 * Primitives, null, and undefined are the base case (no keys to scan).
 *
 * @param value The value to scan (typically a ViewModel, but accepts `unknown`).
 * @param path Internal: the dotted path to `value` (for the error message). Defaults to
 *            `'root'`. Callers omit it.
 * @throws {Error} if an `offset` key is found, naming the path (e.g.
 *         "SC-4 violation: "offset" key at root.bankItems[0].offset").
 */
export function assertNoOffsets(value: unknown, path: string = 'root'): void {
  // Base case: primitives, null, undefined have no keys to scan.
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    // Walk array elements by index, recursing into each.
    for (let i = 0; i < value.length; i++) {
      assertNoOffsets(value[i], `${path}[${i}]`);
    }
    return;
  }

  // Plain object (record). Walk its own enumerable keys; if any is literally "offset",
  // throw naming the full path. Otherwise recurse into each value.
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key === 'offset') {
      throw new Error(`SC-4 violation: "offset" key at ${path}.${key}`);
    }
    assertNoOffsets(obj[key], `${path}.${key}`);
  }
}
