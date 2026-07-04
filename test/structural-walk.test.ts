// Structural walk test suite — the deterministic spine (IO-01 + Determinism + SC-1/SC-2/SC-5).
//
// Proves the framed structural walk over the decompressed committed fixture:
//   int32 version (20) → SaveHeader (name 'Bob', gamemode 'Test', totalLevel 1366,
//     GP 953063625, SlayerCoins 6511, header ends at offset 150) → entity list (33
//     entities consuming exactly to byte 2,284,711) → per-entity component walk
//     (delta-0 on every one of the 33 entities: declared count == walked count AND
//     cursor == regionEnd).
//
// SC-2: the SaveHeader GP/SlayerCoins FieldEntries are marked readOnly + mirrors
//   ('wallet.GoldPieces' / 'wallet.SlayerCoins') so Phase 3's patcher can never
//   target the header — only the Bank wallet is authoritative for currency.
// SC-5: malformed/oversized counts and region sizes throw a bounded typed error
//   (ParseError or propagated BinaryReader RangeError) — no OOB read, no giant
//   allocation; an unknown/newer save version warns-but-parses (unknownVersion=true).
// Determinism: count == walked and cursor == regionEnd asserted for all 33 entities.
//
// Implements: D-04 (c8 gate — 100% lines+branches on src/structural-walk.ts),
// D-07/D-08 (strict + noUncheckedIndexedAccess). Mitigates T-02-01 (giant count →
// bounded pre-check), T-02-02 (malformed 7-bit prefix → propagated RangeError),
// T-02-03 (region overrun → typed ParseError), T-02-05 (silent under-parse →
// delta-0 integrity asserts, fail loud).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BinaryReader } from '../src/binary-reader';
import {
  readVersion,
  parseSaveHeader,
  walkEntities,
  walkComponents,
  KNOWN_VERSION,
} from '../src/structural-walk';
import { ParseError } from '../src/field-table';
import { loadFixtureBuffer } from './helpers/fixture';
import {
  oversizedCountBuffer,
  sizeOverrunsRegionBuffer,
  negativeSizeBuffer,
  negativeCountBuffer,
  oversizedSevenBitPrefixBuffer,
  truncatedRegionBuffer,
  versionBumpedFixtureBuffer,
} from './helpers/malformed';

// The decompressed committed fixture (2,284,747 bytes, version 20). Cached at module
// load. Consumed read-only via BinaryReader (never mutated).
const FIXTURE = loadFixtureBuffer();

// The entity list starts after the SaveHeader (offset 150) and consumes exactly to
// byte 2,284,711 — i.e. buffer.length − 36 (the 36-byte ActionManager/RNG/favourites/
// EventLog tail that this plan does not model). Verified empirically in 02-RESEARCH.md.
const ENTITY_LIST_START = 150;
const TAIL_BYTES = 36;
const ENTITY_LIST_END = FIXTURE.length - TAIL_BYTES; // 2,284,711

// ---------------------------------------------------------------------------
// readVersion — int32 at offset 0; warn-but-parse on unknown version (SC-5)
// ---------------------------------------------------------------------------

describe('readVersion — int32 at offset 0', () => {
  test('fixture yields version 20 with unknownVersion false (SC-1)', () => {
    const reader = new BinaryReader(FIXTURE);
    const { version, unknownVersion } = readVersion(reader);
    assert.equal(version, 20);
    assert.equal(unknownVersion, false);
    assert.equal(KNOWN_VERSION, 20);
  });

  test('readVersion advances the cursor past the 4-byte version int32', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    assert.equal(reader.offset, 4);
  });
});

// ---------------------------------------------------------------------------
// parseSaveHeader — UUID → name → gamemode → timestamp → 4 active strings →
// totalLevel → GP(int64) → SlayerCoins(int64); header ends at offset 150
// ---------------------------------------------------------------------------

describe('parseSaveHeader — verified fixture reference values (SC-1)', () => {
  test('summary matches the research reference table', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader); // advance past version
    const { summary, headerEnd } = parseSaveHeader(reader);
    assert.equal(summary.name, 'Bob');
    assert.equal(summary.gamemode, 'Test');
    assert.equal(summary.totalLevel, 1366);
    assert.equal(summary.gp, 953063625n);
    assert.equal(summary.slayerCoins, 6511n);
    assert.equal(headerEnd, 150);
  });

  test('GP and SlayerCoins FieldEntries are readOnly mirrors (SC-2)', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    const { entries } = parseSaveHeader(reader);

    const gp = entries.find((e) => e.key === 'header.GP');
    assert.ok(gp, 'header.GP entry emitted');
    assert.equal(gp!.kind, 'int64');
    assert.equal(gp!.width, 8);
    assert.equal(gp!.value, 953063625n);
    assert.equal(gp!.readOnly, true);
    assert.equal(gp!.mirrors, 'wallet.GoldPieces');
    // Header mirrors are NEVER the write target — no authoritative flag.
    assert.equal(gp!.authoritative, undefined);

    const sc = entries.find((e) => e.key === 'header.SlayerCoins');
    assert.ok(sc, 'header.SlayerCoins entry emitted');
    assert.equal(sc!.kind, 'int64');
    assert.equal(sc!.width, 8);
    assert.equal(sc!.value, 6511n);
    assert.equal(sc!.readOnly, true);
    assert.equal(sc!.mirrors, 'wallet.SlayerCoins');
    assert.equal(sc!.authoritative, undefined);
  });

  test('parseSaveHeader leaves the cursor at headerEnd (150)', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    assert.equal(reader.offset, 150);
  });
});

// ---------------------------------------------------------------------------
// walkEntities — int32 count (33) then N × [string id][int32 size][size bytes]
// ---------------------------------------------------------------------------

describe('walkEntities — 33 entities, delta-0 on the list (Determinism)', () => {
  test('fixture declares 33 entities and the walk consumes exactly to ENTITY_LIST_END', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    const spans = walkEntities(reader, ENTITY_LIST_START, ENTITY_LIST_END);
    assert.equal(spans.length, 33);
    // The walk lands delta-0: cursor == regionEnd.
    assert.equal(reader.offset, ENTITY_LIST_END);
    assert.equal(ENTITY_LIST_END, 2284711);
  });

  test('entity spans are opaque {id, start, size} (no payload decode — Phase 4 round-trip)', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    const spans = walkEntities(reader, ENTITY_LIST_START, ENTITY_LIST_END);
    for (const span of spans) {
      assert.equal(typeof span.id, 'string');
      assert.ok(span.id.length > 0);
      assert.equal(typeof span.start, 'number');
      assert.equal(typeof span.size, 'number');
      assert.ok(span.size > 0, `entity ${span.id} has positive size`);
      // Each span fits within the entity-list region.
      assert.ok(span.start + span.size <= ENTITY_LIST_END, `entity ${span.id} fits region`);
    }
  });

  test('the fixture contains MelvorBase:Layout (not in the docs Known Entity IDs) — walk is generic', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    const spans = walkEntities(reader, ENTITY_LIST_START, ENTITY_LIST_END);
    const ids = spans.map((s) => s.id);
    assert.ok(ids.includes('MelvorBase:Layout'), 'walk is generic — recovers undocumented entities');
    assert.ok(ids.includes('MelvorBase:Bank'), 'Bank entity present');
  });
});

// ---------------------------------------------------------------------------
// walkComponents — int32 count then N × [string name][int32 size][size bytes];
// delta-0 on EVERY entity (count==walked, cursor==regionEnd) — the integrity spine
// ---------------------------------------------------------------------------

describe('walkComponents — delta-0 on all 33 entities (Determinism / T-02-05)', () => {
  test('every entity region walks count==walked and cursor==regionEnd', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    const spans = walkEntities(reader, ENTITY_LIST_START, ENTITY_LIST_END);
    assert.equal(spans.length, 33);
    for (const span of spans) {
      const comps = walkComponents(reader, span.start, span.size);
      // cursor == regionEnd (delta-0) — the integrity assert everything else rides on.
      assert.equal(
        reader.offset,
        span.start + span.size,
        `entity ${span.id}: cursor==regionEnd (delta-0)`,
      );
      // Every component fits within its entity region.
      for (const c of comps) {
        assert.ok(
          c.dataStart + c.size <= span.start + span.size,
          `component ${c.name} in ${span.id} fits entity region`,
        );
      }
    }
  });

  test('the Bank entity has a Wallet component and an Inventory component (research §Pattern 2/3)', () => {
    const reader = new BinaryReader(FIXTURE);
    readVersion(reader);
    parseSaveHeader(reader);
    const spans = walkEntities(reader, ENTITY_LIST_START, ENTITY_LIST_END);
    const bank = spans.find((s) => s.id === 'MelvorBase:Bank');
    assert.ok(bank, 'Bank entity present');
    const comps = walkComponents(reader, bank!.start, bank!.size);
    const names = comps.map((c) => c.name);
    assert.ok(names.includes('Wallet'), 'Wallet component located (currency-by-ID, 02-03)');
    assert.ok(names.includes('Inventory'), 'Inventory component located (marker-search, 02-04)');
    assert.equal(reader.offset, bank!.start + bank!.size);
  });

  test('walkComponents throws a typed ParseError when the region is not consumed exactly', () => {
    // Craft a buffer where count=1 and the single component's framing consumes 11
    // bytes, but the declared region is 12 bytes — the walk ends at cursor=11 !=
    // regionEnd=12 → delta-0 integrity assert throws a typed ParseError.
    //   [int32 count=1][0x01 'X'][int32 size=1][1 byte data][1 extra byte] = 12 bytes
    const buf = Buffer.alloc(12, 0);
    buf.writeInt32LE(1, 0); // count
    buf[4] = 0x01; buf[5] = 0x58; // string "X" (1-byte prefix + 'X')
    buf.writeInt32LE(1, 6); // size = 1
    buf[10] = 0xaa; // 1 byte of component data (start=10, size=1 → seek to 11)
    // byte 11 is the extra byte that makes cursor(11) != regionEnd(12)
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkComponents(reader, 0, 12),
      (err: unknown) => err instanceof ParseError,
      'delta-0 mismatch throws typed ParseError',
    );
  });
});

// ---------------------------------------------------------------------------
// SC-5 bounds guards — malformed buffers throw bounded typed errors
// (T-02-01 giant count, T-02-02 malformed 7-bit prefix, T-02-03 region overrun)
// ---------------------------------------------------------------------------

describe('SC-5 bounds guards — malformed buffers throw bounded typed errors', () => {
  test('oversized ENTITY count throws ParseError before looping (T-02-01)', () => {
    const buf = oversizedCountBuffer(); // count = 2^31 − 1
    const reader = new BinaryReader(buf);
    // Must throw a typed ParseError BEFORE entering the loop (no giant allocation/hang).
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'oversized entity count throws typed ParseError (pre-check, not an unbounded loop)',
    );
  });

  test('oversized COMPONENT count throws ParseError before looping (T-02-01)', () => {
    const buf = oversizedCountBuffer(); // count = 2^31 − 1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkComponents(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'oversized component count throws typed ParseError (pre-check)',
    );
  });

  test('negative ENTITY count throws ParseError (T-02-01)', () => {
    const buf = negativeCountBuffer(); // count = −1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'negative entity count throws typed ParseError',
    );
  });

  test('negative COMPONENT count throws ParseError (T-02-01)', () => {
    const buf = negativeCountBuffer(); // count = −1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkComponents(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'negative component count throws typed ParseError',
    );
  });

  test('entity size overruns region throws ParseError (T-02-03)', () => {
    const buf = sizeOverrunsRegionBuffer(); // 1 entity, size=1000, region=10
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'entity size overrunning regionEnd throws typed ParseError',
    );
  });

  test('component size overruns entity region throws ParseError (T-02-03)', () => {
    const buf = sizeOverrunsRegionBuffer();
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkComponents(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'component size overrunning entityEnd throws typed ParseError',
    );
  });

  test('negative entity size throws ParseError', () => {
    const buf = negativeSizeBuffer(); // 1 entity, size=−1
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'negative entity size throws typed ParseError',
    );
  });

  test('negative component size throws ParseError', () => {
    const buf = negativeSizeBuffer();
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkComponents(reader, 0, buf.length),
      (err: unknown) => err instanceof ParseError,
      'negative component size throws typed ParseError',
    );
  });

  test('malformed 7-bit length prefix propagates BinaryReader RangeError (T-02-02)', () => {
    const buf = oversizedSevenBitPrefixBuffer(); // 6-byte 0x80…0x01 prefix
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof RangeError && !(err instanceof ParseError),
      'malformed 7-bit prefix propagates the BinaryReader RangeError (not swallowed)',
    );
  });

  test('truncated region (declared string past buffer) propagates BinaryReader RangeError', () => {
    const buf = truncatedRegionBuffer(); // declares 5-byte string, only 4 follow
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, buf.length),
      (err: unknown) => err instanceof RangeError && !(err instanceof ParseError),
      'truncated region propagates the BinaryReader RangeError (no OOB read)',
    );
  });

  test('walkEntities throws ParseError when the list region is not consumed exactly', () => {
    // [int32 count=1][0x01 'X'][int32 size=1][1 byte data][1 extra byte] = 12 bytes
    const buf = Buffer.alloc(12, 0);
    buf.writeInt32LE(1, 0);
    buf[4] = 0x01; buf[5] = 0x58;
    buf.writeInt32LE(1, 6);
    buf[10] = 0xaa;
    const reader = new BinaryReader(buf);
    assert.throws(
      () => walkEntities(reader, 0, 12),
      (err: unknown) => err instanceof ParseError,
      'entity-list delta-0 mismatch throws typed ParseError',
    );
  });
});

// ---------------------------------------------------------------------------
// Version tolerance — unknown/newer version warns-but-parses (SC-5)
// ---------------------------------------------------------------------------

describe('version tolerance — unknown/newer version warns-but-parses (SC-5)', () => {
  test('a version-21 copy of the fixture parses with unknownVersion=true', () => {
    const buf = versionBumpedFixtureBuffer(); // fixture copy, version bumped 20→21
    const reader = new BinaryReader(buf);

    const { version, unknownVersion } = readVersion(reader);
    assert.equal(version, 21);
    assert.equal(unknownVersion, true);

    // The rest still parses — the structural walk is version-agnostic.
    const { summary, headerEnd } = parseSaveHeader(reader);
    assert.equal(summary.name, 'Bob');
    assert.equal(summary.gamemode, 'Test');
    assert.equal(summary.totalLevel, 1366);
    assert.equal(summary.gp, 953063625n);
    assert.equal(summary.slayerCoins, 6511n);
    assert.equal(headerEnd, 150);

    const spans = walkEntities(reader, 150, buf.length - TAIL_BYTES);
    assert.equal(spans.length, 33);
    assert.equal(reader.offset, buf.length - TAIL_BYTES);
  });

  test('the shared cached fixture buffer is NOT mutated by the version-bump helper', () => {
    const before = loadFixtureBuffer();
    const _bumped = versionBumpedFixtureBuffer();
    const after = loadFixtureBuffer();
    assert.equal(after.readInt32LE(0), 20, 'shared cached fixture still reads version 20');
    assert.ok(before !== _bumped, 'version-bump helper returns a copy, not the shared buffer');
  });
});
