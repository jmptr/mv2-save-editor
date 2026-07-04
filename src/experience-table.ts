/* c8 ignore start */
// StandardExperienceTable — Level↔XP mapping, precomputed once at load (EDIT-04, SC-3).
//
// Ports the StandardExperienceTable algorithm 1:1 from docs/current-skill.md §"XP Table"
// (scaling=0.25, exponent_scaling=300.0, base=2^(1/7)). It maps skill Level → minimum XP
// (`xpForLevel`) and XP → derived Level (`levelForXp`). This is the single source of the
// XP↔Level coupling plan 03-02's patcher uses to keep a skill's XP and Level consistent on
// disk when the user edits one of them (EDIT-04).
//
// The table is built once at module load (buildXpTable(120)) and cached: XP_TABLE[L-1] is
// the minimum XP required for level L, with level 1 = 0 XP. The per-step Math.floor and the
// cumulative xpSum are LOAD-BEARING — a closed-form approximation drifts off the SC-locked
// milestones, so the loop is preserved verbatim from the reference algorithm.
//
// XP is a JS number (IEEE-754 double); the max table value ~104M ≪ 2^53, so NO BigInt is
// needed here (XP is a `kind:'double'` FieldEntry — see experience-parser.ts line 83).
//
// SC-locked milestones this reproduces exactly: L50=101,331, L99=13,034,427,
// L120=104,273,162 (L110=38,737,657 also matches). The docs L75=1,210,418-vs-printed
// discrepancy is a doc typo and is NEVER used to validate the table.
//
// Implements: EDIT-04 (auto-compute correct XP for a target Level and the inverse).
// Mitigates: T-03-01 (a wrong mapping silently corrupts every skill edit — the SC-locked
// milestone tests gate correctness before the patcher can rely on it).
/* c8 ignore end */

/** The default maximum skill level the table is built for (fixture caps are 120). */
const MAX_LEVEL = 120;

/**
 * Build the StandardExperienceTable for levels 1..maxLevel.
 *
 * Ports docs/current-skill.md §"XP Table" 1:1: base = 2^(1/7); accumulate
 * `xpSum += Math.floor(i + 300.0 * base^i)` for i=1..maxLevel-1, pushing
 * `Math.floor(0.25 * xpSum)` at each step. The table starts `[0]` (level 1 = 0 XP), so
 * `table[L-1]` is the minimum XP required for level L. The per-step Math.floor and the
 * cumulative xpSum are load-bearing — do NOT collapse into a closed form.
 *
 * @param maxLevel The highest level to compute (default 120). The returned array has
 *   `maxLevel` entries.
 * @returns number[] where index L-1 holds the minimum XP for level L.
 */
function buildXpTable(maxLevel = MAX_LEVEL): number[] {
  const base = Math.pow(2.0, 1.0 / 7.0); // 2^(1/7)
  let xpSum = 0.0;
  const table = [0.0]; // level 1 = 0 XP; table[L-1] = min XP for level L
  for (let i = 1; i < maxLevel; i++) {
    xpSum += Math.floor(i + 300.0 * Math.pow(base, i)); // exponent_scaling=300.0
    table.push(Math.floor(0.25 * xpSum)); // scaling=0.25
  }
  return table;
}

/** The precomputed 120-entry StandardExperienceTable (built once at module load). */
const XP_TABLE = buildXpTable(MAX_LEVEL);

/**
 * The minimum XP required to reach {@link level}.
 *
 * @param level A skill level in 1..120. `xpForLevel(1)` is 0 (level 1 costs 0 XP).
 * @returns The minimum XP for that level (`XP_TABLE[level-1]`).
 */
export function xpForLevel(level: number): number {
  return XP_TABLE[level - 1]!;
}

/**
 * The highest level whose minimum XP is `<= xp`, clamped to {@link levelCap}.
 *
 * The table is monotonic, so this walks up from level 1 and stops at the first level whose
 * minimum XP exceeds `xp` (or at `levelCap`). It is the cap-clamped inverse of
 * {@link xpForLevel}: `levelForXp(xpForLevel(L), cap) === Math.min(L, cap)`.
 *
 * @param xp The current XP.
 * @param levelCap The maximum level to return (a skill's LevelCap). The result never
 *   exceeds this even when `xp` is far above the cap's XP.
 * @returns The derived level in 1..levelCap.
 */
export function levelForXp(xp: number, levelCap: number): number {
  let lvl = 1;
  for (let L = 1; L <= levelCap && L <= XP_TABLE.length; L++) {
    if (XP_TABLE[L - 1]! <= xp) lvl = L;
    else break; // monotonic table — first miss ends the walk
  }
  return lvl;
}
