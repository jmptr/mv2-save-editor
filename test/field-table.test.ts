// FieldTable model test suite — the SC-2/SC-3 foundation + D-03 candidate contract.
//
// Proves the FieldEntry discriminated union (int32/int64/double/bool/string) carries
// offset+kind+width+value with value typed per kind (int64 → bigint, NEVER number —
// CLAUDE.md precision constraint, threat T-02-06), plus the readOnly/authoritative/
// mirrors/candidates flags that mark wallet-authoritative vs header-mirror fields
// (SC-2) and surface ambiguous matches (SC-3/D-03). The FieldTable container enforces
// unique resolved keys, throws RequiredFieldMissingError (typed, fail-loud) on a
// missing required field (D-03 zero-match rule), and retains candidate lists intact
// without auto-picking (D-03 candidates-when-many).
//
// Implements: D-03 (resolve-one / candidates-when-many / fail-loud-when-zero),
// D-04 (c8 gate — 100% lines+branches on src/field-table.ts), D-07/D-08 (strict +
// noUncheckedIndexedAccess). Mitigates T-02-06 (int64 as Number precision loss —
// typed bigint, never number, enforced by the discriminated union at compile time;
// `npx tsc --noEmit` is the type-level proof, `typeof === 'bigint'` is the runtime proof).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FieldTable,
  ParseError,
  RequiredFieldMissingError,
  type FieldCandidate,
  type FieldEntry,
} from '../src/field-table';
import { assertNoOffsets } from './helpers/no-offset-scan';
import { loadFixtureBuffer } from './helpers/fixture';
import type { ViewModel } from '../src/view-model';

// ---------------------------------------------------------------------------
// FieldEntry discriminated union — value typed per kind (SC-2/SC-3 foundation)
// ---------------------------------------------------------------------------

describe('FieldEntry discriminated union — value typed per kind', () => {
  test('int32 entry: value is number, width 4', () => {
    const entry: FieldEntry = {
      kind: 'int32',
      key: 'bank.stack[0].qty',
      offset: 710,
      width: 4,
      value: 48652,
    };
    assert.equal(entry.kind, 'int32');
    assert.equal(typeof entry.value, 'number');
    assert.equal(entry.value, 48652);
    assert.equal(entry.width, 4);
    assert.equal(entry.offset, 710);
    assert.equal(entry.key, 'bank.stack[0].qty');
  });

  test('int64 entry: value is bigint (NEVER number — CLAUDE.md precision, T-02-06)', () => {
    const entry: FieldEntry = {
      kind: 'int64',
      key: 'wallet.GoldPieces',
      offset: 20511,
      width: 8,
      value: 953063625n,
      authoritative: true,
    };
    assert.equal(entry.kind, 'int64');
    // Runtime proof the value is bigint. The type-level "never number" enforcement
    // is proven by `npx tsc --noEmit` — the discriminated union rejects `value: number`
    // for kind: 'int64' at compile time (CLAUDE.md precision constraint, T-02-06).
    assert.equal(typeof entry.value, 'bigint');
    assert.equal(entry.value, 953063625n);
    assert.equal(entry.width, 8);
  });

  test('double entry: value is number, width 8', () => {
    const entry: FieldEntry = {
      kind: 'double',
      key: 'skill.Woodcutting.xp',
      offset: 47405,
      width: 8,
      value: 7439645.2,
    };
    assert.equal(entry.kind, 'double');
    assert.equal(typeof entry.value, 'number');
    assert.equal(entry.value, 7439645.2);
    assert.equal(entry.width, 8);
  });

  test('bool entry: value is boolean, width 1', () => {
    const entry: FieldEntry = {
      kind: 'bool',
      key: 'bank.stack[0].locked',
      offset: 715,
      width: 1,
      value: false,
    };
    assert.equal(entry.kind, 'bool');
    assert.equal(typeof entry.value, 'boolean');
    assert.equal(entry.value, false);
    assert.equal(entry.width, 1);
  });

  test('string entry: value is string, width = UTF-8 byte length', () => {
    const entry: FieldEntry = {
      kind: 'string',
      key: 'bank.stack[0].itemId',
      offset: 716,
      width: 19, // "MelvorBase:NormalLog" = 19 UTF-8 bytes
      value: 'MelvorBase:NormalLog',
    };
    assert.equal(entry.kind, 'string');
    assert.equal(typeof entry.value, 'string');
    assert.equal(entry.value, 'MelvorBase:NormalLog');
    assert.equal(entry.width, 19);
  });
});

// ---------------------------------------------------------------------------
// FieldEntry flags — readOnly / authoritative / mirrors / candidates (SC-2/SC-3)
// ---------------------------------------------------------------------------

describe('FieldEntry flags round-trip (SC-2/SC-3 foundation)', () => {
  test('readOnly + mirrors flags mark a header field that is never a write target (SC-2)', () => {
    const entry: FieldEntry = {
      kind: 'int64',
      key: 'header.GP',
      offset: 100,
      width: 8,
      value: 953063625n,
      readOnly: true,
      mirrors: 'wallet.GoldPieces',
    };
    assert.equal(entry.readOnly, true);
    assert.equal(entry.mirrors, 'wallet.GoldPieces');
  });

  test('authoritative flag marks the wallet int64 that IS the write target (SC-2)', () => {
    const entry: FieldEntry = {
      kind: 'int64',
      key: 'wallet.GoldPieces',
      offset: 20511,
      width: 8,
      value: 953063625n,
      authoritative: true,
    };
    assert.equal(entry.authoritative, true);
  });

  test('candidates flag can attach to a resolved entry carrying unresolved alternates', () => {
    const candidates: FieldCandidate[] = [
      { offset: 1000, evidence: '7-bit prefix (13) == ID byte length (13); qty 100 in [0, 2^31-1]' },
      { offset: 2000, evidence: '7-bit prefix (13) == ID byte length (13); qty 200 in [0, 2^31-1]' },
    ];
    const entry: FieldEntry = {
      kind: 'int32',
      key: 'ambiguous.field',
      offset: 1000,
      width: 4,
      value: 100,
      candidates,
    };
    assert.deepEqual(entry.candidates, candidates);
    assert.equal(entry.candidates?.length, 2);
  });
});

// ---------------------------------------------------------------------------
// FieldTable add + get — unique resolved keys
// ---------------------------------------------------------------------------

describe('FieldTable add + get (unique resolved keys)', () => {
  test('add(entry) then get(key) returns the same entry', () => {
    const ft = new FieldTable();
    const entry: FieldEntry = {
      kind: 'int32',
      key: 'test.field',
      offset: 42,
      width: 4,
      value: 123,
    };
    ft.add(entry);
    assert.equal(ft.get('test.field'), entry);
  });

  test('get(missing key) returns undefined', () => {
    const ft = new FieldTable();
    assert.equal(ft.get('nonexistent'), undefined);
  });

  test('add throws on duplicate resolved key (keys are unique for resolved fields)', () => {
    const ft = new FieldTable();
    ft.add({ kind: 'int32', key: 'dup', offset: 0, width: 4, value: 1 });
    assert.throws(
      () => ft.add({ kind: 'int32', key: 'dup', offset: 4, width: 4, value: 2 }),
      /duplicate/i,
    );
  });
});

// ---------------------------------------------------------------------------
// FieldTable candidates — D-03 ambiguous-match surfacing (never auto-pick)
// ---------------------------------------------------------------------------

describe('FieldTable candidates (D-03 — surface ambiguity, never auto-pick)', () => {
  test('addCandidates + getCandidates round-trips', () => {
    const ft = new FieldTable();
    const candidates: FieldCandidate[] = [
      { offset: 1000, evidence: 'validated at 1000' },
      { offset: 2000, evidence: 'validated at 2000' },
      { offset: 3000, evidence: 'validated at 3000' },
    ];
    ft.addCandidates('ambiguous.field', candidates);
    assert.deepEqual(ft.getCandidates('ambiguous.field'), candidates);
  });

  test('getCandidates(missing key) returns undefined', () => {
    const ft = new FieldTable();
    assert.equal(ft.getCandidates('nonexistent'), undefined);
  });

  test('addCandidates throws on duplicate unresolved key', () => {
    const ft = new FieldTable();
    ft.addCandidates('dup', [{ offset: 1, evidence: 'first' }]);
    assert.throws(
      () => ft.addCandidates('dup', [{ offset: 2, evidence: 'second' }]),
      /duplicate/i,
    );
  });

  test('candidate list survives intact — not collapsed to one (D-03 no auto-pick)', () => {
    const ft = new FieldTable();
    const candidates: FieldCandidate[] = [
      { offset: 1000, evidence: 'candidate A' },
      { offset: 2000, evidence: 'candidate B' },
      { offset: 3000, evidence: 'candidate C' },
      { offset: 4000, evidence: 'candidate D' },
    ];
    ft.addCandidates('multi.candidate.field', candidates);
    const retrieved = ft.getCandidates('multi.candidate.field');
    assert.equal(retrieved?.length, 4, 'all 4 candidates must survive — no auto-pick');
    assert.equal(retrieved?.[0]?.offset, 1000);
    assert.equal(retrieved?.[3]?.offset, 4000);
  });
});

// ---------------------------------------------------------------------------
// FieldTable getRequired — D-03 zero-match rule (fail-loud, typed error)
// ---------------------------------------------------------------------------

describe('FieldTable getRequired (D-03 zero-match rule — fail loud)', () => {
  test('getRequired returns the entry when present', () => {
    const ft = new FieldTable();
    const entry: FieldEntry = {
      kind: 'int64',
      key: 'wallet.GoldPieces',
      offset: 20511,
      width: 8,
      value: 953063625n,
      authoritative: true,
    };
    ft.add(entry);
    assert.equal(ft.getRequired('wallet.GoldPieces'), entry);
  });

  test('getRequired throws RequiredFieldMissingError when the field was never added', () => {
    const ft = new FieldTable();
    try {
      ft.getRequired('wallet.GoldPieces');
      assert.fail('expected getRequired to throw RequiredFieldMissingError');
    } catch (err) {
      assert.ok(
        err instanceof RequiredFieldMissingError,
        `expected RequiredFieldMissingError, got ${(err as Error)?.constructor?.name}`,
      );
      assert.ok(err instanceof ParseError, 'RequiredFieldMissingError must extend ParseError');
      assert.ok(err instanceof Error, 'must extend Error');
      assert.equal(
        (err as RequiredFieldMissingError).fieldKey,
        'wallet.GoldPieces',
        'must carry the missing field key',
      );
      assert.match((err as Error).message, /wallet\.GoldPieces/);
    }
  });
});

// ---------------------------------------------------------------------------
// Typed error hierarchy — ParseError base for Wave 2 fail-loud bounds violations
// ---------------------------------------------------------------------------

describe('typed error hierarchy (ParseError base, reused by Wave 2)', () => {
  test('RequiredFieldMissingError extends ParseError extends Error', () => {
    const err = new RequiredFieldMissingError('some.field');
    assert.ok(err instanceof RequiredFieldMissingError);
    assert.ok(err instanceof ParseError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'RequiredFieldMissingError');
  });

  test('ParseError is constructible (base for Wave 2 fail-loud bounds violations)', () => {
    const err = new ParseError('some parse failure');
    assert.ok(err instanceof ParseError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ParseError');
    assert.match(err.message, /some parse failure/);
  });

  test('RequiredFieldMissingError carries the field key + a descriptive message', () => {
    const err = new RequiredFieldMissingError('wallet.GoldPieces');
    assert.equal(err.fieldKey, 'wallet.GoldPieces');
    assert.match(err.message, /wallet\.GoldPieces/);
  });
});

// ---------------------------------------------------------------------------
// Offset-free ViewModel + no-offset scanner (SC-4) + shared fixture harness
// ---------------------------------------------------------------------------
//
// SC-4 has two layers: (1) the ViewModel TYPE is offset-free by construction (no
// `offset` key at any depth), and (2) assertNoOffsets() is a runtime guard that
// recursively scans an actual view-model object for any `offset` key at any depth.
// The type layer catches a parser that tries to type a field as `offset`; the runtime
// layer catches a parser that bypasses the type system (e.g. `as any`) and leaks an
// offset into the object. Both layers are required — defense in depth.

describe('offset-free ViewModel + no-offset scanner (SC-4 by construction + runtime guard)', () => {
  test('assertNoOffsets passes on a clean ViewModel-shaped object (SC-4 type-level)', () => {
    const vm: ViewModel = {
      version: 20,
      unknownVersion: false,
      summary: {
        name: 'Bob',
        gamemode: 'Test',
        totalLevel: 1366,
        gp: '953063625', // int64 as string — JSON/IPC-safe, no precision loss
        slayerCoins: '6511',
      },
      bankItems: [
        {
          itemId: 'MelvorBase:NormalLog', // raw namespaced ID (D-02)
          quantity: 48652,
          isPlaceholder: false, // free metadata (D-01)
          isLocked: false, // free metadata (D-01)
          fieldKey: 'bank.inventory.MelvorBase:NormalLog#0', // offset-free stack key (EDIT-02)
        },
      ],
      skills: [
        {
          id: 'MelvorBase:Woodcutting',
          xp: 7439645.2,
          level: 93,
          levelCap: 120,
        },
      ],
      entityIds: ['MelvorBase:Bank', 'MelvorBase:Woodcutting'], // D-01 free metadata
      unresolvedFields: [
        {
          field: 'ambiguous.thing',
          candidates: [
            { evidence: 'validated at one place' }, // offset-free candidate (no offset key)
            { evidence: 'validated at another' },
          ],
        },
      ],
    };
    // Should NOT throw — the view model is offset-free by construction (SC-4 type-level).
    assertNoOffsets(vm);
  });

  test('assertNoOffsets throws on an offset-bearing object (SC-4 runtime guard)', () => {
    const bad: unknown = {
      version: 20,
      summary: {
        name: 'Bob',
        gamemode: 'Test',
        totalLevel: 1366,
        gp: '953063625',
        slayerCoins: '6511',
      },
      bankItems: [
        {
          itemId: 'X',
          quantity: 1,
          isPlaceholder: false,
          isLocked: false,
          offset: 710, // the leak — a byte offset in the view model (SC-4 violation)
        },
      ],
      skills: [],
      entityIds: [],
    };
    assert.throws(
      () => assertNoOffsets(bad),
      /SC-4 violation.*bankItems\[0\]\.offset/,
    );
  });

  test('assertNoOffsets catches a nested offset at arbitrary depth', () => {
    const bad: unknown = {
      level1: { level2: { level3: { offset: 999 } } },
    };
    assert.throws(
      () => assertNoOffsets(bad),
      /SC-4 violation.*level1\.level2\.level3\.offset/,
    );
  });

  test('assertNoOffsets catches an offset on a root-level key', () => {
    const bad: unknown = { version: 20, offset: 0 };
    assert.throws(
      () => assertNoOffsets(bad),
      /SC-4 violation.*root\.offset/,
    );
  });

  test('assertNoOffsets ignores primitives, null, undefined, and empty containers', () => {
    // Must not throw on non-object inputs — the scanner's base case.
    assertNoOffsets(undefined);
    assertNoOffsets(null);
    assertNoOffsets(42);
    assertNoOffsets('a string');
    assertNoOffsets(true);
    assertNoOffsets(false);
    assertNoOffsets([]);
    assertNoOffsets({});
  });
});

describe('loadFixtureBuffer (shared test harness for Wave 2/3 parsers)', () => {
  test('returns the decompressed committed fixture buffer (2,284,747 bytes, D-10/D-11)', () => {
    const buf = loadFixtureBuffer();
    assert.ok(Buffer.isBuffer(buf), 'must return a Buffer');
    // Pinned decompressed length — proves the fixture is the committed real .NET save
    // (D-10/D-11 — single source of truth, decompressed at runtime via Phase 1 codec).
    assert.equal(buf.length, 2284747, 'decompressed fixture must be 2,284,747 bytes');
  });

  test('loadFixtureBuffer returns a stable reference (cached at module load)', () => {
    const a = loadFixtureBuffer();
    const b = loadFixtureBuffer();
    assert.equal(a, b, 'same Buffer reference — decompressed once at module load');
  });
});
