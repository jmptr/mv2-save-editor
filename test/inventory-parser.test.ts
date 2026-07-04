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
import { findStacks, type InventoryStack } from '../src/inventory-parser';

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
