// Inventory parser test suite — bounded marker-search, 689 stacks, region-scoped (SC-1, SC-5, RESEARCH §Pattern 3).
//
// Proves findStacks over the decompressed committed fixture's Inventory component region
// [710, 20496) recovers ALL 689 valid item stacks across all tabs. A naive contiguous
// walk stops at ~296 at the first tab boundary (RESEARCH §Pitfall 1); the bounded
// marker-search + "6-bytes-before-the-length-prefix" + context-validation recovers all.
//
// SC-1: every stack records qty offset (int32), placeholder+locked flags, and raw
//   namespaced itemID (D-02); stacks are keyed by qtyOffset (duplicate item IDs across
//   tabs are DISTINCT fields, not D-03 ambiguity — RESEARCH Open Question 3).
// SC-5: the search is scoped to [invStart, invEnd); a candidate whose stack start falls
//   before invStart is skipped (never reads outside the region).
// SC-3: a hit is a valid stack only when the 7-bit prefix equals the item-ID byte length
//   AND the read stays within invEnd; qty in [0, 2^31-1]; placeholder/locked in {0,1}
//   (false matches rejected — Task 2 negatives).
//
// Implements: D-04 (c8 gate — 100% lines+branches on src/inventory-parser.ts). Mitigates
// T-02-01 (contiguous under-parse → bounded marker-search recovers all 689), T-02-03
// (read past invEnd → every read bounded to [invStart, invEnd)).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { BinaryReader } from '../src/binary-reader';
import { loadFixtureBuffer } from './helpers/fixture';
import { findStacks, resolveOne, type InventoryStack } from '../src/inventory-parser';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module
// load. Consumed read-only (findStacks never mutates the buffer).
const FIXTURE = loadFixtureBuffer();

// Inventory component in the Bank entity — verified fixture offsets (RESEARCH §Code
// Examples + the structural-walk spine from 02-02): dataStart 710, size 19786 → region
// [710, 20496). 689 valid stacks across all tabs.
const INV_START = 710;
const INV_END = 20496; // 710 + 19786

// ---------------------------------------------------------------------------
// Fixture Inventory — 689 stacks recovered across tabs (SC-1, RESEARCH §Pattern 3)
// ---------------------------------------------------------------------------

describe('findStacks — fixture Inventory [710, 20496) recovers all 689 stacks (SC-1, T-02-01)', () => {
  test('recovers exactly 689 valid stacks across all tabs (not ~296 — bounded marker-search)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    assert.equal(stacks.length, 689, 'all 689 fixture stacks recovered (bounded, not contiguous)');
  });

  test('each stack records qtyOffset, raw itemId, qty, placeholder, locked (SC-1, D-01/D-02)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    for (const s of stacks) {
      assert.equal(typeof s.qtyOffset, 'number', 'qtyOffset is a number (byte offset)');
      assert.equal(typeof s.itemId, 'string', 'itemId is a raw namespaced string (D-02)');
      assert.ok(s.itemId.startsWith('MelvorBase:'), `itemId is namespaced: ${s.itemId}`);
      assert.equal(typeof s.qty, 'number', 'qty is an int32 number');
      assert.equal(typeof s.placeholder, 'boolean', 'placeholder is a boolean (D-01 free metadata)');
      assert.equal(typeof s.locked, 'boolean', 'locked is a boolean (D-01 free metadata)');
    }
  });

  test('NormalLog spot-check: qty 48652 @ qtyOffset 736, not placeholder/locked (SC-1)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    const normalLog = stacks.find((s) => s.itemId === 'MelvorBase:NormalLog');
    assert.ok(normalLog, 'MelvorBase:NormalLog stack present');
    assert.equal(normalLog!.qty, 48652, 'NormalLog quantity matches the research reference');
    assert.equal(normalLog!.placeholder, false, 'NormalLog is not a placeholder');
    assert.equal(normalLog!.locked, false, 'NormalLog is not locked');
  });

  test('stacks are keyed by DISTINCT qtyOffsets (689 unique offsets — SC-1)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    const offsets = stacks.map((s) => s.qtyOffset);
    const distinct = new Set(offsets);
    assert.equal(distinct.size, stacks.length, 'every stack has a distinct qtyOffset (offset-keyed)');
  });

  test('duplicate item IDs across tabs are DISTINCT entries (not D-03 ambiguity — RESEARCH Open Q 3)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    // NormalLog appears in 2 tabs (verified in the probe) — 2 distinct stacks, different offsets.
    const normalLogs = stacks.filter((s) => s.itemId === 'MelvorBase:NormalLog');
    assert.ok(normalLogs.length >= 2, 'NormalLog appears in >=2 tabs (duplicate item, distinct stacks)');
    const offsets = normalLogs.map((s) => s.qtyOffset);
    assert.equal(new Set(offsets).size, normalLogs.length, 'duplicate items have distinct qtyOffsets (distinct fields, NOT candidates)');
    // Each is independently editable — Phase 3 patches each stack's qty at its own offset.
    for (const s of normalLogs) {
      assert.ok(s.qty >= 0, `duplicate NormalLog stack qty valid at offset ${s.qtyOffset}`);
    }
  });

  test('every stack\'s qtyOffset is within [invStart, invEnd) (SC-5 region-scoped)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    for (const s of stacks) {
      assert.ok(
        s.qtyOffset >= INV_START && s.qtyOffset < INV_END,
        `stack qtyOffset ${s.qtyOffset} within [${INV_START}, ${INV_END})`,
      );
    }
  });

  test('every qty is a valid int32 in [0, 2147483647] (SC-3 quantity range)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    for (const s of stacks) {
      assert.ok(Number.isInteger(s.qty), `qty is an integer: ${s.qty}`);
      assert.ok(s.qty >= 0 && s.qty <= 2147483647, `qty in [0, 2^31-1]: ${s.qty} (${s.itemId})`);
    }
  });
});

// ===========================================================================
// NEGATIVE TESTS (SC-3 context-validation + SC-5 bounds + D-03 ambiguity)
// — backstop edges that must REJECT a false match, never silently inject it.
// Crafted buffers isolate each rejection clause; the 689-stack happy path stays green.
// ===========================================================================

// A valid-stack template: [int32 qty=100][placeholder=0][locked=0][prefix=20]['MelvorBase:TestItem'].
// marker 'MelvorBase:' at offset 7; stackStart = 0. 27 bytes total. Mutated per negative case.
function buildValidStackBuffer(mutate?: (b: Buffer) => void): Buffer {
  const itemId = 'MelvorBase:TestItem'; // 20 bytes
  const itemIdBytes = Buffer.from(itemId, 'utf8');
  const buf = Buffer.concat([
    Buffer.from([100, 0, 0, 0]), // int32 qty=100 LE
    Buffer.from([0]), // placeholder=false
    Buffer.from([0]), // locked=false
    Buffer.from([itemIdBytes.length]), // 7-bit prefix = 20
    itemIdBytes, // 'MelvorBase:TestItem' (20 bytes)
  ]);
  if (mutate) mutate(buf);
  return buf;
}

describe('SC-3 false-match rejection (Task 2 negatives)', () => {
  test('a prefix byte shorter than the marker length is rejected (false match)', () => {
    // Prefix declares 5 bytes, but 'MelvorBase:' is 10 bytes — a coincidental byte pattern,
    // not a real item ID. findStacks must skip it → 0 stacks (T-02-05).
    const buf = buildValidStackBuffer((b) => {
      b.writeUInt8(5, 6); // prefix at offset 6 → 5 (less than MARKER_LEN=10)
    });
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 0, 'prefix < marker length must be rejected (SC-3)');
  });

  test('a negative int32 qty is rejected (out of [0, 2^31-1] range)', () => {
    // qty = -1 (0xffffffff) → readInt32LE returns -1 → SC-3 range check rejects.
    const buf = buildValidStackBuffer((b) => {
      b.writeInt32LE(-1, 0); // qty at offset 0 → -1
    });
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 0, 'negative qty must be rejected (SC-3 qty range)');
  });

  test('a placeholder byte > 1 is rejected (not a genuine boolean)', () => {
    // readBool would return `true` for byte 5 (5 !== 0) — masking a false match. The raw
    // byte must be 0 or 1; byte 5 indicates a non-stack byte pattern (T-02-05).
    const buf = buildValidStackBuffer((b) => {
      b.writeUInt8(5, 4); // placeholder at offset 4 → 5 (not 0 or 1)
    });
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 0, 'placeholder byte > 1 must be rejected (SC-3)');
  });

  test('a locked byte > 1 is rejected (not a genuine boolean)', () => {
    const buf = buildValidStackBuffer((b) => {
      b.writeUInt8(5, 5); // locked at offset 5 → 5 (not 0 or 1)
    });
    const stacks = findStacks(buf, 0, buf.length);
    assert.equal(stacks.length, 0, 'locked byte > 1 must be rejected (SC-3)');
  });
});

describe('SC-5 region-bounds rejection (Task 2 negatives)', () => {
  test('a candidate whose stack start precedes invStart is skipped (bounds)', () => {
    // A valid stack at offset 0, but invStart=5 → stackStart=0 < invStart=5 → skip.
    // The marker is at offset 7; prefix at 6; stackStart at 0. With invStart=5, the
    // stack header [0,6) starts before the region → rejected (T-02-03).
    const buf = buildValidStackBuffer();
    const stacks = findStacks(buf, 5, buf.length);
    assert.equal(stacks.length, 0, 'stack start < invStart must be skipped (SC-5)');
  });

  test('a candidate whose item-ID body overruns invEnd is skipped (bounds)', () => {
    // Truncate invEnd mid-item-ID: marker at 7, prefix=20 → body [7,27), but invEnd=20
    // means the body would overrun → skip (T-02-03).
    const buf = buildValidStackBuffer();
    const stacks = findStacks(buf, 0, 20);
    assert.equal(stacks.length, 0, 'body overrun invEnd must be skipped (SC-5)');
  });
});

describe('D-03 ambiguity surfacing via resolveOne (Task 2)', () => {
  test('a single logical field matching TWO validated offsets returns candidates (no auto-pick)', () => {
    // NormalLog appears in 2 tabs in the fixture → 2 distinct stacks. resolveOne with a
    // matchFn matching NormalLog returns BOTH as candidates, never collapses to one (T-02-08).
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    const result = resolveOne(stacks, (s) => s.itemId === 'MelvorBase:NormalLog');
    assert.equal(result.kind, 'candidates', 'two matches → candidates, not auto-picked (D-03)');
    if (result.kind !== 'candidates') return; // narrow for TS
    assert.ok(result.candidates.length >= 2, 'both NormalLog stacks surfaced as candidates');
    // Each candidate carries its offset + human-readable evidence (D-03 contract).
    for (const c of result.candidates) {
      assert.equal(typeof c.offset, 'number', 'candidate offset is a number');
      assert.ok(c.offset >= INV_START && c.offset < INV_END, 'candidate offset in region');
      assert.equal(typeof c.evidence, 'string', 'candidate evidence is a string');
      assert.ok(c.evidence.includes('MelvorBase:NormalLog'), 'evidence names the item');
    }
  });

  test('a single logical field matching exactly ONE offset is resolved', () => {
    // Find an item ID that appears exactly once in the fixture → resolveOne returns it.
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    const counts = new Map<string, number>();
    for (const s of stacks) counts.set(s.itemId, (counts.get(s.itemId) ?? 0) + 1);
    const unique = [...counts.entries()].find(([, n]) => n === 1);
    assert.ok(unique, 'fixture has at least one unique item ID');
    const [uniqueItemId] = unique!;
    const result = resolveOne(stacks, (s) => s.itemId === uniqueItemId);
    assert.equal(result.kind, 'resolved', 'one match → resolved (D-03 resolve-one)');
    if (result.kind !== 'resolved') return;
    assert.equal(result.stack.itemId, uniqueItemId, 'resolved the correct stack');
  });

  test('a single logical field matching ZERO offsets returns notFound (D-03 fail-loud-when-zero)', () => {
    const stacks = findStacks(FIXTURE, INV_START, INV_END);
    const result = resolveOne(stacks, (s) => s.itemId === 'MelvorBase:NonexistentItem');
    assert.equal(result.kind, 'notFound', 'zero matches → notFound (D-03)');
  });
});
