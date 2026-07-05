// Inventory parser test suite — EXPLICIT structural tab-walk, phantom-free (RESEARCH
// §Pattern 3 superseded; see docs/bank-inventory-phantom-stacks.md).
//
// findStacks walks the Inventory component's tab list explicitly:
//   [int32 reserved][int32 tabCount] then tabCount tabs, each ending with an
//   [int32 stackCount] and exactly that many [int32 qty][u8 ph][u8 lk][string id] records.
// It STOPS after the last tab and never reads the trailing "Chests" registry — the source
// of the phantom stacks that corrupted the bank when edited (root cause, this session).
//
// Regression fixtures (this session's byte-exact decode):
//   - test-fixture.sav : 301 real stacks (296 tab0 + 5 tab1). The OLD marker-search returned
//     689 = 301 real + 388 phantom "Chests" registry ids (689 − 388 = 301, exact).
//   - MahoganyLog-103.sav : 330 stacks; includes the REAL MahoganyLog @944=103; EXCLUDES the
//     phantom @12548 whose edit reverted the whole bank in-game.
//   - save_35a…sav : 330 stacks (third save — header/tabCount triangulation).
//
// Fail-loud (PROJECT.md corruption invariant): a misaligned walk (placeholder/locked > 1,
// negative qty) or an out-of-region count throws ParseError/RangeError — the editor refuses
// a save it cannot decode cleanly rather than emitting a phantom or a bad write offset.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { ParseError } from '../src/field-table';
import { loadFixtureBuffer, loadFixtureFile, locateInventoryRegion } from './helpers/fixture';
import { findStacks, resolveOne, type InventoryStack } from '../src/inventory-parser';

// The committed test-fixture (2,284,747 bytes, version 20). Inventory region located via
// the structural spine (no hard-coded offsets — the walk derives them fresh).
const FIXTURE = loadFixtureBuffer();
const FIXTURE_REGION = locateInventoryRegion(FIXTURE);

// ---------------------------------------------------------------------------
// test-fixture Inventory — 301 real stacks across explicit tabs (phantom-free)
// ---------------------------------------------------------------------------

describe('findStacks — test-fixture explicit tab-walk recovers 301 real stacks (phantom-free)', () => {
  test('recovers exactly 301 stacks (NOT 689 — the trailing Chests registry is not scanned)', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    assert.equal(stacks.length, 301, '301 real stacks (296 tab0 + 5 tab1); 388 phantoms excluded');
  });

  test('each stack records qtyOffset, raw itemId, qty, placeholder, locked (D-01/D-02)', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    for (const s of stacks) {
      assert.equal(typeof s.qtyOffset, 'number', 'qtyOffset is a number (byte offset)');
      assert.ok(s.itemId.startsWith('MelvorBase:'), `itemId is namespaced: ${s.itemId}`);
      assert.equal(typeof s.qty, 'number', 'qty is an int32 number');
      assert.equal(typeof s.placeholder, 'boolean', 'placeholder is a boolean');
      assert.equal(typeof s.locked, 'boolean', 'locked is a boolean');
    }
  });

  test('NormalLog spot-check: qty 48652 @ qtyOffset 736, not placeholder/locked', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    const normalLog = stacks.find((s) => s.itemId === 'MelvorBase:NormalLog');
    assert.ok(normalLog, 'MelvorBase:NormalLog stack present');
    assert.equal(normalLog!.qtyOffset, 736, 'NormalLog qty offset (first stack of tab 0)');
    assert.equal(normalLog!.qty, 48652, 'NormalLog quantity matches the reference');
    assert.equal(normalLog!.placeholder, false, 'NormalLog is not a placeholder');
    assert.equal(normalLog!.locked, false, 'NormalLog is not locked');
  });

  test('stacks are keyed by DISTINCT qtyOffsets (301 unique offsets)', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    const distinct = new Set(stacks.map((s) => s.qtyOffset));
    assert.equal(distinct.size, stacks.length, 'every stack has a distinct qtyOffset');
  });

  test('every stack qtyOffset is within [invStart, invEnd) and every qty is a valid int32', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    for (const s of stacks) {
      assert.ok(
        s.qtyOffset >= FIXTURE_REGION.invStart && s.qtyOffset < FIXTURE_REGION.invEnd,
        `qtyOffset ${s.qtyOffset} within region`,
      );
      assert.ok(Number.isInteger(s.qty) && s.qty >= 0 && s.qty <= 2147483647, `qty in range: ${s.qty}`);
    }
  });

  test('no phantom stack lands in the trailing Chests registry (all offsets precede it)', () => {
    const stacks = findStacks(FIXTURE, FIXTURE_REGION.invStart, FIXTURE_REGION.invEnd);
    // The last real stack (tab 1) ends well before the "Chests" zone at ~9644. No recovered
    // stack may have an offset in the trailing registry [~9644, invEnd) — those are phantoms.
    const maxOffset = Math.max(...stacks.map((s) => s.qtyOffset));
    assert.ok(maxOffset < 9644, `highest stack offset ${maxOffset} precedes the Chests registry`);
  });
});

// ===========================================================================
// REGRESSION — MahoganyLog-103.sav : the phantom-stack corruption fixture
// ===========================================================================

describe('findStacks — MahoganyLog-103 regression (real @944 in, phantom @12548 out)', () => {
  const buf = loadFixtureFile('test/fixtures/MahoganyLog-103.sav');
  const region = locateInventoryRegion(buf);

  test('recovers 330 real stacks (323 tab0 + 7 tab1)', () => {
    const stacks = findStacks(buf, region.invStart, region.invEnd);
    assert.equal(stacks.length, 330, '330 real stacks across the two tabs');
  });

  test('includes the REAL MahoganyLog stack @944 = 103', () => {
    const stacks = findStacks(buf, region.invStart, region.invEnd);
    const mahog = stacks.filter((s) => s.itemId === 'MelvorBase:MahoganyLog');
    assert.equal(mahog.length, 1, 'MahoganyLog appears exactly once (no phantom duplicate)');
    assert.equal(mahog[0]!.qtyOffset, 944, 'real MahoganyLog stack is @944');
    assert.equal(mahog[0]!.qty, 103, 'real MahoganyLog qty is 103');
  });

  test('EXCLUDES the phantom stack @12548 (the corruption source in the trailing registry)', () => {
    const stacks = findStacks(buf, region.invStart, region.invEnd);
    assert.ok(!stacks.some((s) => s.qtyOffset === 12548), 'phantom @12548 is never recovered');
  });
});

// ===========================================================================
// REGRESSION — save_35a…sav : third save (tabCount / header triangulation)
// ===========================================================================

describe('findStacks — save_35a third-fixture triangulation', () => {
  const buf = loadFixtureFile('test/fixtures/save_35a73127-3468-47a8-b69d-a5952afaac1b.sav');
  const region = locateInventoryRegion(buf);

  test('recovers 331 stacks and no phantom @12548', () => {
    const stacks = findStacks(buf, region.invStart, region.invEnd);
    assert.equal(stacks.length, 331, '331 real stacks (324 tab0 + 7 tab1 — one more tab-0 stack than MahoganyLog-103)');
    assert.ok(!stacks.some((s) => s.qtyOffset === 12548), 'no phantom in the trailing registry');
  });
});

// ===========================================================================
// CRAFTED-BUFFER STRUCTURAL TESTS — tab-walk shape, bounds, and fail-loud
// ===========================================================================

// A single stack record: [int32 qty][u8 ph][u8 lk][7bit-len][utf8 id].
function stackBytes(qty: number, ph: number, lk: number, itemId: string): Buffer {
  const id = Buffer.from(itemId, 'utf8');
  const head = Buffer.alloc(6);
  head.writeInt32LE(qty, 0);
  head.writeUInt8(ph, 4);
  head.writeUInt8(lk, 5);
  return Buffer.concat([head, Buffer.from([id.length]), id]);
}

// Inventory header: [int32 reserved][int32 tabCount].
function invHeader(tabCount: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeInt32LE(0, 0);
  b.writeInt32LE(tabCount, 4);
  return b;
}

// Tab 0 (unnamed default): [int32 MAX][int32 0][int32 MAX][u16 1][int32 stackCount].
function tab0Header(stackCount: number): Buffer {
  const b = Buffer.alloc(3 * 4 + 2 + 4);
  b.writeInt32LE(2147483647, 0);
  b.writeInt32LE(0, 4);
  b.writeInt32LE(2147483647, 8);
  b.writeUInt16LE(1, 12);
  b.writeInt32LE(stackCount, 14);
  return b;
}

// Named tab: [string name][int32 0][int32 MAX][int32 0][int32 MAX][u16 1][int32 stackCount].
function namedTabHeader(name: string, stackCount: number): Buffer {
  const n = Buffer.from(name, 'utf8');
  const cfg = Buffer.alloc(4 * 4 + 2 + 4);
  cfg.writeInt32LE(0, 0);
  cfg.writeInt32LE(2147483647, 4);
  cfg.writeInt32LE(0, 8);
  cfg.writeInt32LE(2147483647, 12);
  cfg.writeUInt16LE(1, 16);
  cfg.writeInt32LE(stackCount, 18);
  return Buffer.concat([Buffer.from([n.length]), n, cfg]);
}

describe('findStacks — crafted tab-walk (shape + bounds + fail-loud)', () => {
  test('single unnamed tab (t===0 branch): reads exactly stackCount records', () => {
    const buf = Buffer.concat([
      invHeader(1),
      tab0Header(2),
      stackBytes(100, 0, 0, 'MelvorBase:TestItem'),
      stackBytes(5, 1, 0, 'MelvorBase:Placeholder'),
      // trailing non-stack bytes that MUST NOT be scanned:
      Buffer.from('06436865737473', 'hex'), // "Chests" registry start — never read
    ]);
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 2, 'exactly the tab-0 stackCount records');
    assert.equal(stacks[0]!.itemId, 'MelvorBase:TestItem');
    assert.equal(stacks[0]!.qty, 100);
    assert.equal(stacks[0]!.qtyOffset, 8 + 18, 'qtyOffset = header(8) + tab0Header(18)');
    assert.equal(stacks[1]!.placeholder, true, 'placeholder byte 1 → true');
    assert.equal(stacks[1]!.locked, false);
  });

  test('two tabs (t>0 branch): named tab is walked after the default tab', () => {
    const buf = Buffer.concat([
      invHeader(2),
      tab0Header(1),
      stackBytes(10, 0, 0, 'MelvorBase:A'),
      namedTabHeader('Tab 1', 1),
      stackBytes(20, 0, 1, 'MelvorBase:B'),
    ]);
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 2, 'one stack from each tab');
    assert.equal(stacks[0]!.itemId, 'MelvorBase:A');
    assert.equal(stacks[1]!.itemId, 'MelvorBase:B');
    assert.equal(stacks[1]!.locked, true, 'named-tab stack locked byte 1 → true');
  });

  test('a tab with zero stacks contributes nothing and the walk still stops cleanly', () => {
    const buf = Buffer.concat([invHeader(1), tab0Header(0)]);
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 0, 'empty tab → no stacks, no throw');
  });

  test('tabCount that overruns the region throws ParseError (anti-DoS bound)', () => {
    // tabCount = 1e9 but only 8 header bytes present → bound check rejects before looping.
    const buf = invHeader(1_000_000_000);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'giant tabCount rejected');
  });

  test('negative tabCount throws ParseError', () => {
    const buf = invHeader(-1);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'negative tabCount rejected');
  });

  test('stackCount that overruns the region throws ParseError (anti-DoS bound)', () => {
    const buf = Buffer.concat([invHeader(1), tab0Header(1_000_000_000)]);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'giant stackCount rejected');
  });

  test('negative stackCount throws ParseError', () => {
    const buf = Buffer.concat([invHeader(1), tab0Header(-5)]);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'negative stackCount rejected');
  });

  test('a malformed record (placeholder byte > 1) throws ParseError (misalignment tripwire)', () => {
    const buf = Buffer.concat([
      invHeader(1),
      tab0Header(1),
      stackBytes(10, 5, 0, 'MelvorBase:Bad'), // placeholder = 5 → not a boolean
    ]);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'placeholder > 1 rejected');
  });

  test('a malformed record (locked byte > 1) throws ParseError', () => {
    const buf = Buffer.concat([
      invHeader(1),
      tab0Header(1),
      stackBytes(10, 0, 9, 'MelvorBase:Bad'), // locked = 9 → not a boolean
    ]);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'locked > 1 rejected');
  });

  test('a malformed record (negative qty) throws ParseError', () => {
    const buf = Buffer.concat([
      invHeader(1),
      tab0Header(1),
      stackBytes(-1, 0, 0, 'MelvorBase:Bad'), // qty = -1
    ]);
    assert.throws(() => findStacks(buf, 0, buf.length), ParseError, 'negative qty rejected');
  });

  test('a stackCount whose records overrun invEnd throws (bounded reader, RangeError)', () => {
    // stackCount=1 passes the coarse bound but the single record is truncated past invEnd.
    const buf = Buffer.concat([invHeader(1), tab0Header(1), Buffer.from([10, 0, 0])]);
    assert.throws(() => findStacks(buf, 0, buf.length), 'truncated record read past region');
  });
});

// ===========================================================================
// resolveOne — D-03 ambiguity contract (hand-built stacks, no fixture phantoms)
// ===========================================================================

function mkStack(qtyOffset: number, itemId: string, qty: number): InventoryStack {
  return { qtyOffset, itemId, qty, placeholder: false, locked: false };
}

describe('resolveOne — D-03 ambiguity surfacing', () => {
  test('a logical field matching TWO validated offsets returns candidates (no auto-pick)', () => {
    // A real item appearing in two tabs → two distinct stacks. resolveOne surfaces BOTH.
    const stacks = [
      mkStack(100, 'MelvorBase:NormalLog', 5),
      mkStack(200, 'MelvorBase:NormalLog', 9),
      mkStack(300, 'MelvorBase:Flax', 1),
    ];
    const result = resolveOne(stacks, (s) => s.itemId === 'MelvorBase:NormalLog');
    assert.equal(result.kind, 'candidates', 'two matches → candidates (D-03)');
    if (result.kind !== 'candidates') return;
    assert.equal(result.candidates.length, 2, 'both stacks surfaced');
    for (const c of result.candidates) {
      assert.equal(typeof c.offset, 'number');
      assert.ok(c.evidence.includes('MelvorBase:NormalLog'), 'evidence names the item');
    }
  });

  test('a logical field matching exactly ONE offset is resolved', () => {
    const stacks = [mkStack(100, 'MelvorBase:NormalLog', 5), mkStack(300, 'MelvorBase:Flax', 1)];
    const result = resolveOne(stacks, (s) => s.itemId === 'MelvorBase:Flax');
    assert.equal(result.kind, 'resolved', 'one match → resolved');
    if (result.kind !== 'resolved') return;
    assert.equal(result.stack.itemId, 'MelvorBase:Flax');
  });

  test('a logical field matching ZERO offsets returns notFound (fail-loud-when-zero)', () => {
    const stacks = [mkStack(100, 'MelvorBase:NormalLog', 5)];
    const result = resolveOne(stacks, (s) => s.itemId === 'MelvorBase:Nonexistent');
    assert.equal(result.kind, 'notFound', 'zero matches → notFound');
  });
});
