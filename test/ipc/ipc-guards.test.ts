// ipc-guards test — the SC-4 trust-boundary proof (T-4-02 shape guard + T-4-08 int64 bridge).
//
// Proves the pure IPC boundary module: (1) assertEditsPayload rejects every malformed shape of an
// untrusted `edits` payload with IpcArgError BEFORE the core runs (non-array, non-object element,
// empty/non-string fieldKey, non-finite number, non-integer int64 string) and accepts a well-formed
// mixed batch; (2) toEdits bridges an int64 string→bigint ONLY when the resolved FieldEntry.kind is
// int64, leaving int32/double as numbers and NOT throwing on an unresolved key (the core surfaces
// UnknownFieldError). Range/kind/readOnly validation stays in patchSave — this module owns SHAPE only.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IpcArgError,
  assertEditsPayload,
  toEdits,
  type WireEdit,
} from '../../src/ipc/ipc-guards';
import { FieldTable, type FieldEntry } from '../../src/field-table';

// Build a minimal FieldTable with one entry of each writable kind so toEdits can resolve kinds.
function makeFieldTable(): FieldTable {
  const t = new FieldTable();
  const gp: FieldEntry = { key: 'wallet.GoldPieces', offset: 100, width: 8, kind: 'int64', value: 5n };
  const qty: FieldEntry = { key: 'bank.0.qty', offset: 200, width: 4, kind: 'int32', value: 7 };
  const xp: FieldEntry = { key: 'skill.MelvorBase:Woodcutting.xp', offset: 300, width: 8, kind: 'double', value: 1.5 };
  t.add(gp);
  t.add(qty);
  t.add(xp);
  return t;
}

describe('T-4-02 / SC-4: assertEditsPayload rejects malformed shapes before the core', () => {
  test('rejects a non-array payload with IpcArgError', () => {
    assert.throws(() => assertEditsPayload({ fieldKey: 'x', newValue: 1 }), IpcArgError);
    assert.throws(() => assertEditsPayload(null), IpcArgError);
    assert.throws(() => assertEditsPayload('nope'), IpcArgError);
  });

  test('rejects an element that is not an object, naming the index', () => {
    assert.throws(() => assertEditsPayload([null]), (e: unknown) => e instanceof IpcArgError && /\b0\b/.test((e as Error).message));
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: 1 }, 42]), (e: unknown) => e instanceof IpcArgError && /\b1\b/.test((e as Error).message));
    assert.throws(() => assertEditsPayload(['string-elem']), IpcArgError);
  });

  test('rejects an empty or non-string fieldKey, naming the index', () => {
    assert.throws(() => assertEditsPayload([{ fieldKey: '', newValue: 1 }]), (e: unknown) => e instanceof IpcArgError && /\b0\b/.test((e as Error).message));
    assert.throws(() => assertEditsPayload([{ fieldKey: 123, newValue: 1 }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ newValue: 1 }]), IpcArgError);
  });

  test('rejects a non-finite number newValue (NaN, Infinity)', () => {
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: NaN }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: Infinity }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: -Infinity }]), IpcArgError);
  });

  test('rejects a string newValue that is not an integer form', () => {
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: '1.5' }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: 'abc' }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: '' }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: '0x10' }]), IpcArgError);
  });

  test('rejects a newValue that is neither number nor string (boolean, object, null)', () => {
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: true }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: {} }]), IpcArgError);
    assert.throws(() => assertEditsPayload([{ fieldKey: 'a', newValue: null }]), IpcArgError);
  });

  test('accepts a well-formed mixed batch (numeric + integer-string) returning WireEdit[]', () => {
    const raw = [
      { fieldKey: 'bank.0.qty', newValue: 42 },
      { fieldKey: 'wallet.GoldPieces', newValue: '9223372036854775807' },
      { fieldKey: 'wallet.SlayerCoins', newValue: '-5' },
    ];
    const out: WireEdit[] = assertEditsPayload(raw);
    assert.deepEqual(out, [
      { fieldKey: 'bank.0.qty', newValue: 42 },
      { fieldKey: 'wallet.GoldPieces', newValue: '9223372036854775807' },
      { fieldKey: 'wallet.SlayerCoins', newValue: '-5' },
    ]);
  });

  test('accepts an empty array (a no-op batch is a valid shape)', () => {
    assert.deepEqual(assertEditsPayload([]), []);
  });

  test('IpcArgError has the correct name', () => {
    const e = new IpcArgError('boom');
    assert.equal(e.name, 'IpcArgError');
    assert.ok(e instanceof Error);
  });
});

describe('T-4-08 / SC-4: toEdits bridges int64 string→bigint by resolved kind', () => {
  test('int64 string newValue becomes a bigint Edit', () => {
    const t = makeFieldTable();
    const edits = toEdits([{ fieldKey: 'wallet.GoldPieces', newValue: '9223372036854775807' }], t);
    assert.equal(edits.length, 1);
    assert.equal(typeof edits[0]!.newValue, 'bigint');
    assert.equal(edits[0]!.newValue, 9223372036854775807n);
  });

  test('int32 number newValue stays a number', () => {
    const t = makeFieldTable();
    const edits = toEdits([{ fieldKey: 'bank.0.qty', newValue: 42 }], t);
    assert.equal(typeof edits[0]!.newValue, 'number');
    assert.equal(edits[0]!.newValue, 42);
  });

  test('double number newValue stays a number', () => {
    const t = makeFieldTable();
    const edits = toEdits([{ fieldKey: 'skill.MelvorBase:Woodcutting.xp', newValue: 1234.5 }], t);
    assert.equal(typeof edits[0]!.newValue, 'number');
    assert.equal(edits[0]!.newValue, 1234.5);
  });

  test('a string newValue for a non-int64 resolved key is coerced to a number (core validators reject if wrong)', () => {
    const t = makeFieldTable();
    const edits = toEdits([{ fieldKey: 'bank.0.qty', newValue: '99' }], t);
    assert.equal(typeof edits[0]!.newValue, 'number');
    assert.equal(edits[0]!.newValue, 99);
  });

  test('does NOT throw on an unresolved key — leaves resolution to patchSave (UnknownFieldError)', () => {
    const t = makeFieldTable();
    // Unknown key, string value → coerced to number (Number('123')); core surfaces UnknownFieldError later.
    const edits = toEdits([{ fieldKey: 'does.not.exist', newValue: '123' }], t);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]!.fieldKey, 'does.not.exist');
    assert.equal(typeof edits[0]!.newValue, 'number');
    assert.equal(edits[0]!.newValue, 123);
  });

  test('bridges a mixed batch preserving order and per-kind types', () => {
    const t = makeFieldTable();
    const edits = toEdits(
      [
        { fieldKey: 'bank.0.qty', newValue: 7 },
        { fieldKey: 'wallet.GoldPieces', newValue: '100' },
        { fieldKey: 'skill.MelvorBase:Woodcutting.xp', newValue: 2.5 },
      ],
      t,
    );
    assert.equal(edits[0]!.newValue, 7);
    assert.equal(typeof edits[0]!.newValue, 'number');
    assert.equal(edits[1]!.newValue, 100n);
    assert.equal(typeof edits[1]!.newValue, 'bigint');
    assert.equal(edits[2]!.newValue, 2.5);
    assert.equal(typeof edits[2]!.newValue, 'number');
  });
});
