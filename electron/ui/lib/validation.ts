// Client validation mirror — instant as-you-type UX errors (D-04, EDIT-01/02/03).
//
// owns: the client range mirror; authority stays in main's patchSave (this is UX-only, never a
// trust boundary). The bounds here are COPIED from src/patcher.ts (INT32_MAX, INT64_MAX, lower
// bound 0 — not INT64_MIN) and MUST stay in lockstep with it: main re-validates authoritatively,
// so a drift here only degrades UX, never correctness. int64 currency is handled as a decimal
// STRING via BigInt and is never coerced through Number (D-06 — precision above 2^53). Error
// strings are the UI-SPEC Copywriting Contract verbatim.

/** Inclusive upper bound for a signed 32-bit integer (bank stack qty) — mirrors src/patcher.ts. */
const INT32_MAX = 2_147_483_647;
/** Inclusive upper bound for a signed 64-bit integer (wallet currency) — mirrors src/patcher.ts. */
const INT64_MAX = 9_223_372_036_854_775_807n;

/**
 * Result of a client-side field validation. On success `value` is a `number` for int32/level/xp
 * and a decimal `string` for int64 (never a number — D-06). On failure `message` is UI-SPEC copy.
 */
export type FieldResult = { ok: true; value: string | number } | { ok: false; message: string };

/**
 * Validate a bank item quantity (int32, EDIT-02). Rejects non-integers, negatives and anything
 * above INT32_MAX; accepts 0..2_147_483_647 and returns the numeric value.
 */
export function validateInt32(raw: string): FieldResult {
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false, message: 'Enter a whole number.' };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > INT32_MAX) {
    return { ok: false, message: `Value must be between 0 and ${INT32_MAX}.` };
  }
  return { ok: true, value: n };
}

/**
 * Validate GP / Slayer Coins (int64, EDIT-01, D-06). Parses via BigInt — NEVER Number — rejects
 * non-digit input and anything outside 0n..INT64_MAX, and on success returns the trimmed decimal
 * STRING unchanged so a value above 2^53 round-trips byte-exactly to main.
 */
export function validateInt64(raw: string): FieldResult {
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false, message: 'Enter a whole number.' };
  const b = BigInt(s); // BigInt, never Number — precision above 2^53 (D-06)
  if (b < 0n || b > INT64_MAX) {
    return { ok: false, message: `Value must be between 0 and ${INT64_MAX}.` };
  }
  return { ok: true, value: s }; // stays a decimal string end-to-end
}

/**
 * Validate a skill level (int32, EDIT-03 set-by-level). Rejects non-integers and anything outside
 * 1..levelCap; the error copy embeds the skill's levelCap.
 */
export function validateLevel(raw: string, levelCap: number): FieldResult {
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return { ok: false, message: 'Enter a whole number.' };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > levelCap) {
    return { ok: false, message: `Level must be between 1 and ${levelCap}.` };
  }
  return { ok: true, value: n };
}

/**
 * Validate a skill XP value (double, EDIT-03 set-XP). Rejects empty input, non-finite values and
 * negatives; accepts any finite non-negative double.
 */
export function validateXp(raw: string): FieldResult {
  const s = raw.trim();
  const n = Number(s);
  if (s === '' || !Number.isFinite(n) || n < 0) {
    return { ok: false, message: `Value must be between 0 and ${Number.MAX_SAFE_INTEGER}.` };
  }
  return { ok: true, value: n };
}
