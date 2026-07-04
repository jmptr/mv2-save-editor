/* c8 ignore start */
// ipc-guards — the renderer↔main TRUST BOUNDARY (SC-4, T-4-02 / T-4-03 / T-4-08).
//
// A pure module (NO electron import — unit-testable under `tsx --test`) that sits between the
// untrusted renderer `edits` payload and the trusted core (`patchSave`). It owns exactly two
// boundary concerns, nothing more:
//
//   1. SHAPE guard (T-4-02): assertEditsPayload rejects a malformed payload BEFORE the core runs —
//      non-array, non-object element, empty/non-string fieldKey, non-finite number newValue,
//      non-integer int64 string. It is SHAPE-only; the core (`patchSave` validatePlain / skill
//      validators) still owns ALL range/kind/readOnly validation (defense in depth, D-01). A bad
//      shape is caught here in a tested pure function, not in the thin electron wiring.
//
//   2. Wire contract (T-4-03 / T-4-08): offsets NEVER cross the bridge and int64 crosses as strings.
//      toEdits bridges an int64 newValue string→bigint (only when the resolved FieldEntry.kind is
//      int64); toWireReport strips `offset` from every change row and stringifies bigint int64
//      old/new values (matching the Summary.gp/slayerCoins string convention).
//
// Range/readOnly/kind semantics stay in patchSave (RESEARCH §Pattern 3, "Don't Hand-Roll"): this
// module adds zero deps and never re-implements the core validators.
//
// Mitigates: T-4-02 (Tampering — malformed edits payload), T-4-03 (Info Disclosure — offset leak),
// T-4-08 (Info Disclosure / precision — int64 as a JSON number).
/* c8 ignore end */

import { type Edit, type ChangeReportRow } from '../patcher';
import { type FieldTable } from '../field-table';

/**
 * An IPC payload failed the SHAPE guard (T-4-02). Thrown by {@link assertEditsPayload} BEFORE the
 * core runs — a distinct concern from the core's {@link import('../patcher').PatchError} range/kind
 * failures. Mirrors the patcher error convention (constructor sets `this.name`).
 */
export class IpcArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcArgError';
  }
  /* c8 ignore next */
}

/**
 * A single edit as it crosses the IPC bridge from the untrusted renderer. int64 currency arrives as
 * a decimal string (never a JSON number — no precision loss past 2^53, T-4-08); int32/double arrive
 * as numbers. {@link toEdits} bridges the string→bigint by the resolved field kind.
 */
export interface WireEdit {
  /** The FieldTable key to write (validated non-empty string). */
  fieldKey: string;
  /** The new value: a finite number, or an integer-form decimal string (int64). */
  newValue: string | number;
}

/**
 * One row of the IPC-facing change report — the ONLY change-report shape that crosses the bridge.
 * Structurally identical to {@link import('../patcher').ChangeReportRow} MINUS `offset` (T-4-03: the
 * byte offset never leaves main). int64 old/new values are decimal strings (T-4-08).
 */
export interface WireChangeRow {
  /** The FieldTable key written. */
  fieldKey: string;
  /** The value before the write (int64 → decimal string; int32/double → number). */
  oldValue: string | number;
  /** The value written (int64 → decimal string; int32/double → number). */
  newValue: string | number;
  /** The byte width written (int32=4, int64=8, double=8). NOT the offset. */
  width: number;
}

/**
 * SHAPE-guard the untrusted `edits` payload (T-4-02). Rejects, with {@link IpcArgError} naming the
 * offending index, anything that is not a well-formed edit array: a non-array; an element that is
 * not a plain object; an empty/non-string `fieldKey`; a `newValue` that is neither a finite number
 * nor an integer-form decimal string. Returns a typed {@link WireEdit}[] on success.
 *
 * SHAPE-only by design — range/kind/readOnly validation stays in {@link import('../patcher').patchSave}
 * (defense in depth, RESEARCH §Pattern 3). Accepts an empty array (a no-op batch is a valid shape).
 *
 * @param raw The untrusted value received over IPC.
 * @returns The validated wire edits.
 * @throws {IpcArgError} the payload is not a well-formed edits array.
 */
export function assertEditsPayload(raw: unknown): WireEdit[] {
  if (!Array.isArray(raw)) {
    throw new IpcArgError('edits must be an array');
  }
  return raw.map((e, i) => {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      throw new IpcArgError(`edits[${i}] must be an object`);
    }
    const { fieldKey, newValue } = e as Record<string, unknown>;
    if (typeof fieldKey !== 'string' || fieldKey.length === 0) {
      throw new IpcArgError(`edits[${i}].fieldKey must be a non-empty string`);
    }
    if (typeof newValue === 'number') {
      if (!Number.isFinite(newValue)) {
        throw new IpcArgError(`edits[${i}].newValue must be a finite number`);
      }
    } else if (typeof newValue === 'string') {
      if (!/^-?\d+$/.test(newValue)) {
        throw new IpcArgError(`edits[${i}].newValue must be an integer-form string (int64)`);
      }
    } else {
      throw new IpcArgError(`edits[${i}].newValue must be a number or an int64 string`);
    }
    return { fieldKey, newValue };
  });
}

/**
 * Bridge {@link WireEdit}[] into the core's {@link Edit}[] (T-4-08). For each wire edit, resolves the
 * key via `fieldTable.get` and converts a string `newValue` to a `bigint` ONLY when the resolved
 * entry kind is `int64`; otherwise the value passes through (a number stays a number; a string for a
 * non-int64 or unresolved key is coerced via `Number(...)` so the core validators can reject it).
 *
 * Deliberately does NOT throw on an unknown key or perform range checks — key resolution and range
 * validation remain in {@link import('../patcher').patchSave} (it surfaces `UnknownFieldError`). This
 * function only performs the int64 string→bigint bridge for keys it can resolve.
 *
 * @param wireEdits The shape-validated wire edits.
 * @param fieldTable The FieldTable from `parseSave` — used ONLY to resolve a key's kind.
 * @returns Core {@link Edit}[] with int64 values as bigint and int32/double as number.
 */
export function toEdits(wireEdits: WireEdit[], fieldTable: FieldTable): Edit[] {
  return wireEdits.map((we) => {
    const entry = fieldTable.get(we.fieldKey);
    let value: bigint | number;
    if (typeof we.newValue === 'string') {
      value = entry?.kind === 'int64' ? BigInt(we.newValue) : Number(we.newValue);
    } else {
      value = we.newValue;
    }
    return { fieldKey: we.fieldKey, newValue: value };
  });
}

/**
 * Sanitize the internal {@link ChangeReportRow}[] into the wire-safe {@link WireChangeRow}[] — the
 * only change-report shape that crosses the bridge. DROPS `offset` (T-4-03: no byte offset ever
 * leaves main) and converts a `bigint` int64 old/new value to a decimal string (T-4-08: never a raw
 * bigint — not JSON-serializable; never a JSON number — precision loss past 2^53). int32/double
 * values pass through as numbers; `width` is carried through.
 *
 * @param rows The internal change rows (each carrying an `offset`).
 * @returns Offset-free wire rows with int64 values as decimal strings.
 */
export function toWireReport(rows: ChangeReportRow[]): WireChangeRow[] {
  return rows.map((r) => ({
    fieldKey: r.fieldKey,
    oldValue: typeof r.oldValue === 'bigint' ? r.oldValue.toString() : r.oldValue,
    newValue: typeof r.newValue === 'bigint' ? r.newValue.toString() : r.newValue,
    width: r.width,
  }));
}
