// Format helpers — level→XP live echo + reversible int64 grouping (D-03, D-06).
//
// owns: display-only formatting for the renderer. This is the ONE renderer module that
// VALUE-imports src/experience-table.ts (D-03 — pure Math, verified browser-safe); every other
// src/* import in the renderer is `import type` only, so bundling this file pulls no
// node:fs/node:zlib into the browser build. The level→XP echo is display-only — main owns the
// authoritative on-disk XP↔Level coupling. int64 thousands-grouping is STRING-based and reversible
// (never routed through Number — D-06 precision above 2^53).

import { xpForLevel } from '../../../src/experience-table'; // VALUE import — the single allowed exception (D-03)

/**
 * The grouped minimum-XP display for a skill level (EDIT-03 "Set by level" live echo). Reuses the
 * golden-tested `xpForLevel` (e.g. level 99 → `13,034,427`). Display-only; main recomputes + writes.
 *
 * @param level A skill level in 1..120.
 * @returns The thousands-grouped minimum XP for that level.
 */
export function levelToXpDisplay(level: number): string {
  return groupInt64(String(xpForLevel(level)));
}

/**
 * Insert thousands separators into a decimal digit string, purely as strings (D-06 — never
 * numeric coercion of the digits, which would lose precision above 2^53). Inverse of {@link ungroupInt64}.
 *
 * @param digits A run of decimal digits (e.g. `9223372036854775807`).
 * @returns The digits grouped in threes from the right (e.g. `9,223,372,036,854,775,807`).
 */
export function groupInt64(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Strip thousands separators back to the raw digit string, purely as strings (D-06). The exact
 * inverse of {@link groupInt64}: `ungroupInt64(groupInt64(d)) === d` for any digit string.
 *
 * @param grouped A grouped digit string (e.g. `9,223,372,036,854,775,807`).
 * @returns The raw digit run with separators removed.
 */
export function ungroupInt64(grouped: string): string {
  return grouped.replace(/,/g, '');
}
