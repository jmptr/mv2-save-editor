// Client validation-mirror test suite — bounds mirror src/patcher.ts (D-04, EDIT-01/02/03).
//
// Proves electron/ui/lib/validation.ts accepts/rejects at EXACTLY the patcher's bounds
// (INT32_MAX = 2_147_483_647, INT64_MAX = 9_223_372_036_854_775_807n, lower bound 0), that the
// int64 path stays a decimal string (BigInt only, never Number — D-06 precision above 2^53), and
// that the inline error copy matches the UI-SPEC Copywriting Contract verbatim. This mirror is a
// UX-only convenience; main's patchSave stays the authority (never a trust boundary).
//
// Harness convention copied from test/experience-table.test.ts (node:test + node:assert/strict).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInt32,
  validateInt64,
  validateLevel,
  validateXp,
} from '../../electron/ui/lib/validation';

const INT32_MAX = 2_147_483_647;
const INT64_MAX = '9223372036854775807';

// ---------------------------------------------------------------------------
// validateInt32 — boundary accept 0 / INT32_MAX; reject -1 / INT32_MAX+1 / "1.5"
// ---------------------------------------------------------------------------

describe('validateInt32 — mirrors patcher int32 bounds 0..2_147_483_647 (EDIT-02)', () => {
  test('accepts the lower boundary 0', () => {
    assert.deepEqual(validateInt32('0'), { ok: true, value: 0 });
  });

  test('accepts the upper boundary 2_147_483_647', () => {
    assert.deepEqual(validateInt32(String(INT32_MAX)), { ok: true, value: INT32_MAX });
  });

  test('rejects -1 (below range) with the between-copy', () => {
    const r = validateInt32('-1');
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, `Value must be between 0 and ${INT32_MAX}.`);
  });

  test('rejects 2_147_483_648 (one past the max)', () => {
    const r = validateInt32(String(INT32_MAX + 1));
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, `Value must be between 0 and ${INT32_MAX}.`);
  });

  test('rejects "1.5" (non-integer) with the whole-number copy', () => {
    const r = validateInt32('1.5');
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, 'Enter a whole number.');
  });
});

// ---------------------------------------------------------------------------
// validateInt64 — BigInt-only; > 2^53 round-trips unchanged as a string (D-06)
// ---------------------------------------------------------------------------

describe('validateInt64 — decimal string via BigInt, never Number (EDIT-01, D-06)', () => {
  test('accepts a value above 2^53 and returns it as the unchanged string', () => {
    // 9_007_199_254_740_993 = 2^53 + 1 — loses precision if routed through a JS number.
    const big = '9007199254740993';
    const r = validateInt64(big);
    assert.deepEqual(r, { ok: true, value: big });
  });

  test('accepts the upper boundary INT64_MAX unchanged', () => {
    assert.deepEqual(validateInt64(INT64_MAX), { ok: true, value: INT64_MAX });
  });

  test('rejects a value one past INT64_MAX', () => {
    const r = validateInt64('9223372036854775808');
    assert.equal(r.ok, false);
    assert.equal(
      (r as { ok: false; message: string }).message,
      `Value must be between 0 and ${INT64_MAX}.`,
    );
  });

  test('rejects a non-digit string with the whole-number copy', () => {
    const r = validateInt64('12a3');
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, 'Enter a whole number.');
  });
});

// ---------------------------------------------------------------------------
// validateLevel — 1..levelCap; error embeds the levelCap (EDIT-03 set-by-level)
// ---------------------------------------------------------------------------

describe('validateLevel — 1..levelCap with the levelCap embedded in the copy (EDIT-03)', () => {
  test('accepts a level within 1..levelCap', () => {
    assert.deepEqual(validateLevel('99', 120), { ok: true, value: 99 });
  });

  test('rejects level 0 (below 1) with the levelCap-embedded message', () => {
    const r = validateLevel('0', 99);
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, 'Level must be between 1 and 99.');
  });

  test('rejects levelCap+1 with the levelCap-embedded message', () => {
    const r = validateLevel('121', 120);
    assert.equal(r.ok, false);
    assert.equal((r as { ok: false; message: string }).message, 'Level must be between 1 and 120.');
  });
});

// ---------------------------------------------------------------------------
// validateXp — finite non-negative double; rejects "" and negatives (EDIT-03 set-XP)
// ---------------------------------------------------------------------------

describe('validateXp — finite non-negative double (EDIT-03 set-XP)', () => {
  test('accepts a large finite double', () => {
    assert.deepEqual(validateXp('104273162'), { ok: true, value: 104_273_162 });
  });

  test('rejects the empty string', () => {
    const r = validateXp('');
    assert.equal(r.ok, false);
  });

  test('rejects a negative value', () => {
    const r = validateXp('-1');
    assert.equal(r.ok, false);
  });
});
