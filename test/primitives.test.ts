// Binary primitive test suite — the SC-3 + SC-4 + D-12 proof.
//
// Proves the little-endian BinaryReader/Writer match .NET BinaryReader/BinaryWriter
// byte-for-byte: int32 (4B), int64 (8B BigInt), double (8B IEEE 754), bool (1B), and
// 7-bit-length-prefixed UTF-8 strings. Positive round-trips cover the full D-14 edge
// matrix; 7-bit boundary vectors pin the prefix byte counts at 127/128/16383/16384/65536;
// D-12 fixture slices prove genuine .NET compatibility by round-tripping real .NET-produced
// bytes extracted from test-fixture.sav. Negative tests (Task 2) catch wrong-width /
// wrong-endian writes, OOB reads, and 7-bit length-prefix overflow — never silently corrupting.
//
// Implements: D-02 (deepStrictEqual), D-04 (c8 gate), D-08 (noUncheckedIndexedAccess — uses
// readUInt8 not buf[i] indexing), D-12 (hand-crafted + fixture slices), D-13 (no .NET SDK —
// fixture slices ARE the .NET-compatibility proof), D-14 (full edge matrix), D-15 (inline
// vectors). Mitigates T-1-01 (wrong-width/endian), T-1-02 (7-bit overflow), T-1-04 (OOB read).
//
// Plan 03 is self-contained: it decompresses the fixture inline via node:zlib (the slice test
// only needs the decompressed buffer to extract known-offset slices, NOT the codec's compress/
// roundTrip contract — this preserves Wave 1 parallelism with Plan 02, which owns the codec).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { BinaryReader } from '../src/binary-reader';
import { BinaryWriter } from '../src/binary-writer';

// D-12 fixture: the single committed real .NET-produced Melvor Idle 2 save (D-09/D-10/D-11).
// Decompressed at runtime (D-11 — single source of truth, exercises the code under test).
// 151,993 compressed bytes -> 2,284,747 decompressed bytes. Read-only.
const FIXTURE_DECOMPRESSED: Buffer = brotliDecompressSync(
  readFileSync('test/fixtures/test-fixture.sav'),
);

// D-15: inline edge vectors co-located with the assertions that use them (typed constants).
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;
const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;
const SMALLEST_DENORMAL = 5e-324; // smallest positive denormal (2^-1074)

// ---------------------------------------------------------------------------
// int32 round-trip (SC-3, D-14 edge matrix)
// ---------------------------------------------------------------------------

describe('int32 round-trip (SC-3, D-14 edge matrix)', () => {
  // Each vector is [value, expectedLEhex]. LE hex asserted to pin the .NET byte format
  // (a future accidental big-endian use would produce a different hex and fail loudly).
  const VECTORS: ReadonlyArray<readonly [number, string]> = [
    [0, '00000000'],
    [-1, 'ffffffff'],
    [INT32_MAX, 'ffffff7f'],
    [INT32_MIN, '00000080'],
  ];

  for (const [value, expectedHex] of VECTORS) {
    test(`writeInt32(${value}) produces LE hex ${expectedHex} and readInt32 round-trips`, () => {
      const w = new BinaryWriter();
      w.writeInt32(value);
      // LE byte format pinned (SC-4: LE differs from BE; this hex is the .NET format).
      assert.equal(w.toBuffer().toString('hex'), expectedHex, 'int32 LE hex mismatch');
      assert.equal(w.offset, 4, 'writeInt32 must advance cursor by 4 bytes');

      const r = new BinaryReader(w.toBuffer());
      assert.equal(r.readInt32(), value, 'int32 round-trip');
      assert.equal(r.offset, 4, 'readInt32 must advance cursor by 4 bytes');
    });
  }
});

// ---------------------------------------------------------------------------
// int64 round-trip (SC-3, D-14 edge matrix, BigInt — no precision loss, RESEARCH Pitfall 3)
// ---------------------------------------------------------------------------

describe('int64 round-trip (SC-3, D-14 edge matrix, BigInt)', () => {
  const VECTORS: ReadonlyArray<readonly [bigint, string]> = [
    [0n, '0000000000000000'],
    [-1n, 'ffffffffffffffff'],
    [INT64_MAX, 'ffffffffffffff7f'],
    [INT64_MIN, '0000000000000080'],
  ];

  for (const [value, expectedHex] of VECTORS) {
    test(`writeInt64(${value}n) produces LE hex ${expectedHex} and readInt64 round-trips`, () => {
      const w = new BinaryWriter();
      w.writeInt64(value);
      assert.equal(w.toBuffer().toString('hex'), expectedHex, 'int64 LE hex mismatch');
      assert.equal(w.offset, 8, 'writeInt64 must advance cursor by 8 bytes');

      const r = new BinaryReader(w.toBuffer());
      // BigInt — no Number precision loss near INT64_MAX (RESEARCH Pitfall 3).
      const read = r.readInt64();
      assert.equal(typeof read, 'bigint', 'readInt64 must return bigint, not number');
      assert.equal(read, value, 'int64 round-trip');
      assert.equal(r.offset, 8, 'readInt64 must advance cursor by 8 bytes');
    });
  }
});

// ---------------------------------------------------------------------------
// double round-trip (SC-3, D-14 edge matrix, IEEE 754 — RESEARCH Pitfall 4 for ±0/NaN)
// ---------------------------------------------------------------------------

describe('double round-trip (SC-3, D-14 edge matrix, IEEE 754)', () => {
  // Object.is distinguishes +0 from -0 (=== swallows the sign — RESEARCH Pitfall 4).
  // For NaN, === is always false, so Number.isNaN is used. Bit patterns asserted via hex
  // for ±0 and NaN to prove the sign bit / NaN payload survive the round-trip.
  const VECTORS: ReadonlyArray<
    readonly [string, number, string, (got: number) => boolean]
  > = [
    ['+0.0', 0.0, '0000000000000000', (g) => Object.is(g, 0.0)],
    ['-0.0', -0.0, '0000000000000080', (g) => Object.is(g, -0.0)],
    ['NaN', NaN, '000000000000f87f', (g) => Number.isNaN(g)],
    ['+Infinity', Infinity, '000000000000f07f', (g) => g === Infinity],
    ['-Infinity', -Infinity, '000000000000f0ff', (g) => g === -Infinity],
    ['Math.PI', Math.PI, '182d4454fb210940', (g) => g === Math.PI],
    ['denormal 5e-324', SMALLEST_DENORMAL, '0100000000000000', (g) => Object.is(g, SMALLEST_DENORMAL)],
  ];

  for (const [label, value, expectedHex, ok] of VECTORS) {
    test(`writeDouble(${label}) produces LE hex ${expectedHex} and readDouble round-trips`, () => {
      const w = new BinaryWriter();
      w.writeDouble(value);
      // Bit pattern pinned (Pitfall 4: don't use === which swallows ±0 sign / NaN).
      assert.equal(w.toBuffer().toString('hex'), expectedHex, 'double LE hex mismatch');
      assert.equal(w.offset, 8, 'writeDouble must advance cursor by 8 bytes');

      const r = new BinaryReader(w.toBuffer());
      const got = r.readDouble();
      assert.equal(ok(got), true, `double round-trip failed for ${label} (got ${got})`);
      assert.equal(r.offset, 8, 'readDouble must advance cursor by 8 bytes');
    });
  }
});

// ---------------------------------------------------------------------------
// bool round-trip (SC-3, D-14 edge matrix, 1 byte)
// ---------------------------------------------------------------------------

describe('bool round-trip (SC-3, D-14 edge matrix)', () => {
  const VECTORS: ReadonlyArray<readonly [boolean, string]> = [
    [false, '00'],
    [true, '01'],
  ];

  for (const [value, expectedHex] of VECTORS) {
    test(`writeBool(${value}) produces LE hex ${expectedHex} and readBool round-trips`, () => {
      const w = new BinaryWriter();
      w.writeBool(value);
      assert.equal(w.toBuffer().toString('hex'), expectedHex, 'bool byte mismatch');
      assert.equal(w.offset, 1, 'writeBool must advance cursor by 1 byte');

      const r = new BinaryReader(w.toBuffer());
      assert.equal(r.readBool(), value, 'bool round-trip');
      assert.equal(r.offset, 1, 'readBool must advance cursor by 1 byte');
    });
  }
});

// ---------------------------------------------------------------------------
// string round-trip (SC-3, D-14 edge matrix + 7-bit length-prefix boundaries)
// ---------------------------------------------------------------------------

describe('string round-trip (SC-3, D-14 + 7-bit boundaries)', () => {
  // 7-bit boundary vectors (D-14): the prefix byte count flips at 127/128 and 16383/16384.
  // Verified expected prefix hex (RESEARCH Pitfall 5):
  //   len=0      -> 00          (1B)
  //   len=127    -> 7f          (1B, last 1-byte)
  //   len=128    -> 8001        (2B, first 2-byte)
  //   len=16383  -> ff7f        (2B, last 2-byte)
  //   len=16384  -> 808001      (3B, first 3-byte)
  //   len=65536  -> 808004      (3B)
  const BOUNDARY_VECTORS: ReadonlyArray<readonly [string, string, string]> = [
    // [label, string, expectedPrefixHex]
    ['empty', '', '00'],
    ['ascii 1B', 'A', '01'],
    ['len 127 (1B max)', 'A'.repeat(127), '7f'],
    ['len 128 (2B min)', 'A'.repeat(128), '8001'],
    ['len 16383 (2B max)', 'A'.repeat(16383), 'ff7f'],
    ['len 16384 (3B min)', 'A'.repeat(16384), '808001'],
    ['len 65536 (3B)', 'A'.repeat(65536), '808004'],
    // Multi-byte UTF-8 emoji: 😀 = U+1F600 = f0 9f 98 80 (4 UTF-8 bytes), prefix 04.
    ['multi-byte emoji 😀', '😀', '04'],
  ];

  for (const [label, str, expectedPrefixHex] of BOUNDARY_VECTORS) {
    test(`writeString(${label}) produces prefix ${expectedPrefixHex} + UTF-8 body, round-trips`, () => {
      const w = new BinaryWriter();
      w.writeString(str);
      const out = w.toBuffer();
      const utf8Body = Buffer.from(str, 'utf8');
      // [7-bit length prefix] + [UTF-8 body] — assert the prefix hex pins the boundary.
      const prefixLen = Buffer.from(expectedPrefixHex, 'hex').length;
      assert.equal(
        out.subarray(0, prefixLen).toString('hex'),
        expectedPrefixHex,
        `7-bit length-prefix hex mismatch for ${label}`,
      );
      assert.deepEqual(
        out.subarray(prefixLen),
        utf8Body,
        `UTF-8 body mismatch for ${label}`,
      );

      const r = new BinaryReader(out);
      assert.equal(r.readString(), str, `string round-trip failed for ${label}`);
      assert.equal(r.offset, out.length, 'readString must consume prefix + body');
    });
  }
});

// ---------------------------------------------------------------------------
// D-12 fixture slices (real .NET bytes byte-match — the .NET-compatibility proof)
// ---------------------------------------------------------------------------

describe('D-12 fixture slices (real .NET bytes byte-match)', () => {
  // The fixture layout (docs/current-skill.md): [int32 version][16B UUID][string
  // charName][string gamemode][int64 timestamp][string activeEntityName]...
  // Real .NET-produced bytes at known offsets — round-trip through BinaryWriter and
  // byte-match the original slice. This is the live .NET-compatibility check (D-13: no
  // .NET SDK — the fixture IS .NET output, so byte-matching proves compatibility).

  test('int32 fixture slice: save version at offset 0 byte-matches', () => {
    const r = new BinaryReader(FIXTURE_DECOMPRESSED);
    const version = r.readInt32(); // offset 0, 4 bytes
    assert.equal(version, 20, 'expected save version 20 (fixture)');
    assert.equal(r.offset, 4, 'cursor advanced past int32');

    // Round-trip: writer must emit byte-identical LE bytes for this real .NET value.
    const w = new BinaryWriter();
    w.writeInt32(version);
    assert.deepEqual(
      w.toBuffer(),
      FIXTURE_DECOMPRESSED.subarray(0, 4),
      'writer must emit .NET-identical int32 bytes',
    );
  });

  test('int64 fixture slice: timestamp at offset 29 byte-matches', () => {
    const r = new BinaryReader(FIXTURE_DECOMPRESSED);
    r.seek(29); // skip version(4) + UUID(16) + charName(3+3) + gamemode(1+4) = 31... actually 4+16+4+5=29
    const timestamp = r.readInt64();
    // Real .NET DateTime.ToBinary() value — BigInt, no precision loss.
    assert.equal(typeof timestamp, 'bigint');
    assert.equal(timestamp, -8584189877581021791n, 'pinned real .NET timestamp value');
    assert.equal(r.offset, 37, 'cursor advanced past int64');

    const w = new BinaryWriter();
    w.writeInt64(timestamp);
    assert.deepEqual(
      w.toBuffer(),
      FIXTURE_DECOMPRESSED.subarray(29, 37),
      'writer must emit .NET-identical int64 bytes',
    );
  });

  test('string fixture slice: charName "Bob" at offset 20 byte-matches', () => {
    const r = new BinaryReader(FIXTURE_DECOMPRESSED);
    r.seek(20); // skip version(4) + UUID(16) = 20
    const charName = r.readString();
    assert.equal(charName, 'Bob', 'pinned real .NET charName');
    assert.equal(r.offset, 24, 'cursor advanced past prefix(1) + body(3)');

    const w = new BinaryWriter();
    w.writeString(charName);
    assert.deepEqual(
      w.toBuffer(),
      FIXTURE_DECOMPRESSED.subarray(20, 24),
      'writer must emit .NET-identical string bytes (prefix + UTF-8 body)',
    );
  });

  test('string fixture slice: gamemode "Test" at offset 24 byte-matches', () => {
    const r = new BinaryReader(FIXTURE_DECOMPRESSED);
    r.seek(24); // skip version + UUID + charName
    const gamemode = r.readString();
    assert.equal(gamemode, 'Test', 'pinned real .NET gamemode');
    assert.equal(r.offset, 29, 'cursor advanced past prefix(1) + body(4)');

    const w = new BinaryWriter();
    w.writeString(gamemode);
    assert.deepEqual(
      w.toBuffer(),
      FIXTURE_DECOMPRESSED.subarray(24, 29),
      'writer must emit .NET-identical string bytes',
    );
  });

  test('sequential reads return correct values (cursor advances correctly)', () => {
    // A sequence of reads must return each value at the correct offset — the cursor
    // advances by the exact width of each primitive (never off-by-one).
    const r = new BinaryReader(FIXTURE_DECOMPRESSED);
    assert.equal(r.readInt32(), 20, 'version');
    // skip 16-byte UUID
    r.seek(20);
    assert.equal(r.readString(), 'Bob', 'charName');
    assert.equal(r.readString(), 'Test', 'gamemode');
    assert.equal(r.readInt64(), -8584189877581021791n, 'timestamp');
    assert.equal(r.readString(), 'Combat', 'activeEntityName');
  });
});

// ---------------------------------------------------------------------------
// Multi-write sequence: writer accumulates, reader replays in order
// ---------------------------------------------------------------------------

describe('multi-write sequence round-trips', () => {
  test('a mixed sequence of writes round-trips in order', () => {
    const w = new BinaryWriter();
    w.writeInt32(INT32_MAX);
    w.writeInt64(INT64_MIN);
    w.writeDouble(Math.PI);
    w.writeBool(true);
    w.writeString('😀GP=42');
    w.writeBool(false);

    const r = new BinaryReader(w.toBuffer());
    assert.equal(r.readInt32(), INT32_MAX);
    assert.equal(r.readInt64(), INT64_MIN);
    assert.equal(r.readDouble(), Math.PI);
    assert.equal(r.readBool(), true);
    assert.equal(r.readString(), '😀GP=42');
    assert.equal(r.readBool(), false);
    assert.equal(r.offset, w.offset, 'reader consumed exactly what writer wrote');
  });
});

// ===========================================================================
// NEGATIVE TESTS (SC-4 + T-1-04 + T-1-02) — backstop edges that must FAIL loudly,
// never silently corrupt. Appended in Task 2 to cover the reader's throw arms.
// ===========================================================================

// ---------------------------------------------------------------------------
// wrong-width write caught (SC-4, T-1-01)
// ---------------------------------------------------------------------------

describe('wrong-width write caught (SC-4, T-1-01)', () => {
  test('writing int32 into an int64 slot is detectable (sign corruption)', () => {
    // Demonstrate that Buffer.writeInt32LE on an 8-byte slot leaves the high 4 bytes
    // untouched — a silent width mismatch. For a negative value, the zero-padding
    // corrupts the sign: int32 -1 (0xffffffff) read back as int64 becomes 4294967295n
    // (positive), NOT -1n. The BinaryWriter's per-method width prevents this at the
    // API level (writeInt32 writes exactly 4 bytes; writeInt64 writes exactly 8).
    const buf = Buffer.alloc(8, 0);
    buf.writeInt32LE(-1, 0); // WRONG: only writes 4 of 8 bytes; high 4 stay zero
    const corrupted = buf.readBigInt64LE(0);
    assert.notEqual(
      corrupted,
      -1n,
      'int32-into-int64-slot corruption must be detectable (sign corrupted)',
    );
    assert.equal(
      corrupted,
      4294967295n,
      'sign corrupted: int32 -1 zero-padded into int64 becomes 4294967295 (positive)',
    );

    // Proper int64 write: BinaryWriter.writeInt64(-1n) emits all 8 bytes correctly —
    // the per-method-width API is the T-1-01 mitigation (no wrong-width path exists).
    const w = new BinaryWriter();
    w.writeInt64(-1n);
    assert.equal(w.toBuffer().toString('hex'), 'ffffffffffffffff', 'writeInt64 emits 8 bytes');
    assert.equal(w.toBuffer().readBigInt64LE(0), -1n, 'proper int64 round-trip preserves sign');
  });
});

// ---------------------------------------------------------------------------
// wrong-endian write caught (SC-4, T-1-01)
// ---------------------------------------------------------------------------

describe('wrong-endian write caught (SC-4, T-1-01)', () => {
  test('LE (01000000) differs from BE (00000001) for int32 1 — LE is the .NET format', () => {
    const le = Buffer.alloc(4);
    le.writeInt32LE(1, 0); // .NET / BinaryWriter format
    const be = Buffer.alloc(4);
    be.writeInt32BE(1, 0); // big-endian — wrong for .NET

    // LE and BE produce different bytes; a future accidental big-endian use is detectable.
    assert.notDeepStrictEqual(le, be, 'LE and BE must differ');
    assert.equal(le.toString('hex'), '01000000', '.NET int32 1 is LE 01000000');
    assert.equal(be.toString('hex'), '00000001', 'big-endian int32 1 is 00000001 (wrong for .NET)');

    // BinaryWriter exposes ONLY writeInt32LE (never writeInt32BE) — the LE-only API is
    // the T-1-01/SC-4 mitigation: no big-endian write path exists.
    const w = new BinaryWriter();
    w.writeInt32(1);
    assert.equal(w.toBuffer().toString('hex'), '01000000', 'BinaryWriter emits LE only');
  });
});

// ---------------------------------------------------------------------------
// out-of-bounds read throws (T-1-04)
// ---------------------------------------------------------------------------

describe('out-of-bounds read throws (T-1-04)', () => {
  test('Buffer.readInt32LE throws a buffer-access RangeError past end (not silent undefined)', () => {
    const buf = Buffer.alloc(4); // only 4 bytes
    // Reading at offset === length (one past the last valid byte) must throw, not
    // silently return undefined (which noUncheckedIndexedAccess would catch at
    // typecheck time for buf[i] indexing, but readInt32LE enforces it at runtime).
    // Node throws ERR_OUT_OF_RANGE or ERR_BUFFER_OUT_OF_BOUNDS depending on the
    // access pattern; both are buffer-access RangeErrors that prevent silent reads.
    assert.throws(
      () => buf.readInt32LE(buf.length),
      (err: unknown) =>
        err instanceof RangeError &&
        /ERR_OUT_OF_RANGE|ERR_BUFFER_OUT_OF_BOUNDS|outside buffer/i.test(String(err)),
      'Buffer.readInt32LE must throw past end (T-1-04)',
    );
  });

  test('BinaryReader on a too-short buffer throws when reading past the end', () => {
    const r = new BinaryReader(Buffer.alloc(2)); // only 2 bytes — int32 needs 4
    assert.throws(
      () => r.readInt32(),
      (err: unknown) =>
        err instanceof RangeError &&
        /ERR_OUT_OF_RANGE|ERR_BUFFER_OUT_OF_BOUNDS|outside buffer/i.test(String(err)),
      'BinaryReader.readInt32 must throw on a too-short buffer (T-1-04)',
    );
  });

  test('BinaryReader.readBool throws ERR_BUFFER_OUT_OF_BOUNDS on an empty buffer', () => {
    const r = new BinaryReader(Buffer.alloc(0));
    // readUInt8 on a zero-length buffer throws ERR_BUFFER_OUT_OF_BOUNDS (Node's code for
    // empty-buffer access; readInt32LE past end throws ERR_OUT_OF_RANGE — both are
    // buffer-access RangeErrors, both prevent the silent-undefined read T-1-04 forbids).
    assert.throws(
      () => r.readBool(),
      (err: unknown) =>
        err instanceof RangeError &&
        /ERR_OUT_OF_RANGE|ERR_BUFFER_OUT_OF_BOUNDS|outside buffer/i.test(String(err)),
      'readBool must throw on an empty buffer (T-1-04)',
    );
  });
});

// ---------------------------------------------------------------------------
// 7-bit length-prefix overflow + declared-length overrun (T-1-02)
// ---------------------------------------------------------------------------

describe('7-bit length-prefix overflow throws (T-1-02)', () => {
  test('a 6-byte prefix (0x80 x5 + 0x01) causes readString to throw RangeError', () => {
    // A valid .NET length prefix maxes at 5 bytes (35 bits — enough for any int32
    // length). A 6th byte (shift reaches 35) indicates a malformed prefix; reject it
    // loudly rather than allowing a giant allocation or a corrupt wrapped shift.
    const malformed = Buffer.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]);
    const r = new BinaryReader(malformed);
    assert.throws(
      () => r.readString(),
      (err: unknown) =>
        err instanceof RangeError && /exceeds 5 bytes|T-1-02/i.test(String(err)),
      'readString must reject a >5-byte length prefix (T-1-02, >2GiB cap)',
    );
  });

  test('a declared length greater than the remaining buffer throws RangeError', () => {
    // Prefix declares 100 bytes of body but only 0 bytes follow — the bounds check
    // must throw, not silently return a truncated string via subarray.
    const malformed = Buffer.from([100]); // prefix byte: len=100 (0x64), no body
    const r = new BinaryReader(malformed);
    assert.throws(
      () => r.readString(),
      (err: unknown) =>
        err instanceof RangeError && /exceeds remaining buffer/i.test(String(err)),
      'readString must reject a declared length exceeding the remaining buffer',
    );
  });
});

