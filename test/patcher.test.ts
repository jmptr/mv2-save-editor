// Patcher test suite — same-width in-place patch engine (SC-1..SC-4, SAFE-01, EDIT-04, D-01..D-04).
//
// Proves patchSave over the decompressed committed fixture:
//   SC-1  every field written at its declared width; out.length === input.length; input never mutated (D-04).
//   SC-2  every out-of-range / readOnly / unknown / conflicting edit REJECTED before any byte is written,
//         with ALL violations collected (SAFE-01, D-01) — fail-loud, never clamp.
//   SC-3  skill.<id>.level=L writes Level=L AND XP=xpForLevel(L); skill.<id>.xp=X writes XP=X AND
//         Level=levelForXp(X,cap); LevelCap is never written (EDIT-04, D-02).
//   SC-4  re-parse + whole-buffer diff proves only intended [offset,offset+width) ranges changed (D-03),
//         and a codec round-trip (compress→decompress→parseSave) reads the edited value back.
//
// Analogs: test/wallet-parser.test.ts (committed-fixture consumption + assert.throws instanceof
// predicates) and test/helpers/fixture.ts (the cached-decompress harness). Field keys are derived
// from parseSave(FIXTURE) — a real wallet key, a real bank.inventory.<itemId>@<offset> qty key, and a
// real skill.<id> whose levelCap is read from the FieldTable (RED before ../src/patcher exists).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { loadFixtureBuffer } from './helpers/fixture';
import { parseSave } from '../src/save-parser';
import { compress, decompress } from '../src/codec';
import { xpForLevel, levelForXp } from '../src/experience-table';
import {
  patchSave,
  PatchError,
  ValidationError,
  ReadOnlyFieldError,
  UnknownFieldError,
  ConflictingEditError,
  UnintendedChangeError,
  type Edit,
} from '../src/patcher';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module load.
const FIXTURE = loadFixtureBuffer();
// A pristine byte snapshot taken once — the non-mutation (D-04) assertions compare FIXTURE against
// this after each patchSave call (the shared cached buffer must never change).
const FIXTURE_SNAPSHOT = Buffer.from(FIXTURE);

// Parse once to source real field keys (SC-4: offsets live ONLY in the FieldTable).
const { fieldTable: FT } = parseSave(FIXTURE);

// A real int64 wallet key (authoritative currency write target, string-keyed public contract).
const GP_KEY = 'wallet.GoldPieces';
// A real int32 bank-inventory qty key, verified against the committed fixture (itemId@qtyOffset).
// Pinned like wallet-parser.test.ts pins WALLET_DATA_START; the guard below fails loud if the
// fixture ever drifts so the suite can never silently test a stale key.
const BANK_QTY_KEY = 'bank.inventory.MelvorBase:NormalLog@736';

// A real skill whose current level is below its cap (room to move the level up or down). Derived
// from the ViewModel so the suite is not brittle to skill ordering.
const { viewModel: VM } = parseSave(FIXTURE);
const SKILL = VM.skills.find((s) => s.level < s.levelCap && s.levelCap >= 2);
assert.ok(SKILL, 'fixture has a skill with level < levelCap');
const SKILL_ID = SKILL!.id;
const CAP = SKILL!.levelCap;
const LEVEL_KEY = `skill.${SKILL_ID}.level`;
const XP_KEY = `skill.${SKILL_ID}.xp`;
const CAP_KEY = `skill.${SKILL_ID}.levelCap`;

// Fixture-drift guards — every derived key must resolve in the FieldTable (fail loud otherwise).
assert.ok(FT.get(GP_KEY), `${GP_KEY} resolves in the FieldTable`);
assert.ok(FT.get(BANK_QTY_KEY), `${BANK_QTY_KEY} resolves in the FieldTable (fixture drift?)`);
assert.ok(FT.get(LEVEL_KEY), `${LEVEL_KEY} resolves`);
assert.ok(FT.get(XP_KEY), `${XP_KEY} resolves`);
assert.equal(FT.get(CAP_KEY)!.readOnly, true, `${CAP_KEY} is readOnly (never a write target)`);

/** Fresh FieldTable per test (patchSave never mutates it, but keep tests independent). */
function ft() {
  return parseSave(FIXTURE).fieldTable;
}

// ---------------------------------------------------------------------------
// SC-1 — declared-width writes, length-neutral, input never mutated (D-04)
// ---------------------------------------------------------------------------

describe('patchSave — SC-1 width/length + D-04 non-mutation', () => {
  test('int64 wallet.GoldPieces: same length, buffer changed, 8-byte write', () => {
    const { buffer: out, changeReport } = patchSave(FIXTURE, ft(), [
      { fieldKey: GP_KEY, newValue: 12345n },
    ]);
    assert.equal(out.length, FIXTURE.length, 'output length equals input length (SC-1)');
    assert.ok(!out.equals(FIXTURE), 'a change happened');
    const row = changeReport.find((r) => r.fieldKey === GP_KEY);
    assert.ok(row, 'GP change row present');
    assert.equal(row!.width, 8, 'int64 write is 8 bytes');
    assert.equal(row!.newValue, 12345n);
    assert.ok(FIXTURE.equals(FIXTURE_SNAPSHOT), 'input buffer never mutated (D-04)');
  });

  test('int32 bank qty: same length, buffer changed, 4-byte write', () => {
    const { buffer: out, changeReport } = patchSave(FIXTURE, ft(), [
      { fieldKey: BANK_QTY_KEY, newValue: 777 },
    ]);
    assert.equal(out.length, FIXTURE.length);
    assert.ok(!out.equals(FIXTURE));
    const row = changeReport.find((r) => r.fieldKey === BANK_QTY_KEY);
    assert.ok(row);
    assert.equal(row!.width, 4, 'int32 write is 4 bytes');
    assert.equal(row!.newValue, 777);
    assert.ok(FIXTURE.equals(FIXTURE_SNAPSHOT), 'input never mutated (D-04)');
  });

  test('double skill XP: same length, buffer changed, 8-byte write', () => {
    const targetXp = xpForLevel(Math.min(60, CAP));
    const { buffer: out, changeReport } = patchSave(FIXTURE, ft(), [
      { fieldKey: XP_KEY, newValue: targetXp },
    ]);
    assert.equal(out.length, FIXTURE.length);
    assert.ok(!out.equals(FIXTURE));
    const row = changeReport.find((r) => r.fieldKey === XP_KEY);
    assert.ok(row);
    assert.equal(row!.width, 8, 'double write is 8 bytes');
    assert.equal(row!.newValue, targetXp);
    assert.ok(FIXTURE.equals(FIXTURE_SNAPSHOT), 'input never mutated (D-04)');
  });

  test('returns a NEW buffer distinct from the input (D-04)', () => {
    const { buffer: out } = patchSave(FIXTURE, ft(), [{ fieldKey: GP_KEY, newValue: 1n }]);
    assert.ok(out !== FIXTURE, 'output is a fresh Buffer, not the input reference');
  });
});

// ---------------------------------------------------------------------------
// SAFE-01 — every bad edit REJECTED before any write (SC-2, fail-loud, never clamp)
// ---------------------------------------------------------------------------

describe('patchSave — SAFE-01 negatives rejected before write', () => {
  const isValidation = (err: unknown) => err instanceof ValidationError;

  test('int32 qty above INT32_MAX rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: BANK_QTY_KEY, newValue: 2147483648 }]),
      isValidation,
    );
    assert.ok(FIXTURE.equals(FIXTURE_SNAPSHOT), 'nothing written on rejection');
  });

  test('negative int32 qty rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: BANK_QTY_KEY, newValue: -1 }]),
      isValidation,
    );
  });

  test('negative int64 currency rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: GP_KEY, newValue: -1n }]),
      isValidation,
    );
  });

  test('skill level above its levelCap rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: LEVEL_KEY, newValue: CAP + 1 }]),
      isValidation,
    );
  });

  test('skill level below 1 rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: LEVEL_KEY, newValue: 0 }]),
      isValidation,
    );
  });

  test('XP = NaN rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: XP_KEY, newValue: Number.NaN }]),
      isValidation,
    );
  });

  test('XP = Infinity rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: XP_KEY, newValue: Number.POSITIVE_INFINITY }]),
      isValidation,
    );
  });

  test('XP < 0 rejected', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: XP_KEY, newValue: -1 }]),
      isValidation,
    );
  });

  test('readOnly LevelCap target rejected (ReadOnlyFieldError)', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: CAP_KEY, newValue: 99 }]),
      (err: unknown) => err instanceof ReadOnlyFieldError,
    );
  });

  test('readOnly header mirror target rejected (ReadOnlyFieldError)', () => {
    assert.equal(FT.get('header.GP')!.readOnly, true, 'header.GP is a readOnly mirror');
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: 'header.GP', newValue: 500n }]),
      (err: unknown) => err instanceof ReadOnlyFieldError,
    );
  });

  test('unknown field key rejected (UnknownFieldError)', () => {
    assert.throws(
      () => patchSave(FIXTURE, ft(), [{ fieldKey: 'wallet.NoSuchCurrency', newValue: 1n }]),
      (err: unknown) => err instanceof UnknownFieldError,
    );
  });
});

// ---------------------------------------------------------------------------
// D-01 — collect ALL violations, write NOTHING
// ---------------------------------------------------------------------------

describe('patchSave — D-01 collect-all then reject atomically', () => {
  test('a batch of three bad value edits throws one ValidationError listing all three', () => {
    const bad: Edit[] = [
      { fieldKey: BANK_QTY_KEY, newValue: -1 }, // negative qty
      { fieldKey: GP_KEY, newValue: -5n }, // currency < 0n
      { fieldKey: LEVEL_KEY, newValue: CAP + 1 }, // level > cap (level only — no conflict)
    ];
    assert.throws(
      () => patchSave(FIXTURE, ft(), bad),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, 'aggregate ValidationError');
        assert.equal(
          (err as ValidationError).violations.length,
          3,
          'one violation collected per failing edit (D-01 collect-all)',
        );
        return true;
      },
    );
    assert.ok(FIXTURE.equals(FIXTURE_SNAPSHOT), 'nothing written when any edit fails (atomic)');
  });
});

// ---------------------------------------------------------------------------
// EDIT-04 / D-02 — XP↔Level coupling; LevelCap never written
// ---------------------------------------------------------------------------

describe('patchSave — EDIT-04 XP↔Level coupling (D-02)', () => {
  const capOffset = FT.get(CAP_KEY)!.offset;

  test('setting level=L writes Level=L AND XP=xpForLevel(L); cap never appears', () => {
    const L = Math.min(50, CAP);
    const { changeReport } = patchSave(FIXTURE, ft(), [{ fieldKey: LEVEL_KEY, newValue: L }]);
    const levelRow = changeReport.find((r) => r.fieldKey === LEVEL_KEY);
    const xpRow = changeReport.find((r) => r.fieldKey === XP_KEY);
    assert.ok(levelRow, 'level write row present');
    assert.ok(xpRow, 'coupled xp write row present');
    assert.equal(levelRow!.newValue, L);
    assert.equal(xpRow!.newValue, xpForLevel(L), 'XP derived from the StandardExperienceTable');
    assert.ok(
      changeReport.every((r) => r.offset !== capOffset && r.fieldKey !== CAP_KEY),
      'LevelCap is never written',
    );
  });

  test('setting xp=X writes XP=X AND Level=levelForXp(X,cap); cap never appears', () => {
    const targetLevel = Math.min(40, CAP);
    const X = xpForLevel(targetLevel);
    const { changeReport } = patchSave(FIXTURE, ft(), [{ fieldKey: XP_KEY, newValue: X }]);
    const xpRow = changeReport.find((r) => r.fieldKey === XP_KEY);
    const levelRow = changeReport.find((r) => r.fieldKey === LEVEL_KEY);
    assert.ok(xpRow, 'xp write row present');
    assert.ok(levelRow, 'coupled level write row present');
    assert.equal(xpRow!.newValue, X);
    assert.equal(levelRow!.newValue, levelForXp(X, CAP), 'Level derived from the inverse');
    assert.equal(levelRow!.newValue, targetLevel);
    assert.ok(
      changeReport.every((r) => r.offset !== capOffset && r.fieldKey !== CAP_KEY),
      'LevelCap is never written',
    );
  });

  test('a batch setting BOTH level and xp for the same skill is rejected (ConflictingEditError)', () => {
    assert.throws(
      () =>
        patchSave(FIXTURE, ft(), [
          { fieldKey: LEVEL_KEY, newValue: Math.min(50, CAP) },
          { fieldKey: XP_KEY, newValue: xpForLevel(Math.min(50, CAP)) },
        ]),
      (err: unknown) => err instanceof ConflictingEditError,
    );
  });
});

// ---------------------------------------------------------------------------
// SC-4 — self-verify diff + re-parse + codec round-trip
// ---------------------------------------------------------------------------

describe('patchSave — SC-4 diff + re-parse + round-trip', () => {
  test('every changed byte falls inside an intended [offset,offset+width) range', () => {
    const L = Math.min(50, CAP);
    const edits: Edit[] = [
      { fieldKey: GP_KEY, newValue: 424242n },
      { fieldKey: BANK_QTY_KEY, newValue: 5000 },
      { fieldKey: LEVEL_KEY, newValue: L }, // couples level + xp
    ];
    const { buffer: out, changeReport } = patchSave(FIXTURE, ft(), edits);
    const ranges = changeReport.map((r) => [r.offset, r.offset + r.width] as const);
    for (let i = 0; i < FIXTURE.length; i++) {
      if (out[i] !== FIXTURE[i]) {
        const covered = ranges.some(([s, e]) => i >= s && i < e);
        assert.ok(covered, `byte ${i} changed outside any intended range (SC-4)`);
      }
    }
    // Re-parse reads back the intended values.
    const reFt = parseSave(out).fieldTable;
    assert.equal(reFt.get(GP_KEY)!.value, 424242n);
    assert.equal(reFt.get(BANK_QTY_KEY)!.value, 5000);
    assert.equal(reFt.get(LEVEL_KEY)!.value, L);
    assert.equal(reFt.get(XP_KEY)!.value, xpForLevel(L));
  });

  test('codec round-trip (compress→decompress→parseSave) yields the edited value', () => {
    const { buffer: out } = patchSave(FIXTURE, ft(), [{ fieldKey: GP_KEY, newValue: 987654321n }]);
    const roundTripped = decompress(compress(out));
    assert.equal(roundTripped.length, out.length, 'round-trip length-stable');
    const rtFt = parseSave(roundTripped).fieldTable;
    assert.equal(rtFt.get(GP_KEY)!.value, 987654321n, 'edited GP survives the codec round-trip');
  });

  test('UnintendedChangeError is the exported D-03 self-verify error (out-of-range byte)', () => {
    // The self-verify diff (D-03) throws UnintendedChangeError if any byte outside an intended
    // [offset,offset+width) range changed. It is intrinsic to every patchSave call; the type is
    // part of the public error hierarchy so callers can distinguish a corruption backstop trip
    // from a value ValidationError.
    const err = new UnintendedChangeError('probe');
    assert.ok(err instanceof PatchError, 'UnintendedChangeError extends the PatchError base');
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'UnintendedChangeError');
  });
});
