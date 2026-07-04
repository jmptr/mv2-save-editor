// StandardExperienceTable test suite — Level↔XP mapping, SC-locked milestones (EDIT-04, SC-3).
//
// Proves src/experience-table.ts reproduces the StandardExperienceTable from
// docs/current-skill.md §"XP Table" (scaling=0.25, exponent_scaling=300.0, base=2^(1/7)).
// The table maps skill Level → minimum XP (`xpForLevel`) and XP → derived Level
// (`levelForXp`); it is the single source of the XP↔Level coupling plan 03-02's patcher
// uses to keep a skill's XP and Level consistent on disk (EDIT-04).
//
// Correctness is gated by the SC-3-locked milestones ONLY:
//   L50=101,331   L99=13,034,427   L120=104,273,162   (L110=38,737,657 also matches)
// The docs table lists L75=3,576,425, but that is a doc typo — the reference algorithm
// yields 1,210,418, so L75 is NEVER used as a fixture (RESEARCH §Pitfall 1).
//
// Implements: EDIT-04 (StandardExperienceTable XP↔Level mapping), D-04 (c8 gate — 100%
// lines+branches on src/experience-table.ts). Mitigates: T-03-01 (a wrong mapping silently
// corrupts every skill edit downstream — the milestone tests gate correctness before the
// patcher can rely on it).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, levelForXp } from '../src/experience-table';

// SC-locked milestone fixtures — the ONLY values that gate correctness (RESEARCH §Pitfall 1).
// NEVER fixture level 75: the docs/current-skill.md L75 entry is a typo (the reference
// algorithm yields 1,210,418, not the value the table prints), so L75 is deliberately
// omitted. L110 also matches and is included as an extra anchor.
const MILESTONES: Array<[number, number]> = [
  [50, 101_331],
  [99, 13_034_427],
  [110, 38_737_657],
  [120, 104_273_162],
];

const MAX_LEVEL = 120;

// ---------------------------------------------------------------------------
// xpForLevel — SC-locked milestones + base case (EDIT-04, SC-3)
// ---------------------------------------------------------------------------

describe('xpForLevel — SC-locked milestones reproduce the spec exactly (EDIT-04, SC-3)', () => {
  for (const [level, xp] of MILESTONES) {
    test(`xpForLevel(${level}) === ${xp}`, () => {
      assert.equal(xpForLevel(level), xp, `L${level} milestone`);
    });
  }

  test('base case: xpForLevel(1) === 0 (level 1 costs 0 XP)', () => {
    assert.equal(xpForLevel(1), 0);
  });
});

// ---------------------------------------------------------------------------
// Monotonicity — the table is strictly increasing across L=1..120
// ---------------------------------------------------------------------------

describe('xpForLevel — strictly increasing across L=1..120', () => {
  test('xpForLevel(L) < xpForLevel(L+1) for every 1<=L<120', () => {
    for (let L = 1; L < MAX_LEVEL; L++) {
      assert.ok(
        xpForLevel(L) < xpForLevel(L + 1),
        `monotonic: xpForLevel(${L})=${xpForLevel(L)} < xpForLevel(${L + 1})=${xpForLevel(L + 1)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// levelForXp — monotonic, cap-clamped inverse of xpForLevel
// ---------------------------------------------------------------------------

describe('levelForXp — monotonic cap-clamped inverse of xpForLevel', () => {
  test('inverse round-trip: levelForXp(xpForLevel(L), 120) === L for every 1<=L<=120', () => {
    for (let L = 1; L <= MAX_LEVEL; L++) {
      assert.equal(
        levelForXp(xpForLevel(L), MAX_LEVEL),
        L,
        `round-trip L${L}`,
      );
    }
  });

  test('derives the highest level whose min XP <= the given XP (L50 boundary)', () => {
    // Exactly xpForLevel(50) → level 50; one XP below → level 49.
    assert.equal(levelForXp(xpForLevel(50), MAX_LEVEL), 50, 'exact L50 boundary → 50');
    assert.equal(levelForXp(xpForLevel(50) - 1, MAX_LEVEL), 49, 'one below L50 → 49');
  });

  test('clamp-to-cap: a huge XP never exceeds the cap (cap=10 → 10)', () => {
    assert.equal(levelForXp(Number.MAX_SAFE_INTEGER, 10), 10, 'clamped to cap 10');
    assert.equal(levelForXp(xpForLevel(120), 10), 10, 'over-cap XP clamps to cap 10');
  });

  test('an XP below level 2 stays at level 1 (floor)', () => {
    assert.equal(levelForXp(0, MAX_LEVEL), 1, 'xp 0 → level 1');
    assert.equal(levelForXp(xpForLevel(2) - 1, MAX_LEVEL), 1, 'just below L2 → level 1');
  });
});
