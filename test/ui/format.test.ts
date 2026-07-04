// Format-helper test suite — level→XP echo + reversible int64 grouping (D-03/D-06).
//
// Proves electron/ui/lib/format.ts reuses the golden-tested experience-table for the live
// level→XP echo (levelToXpDisplay(99) shows the 13,034,427 milestone), and that int64
// thousands-grouping is STRING-based and reversible: ungroupInt64(groupInt64(d)) === d for a
// digit string well above 2^53 (never routed through Number — D-06 precision). Harness convention
// copied from test/experience-table.test.ts (node:test + node:assert/strict).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { levelToXpDisplay, groupInt64, ungroupInt64 } from '../../electron/ui/lib/format';

describe('levelToXpDisplay — reuses the golden experience-table (D-03)', () => {
  test('levelToXpDisplay(99) contains the digits of the 13,034,427 milestone', () => {
    const display = levelToXpDisplay(99);
    // Grouping-agnostic: strip any non-digits and compare the raw digit run.
    assert.equal(display.replace(/\D/g, ''), '13034427');
  });

  test('levelToXpDisplay(1) is 0 (level 1 costs 0 XP)', () => {
    assert.equal(levelToXpDisplay(1).replace(/\D/g, ''), '0');
  });
});

describe('groupInt64 / ungroupInt64 — string-based, reversible past 2^53 (D-06)', () => {
  test('round-trips a value above 2^53 unchanged (no Number precision loss)', () => {
    const d = '9223372036854775807'; // INT64_MAX, far above 2^53
    assert.equal(ungroupInt64(groupInt64(d)), d);
  });

  test('groupInt64 inserts thousands separators', () => {
    assert.equal(groupInt64('13034427'), '13,034,427');
  });

  test('round-trips a range of digit strings', () => {
    for (const d of ['0', '7', '999', '1000', '1000000', '9007199254740993']) {
      assert.equal(ungroupInt64(groupInt64(d)), d, `round-trip ${d}`);
    }
  });
});
