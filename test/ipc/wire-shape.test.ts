// wire-shape test — the SC-4 offset-free-bridge proof (T-4-03 / T-4-08).
//
// Proves that the ONLY change-report shape that crosses the renderer↔main bridge (the output of
// toWireReport) carries NO byte offset at any depth and serializes int64 currency as strings. It
// reuses the exact same recursive `assertNoOffsets` guard the parser tests use (never weakened), so
// the same SC-4 invariant that protects the ViewModel also protects the IPC change report.
//
// The internal ChangeReportRow DOES carry `offset` (patcher.ts) — this test constructs synthetic
// rows with offsets + bigint int64 values, maps them through toWireReport, and asserts the offset is
// gone, int64 old/new values are BigInt-round-tripping strings, and int32/double values stay numbers
// with width preserved (int32=4, double=8).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoOffsets } from '../helpers/no-offset-scan';
import { toWireReport } from '../../src/ipc/ipc-guards';
import { type ChangeReportRow } from '../../src/patcher';

// Synthetic internal rows: one int64 currency (bigint + offset), one int32 qty, one double xp.
const internalRows: ChangeReportRow[] = [
  { fieldKey: 'wallet.GoldPieces', oldValue: 5n, newValue: 9223372036854775807n, offset: 100, width: 8 },
  { fieldKey: 'bank.0.qty', oldValue: 7, newValue: 42, offset: 200, width: 4 },
  { fieldKey: 'skill.MelvorBase:Woodcutting.xp', oldValue: 1.5, newValue: 1234.5, offset: 300, width: 8 },
];

describe('SC-4: change report crossing the bridge carries no offset', () => {
  test('toWireReport output passes assertNoOffsets (no offset key at any depth)', () => {
    const wireRows = toWireReport(internalRows);
    assert.doesNotThrow(() => assertNoOffsets(wireRows));
  });

  test('no WireChangeRow has an offset property', () => {
    const wireRows = toWireReport(internalRows);
    for (const row of wireRows) {
      assert.ok(!('offset' in row), `wire row for ${row.fieldKey} must not carry offset`);
      assert.deepEqual(Object.keys(row).sort(), ['fieldKey', 'newValue', 'oldValue', 'width']);
    }
  });

  test('int64 old/new values are strings that BigInt-round-trip', () => {
    const [gp] = toWireReport(internalRows);
    assert.equal(typeof gp!.oldValue, 'string');
    assert.equal(typeof gp!.newValue, 'string');
    assert.equal(BigInt(gp!.oldValue as string), 5n);
    assert.equal(BigInt(gp!.newValue as string), 9223372036854775807n);
    assert.equal(gp!.width, 8);
  });

  test('int32 values stay numbers and width is preserved (4)', () => {
    const wireRows = toWireReport(internalRows);
    const qty = wireRows.find((r) => r.fieldKey === 'bank.0.qty')!;
    assert.equal(typeof qty.oldValue, 'number');
    assert.equal(typeof qty.newValue, 'number');
    assert.equal(qty.oldValue, 7);
    assert.equal(qty.newValue, 42);
    assert.equal(qty.width, 4);
  });

  test('double values stay numbers and width is preserved (8)', () => {
    const wireRows = toWireReport(internalRows);
    const xp = wireRows.find((r) => r.fieldKey === 'skill.MelvorBase:Woodcutting.xp')!;
    assert.equal(typeof xp.oldValue, 'number');
    assert.equal(typeof xp.newValue, 'number');
    assert.equal(xp.oldValue, 1.5);
    assert.equal(xp.newValue, 1234.5);
    assert.equal(xp.width, 8);
  });
});
