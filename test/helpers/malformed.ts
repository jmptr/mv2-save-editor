// Malformed-buffer helpers — SC-5 negative-test fixtures for the structural walk.
//
// Small hand-built buffers (NOT the full fixture) that each trigger a distinct
// bounds-violation path in the structural walk. Each is crafted so the walk's
// guards throw a bounded typed error (ParseError for the explicit region-bound
// checks, or a propagated BinaryReader RangeError for native OOB / malformed
// 7-bit-prefix) — never an OOB read, never a giant allocation (T-02-01/02/03).
//
// Shape: every helper produces an entity-list-framed buffer
//   [int32 count][item × count]
// which is exactly what {@link walkEntities} and {@link walkComponents} read
// first. The helpers are usable against either walk (both read an int32 count
// then N × [string][int32 size][size bytes]).
//
// Plus {@link versionBumpedFixtureBuffer}: a COPY of the committed fixture with
// the version int32 bumped to 21 — proves an unknown/newer version
// warns-but-parses (SC-5: the structural walk is version-agnostic, so the rest
// of the save still parses with unknownVersion=true).

import { Buffer } from 'node:buffer';
import { loadFixtureBuffer } from './fixture';

/**
 * A buffer whose int32 count is 2^31 − 1 (0x7FFFFFFF) — a giant count that would
 * drive an unbounded loop/allocation if not bounded. The structural walk's count
 * pre-check throws a typed ParseError BEFORE the loop starts (T-02-01).
 *
 * Layout: `[int32 count = 2^31 − 1]` (4 bytes).
 */
export function oversizedCountBuffer(): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(0x7fffffff, 0); // 2,147,483,647
  return buf;
}

/**
 * A buffer with one entity whose declared size (1000) overruns the region. The
 * walk's `dataStart + size > regionEnd` check throws a typed ParseError before
 * the payload is read (T-02-03).
 *
 * Layout: `[int32 count=1][0x01 'X'][int32 size=1000]` (10 bytes); region end = 10.
 * dataStart = 10, dataStart + size = 1010 > 10 → ParseError.
 */
export function sizeOverrunsRegionBuffer(): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeInt32LE(1, 0); // count = 1
  buf[4] = 0x01; // 1-byte string prefix
  buf[5] = 0x58; // 'X'
  buf.writeInt32LE(1000, 6); // size = 1000 (overruns the 10-byte region)
  return buf;
}

/**
 * A buffer with one entity whose declared size is −1 (negative int32). The
 * walk rejects a negative size with a typed ParseError before seeking.
 *
 * Layout: `[int32 count=1][0x01 'X'][int32 size=−1]` (10 bytes).
 */
export function negativeSizeBuffer(): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeInt32LE(1, 0); // count = 1
  buf[4] = 0x01; // 1-byte string prefix
  buf[5] = 0x58; // 'X'
  buf.writeInt32LE(-1, 6); // size = -1
  return buf;
}

/**
 * A buffer with a negative int32 count (−1). Without a count pre-check the
 * loop would silently skip (i < −1 is false) and return an empty span list; the
 * pre-check rejects a negative count with a typed ParseError (T-02-01).
 *
 * Layout: `[int32 count = −1]` (4 bytes).
 */
export function negativeCountBuffer(): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(-1, 0);
  return buf;
}

/**
 * A buffer whose first item's 7-bit length prefix exceeds 5 bytes (0x80 ×5 +
 * 0x01) — a malformed prefix the BinaryReader rejects at shift ≥ 35 with a
 * RangeError (Phase 1 T-1-02). The structural walk lets this propagate
 * (never swallows a BinaryReader bounds error).
 *
 * Layout: `[int32 count=1][0x80 0x80 0x80 0x80 0x80 0x01]` (10 bytes).
 * Pre-check passes (count=1, remaining=6 ≥ 5); readString throws RangeError.
 */
export function oversizedSevenBitPrefixBuffer(): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeInt32LE(1, 0); // count = 1
  buf[4] = 0x80;
  buf[5] = 0x80;
  buf[6] = 0x80;
  buf[7] = 0x80;
  buf[8] = 0x80; // 5th 0x80 makes shift reach 35 → RangeError (T-1-02)
  buf[9] = 0x01; // would-be 6th prefix byte (never read — throw fires first)
  return buf;
}

/**
 * A buffer whose first item declares a 5-byte string but only 4 bytes follow —
 * a truncated region where the declared string length runs past the buffer
 * end. The BinaryReader's declared-length bounds check throws a RangeError
 * (Phase 1 T-1-02/T-1-04); the structural walk lets it propagate.
 *
 * Layout: `[int32 count=1][0x05 'a' 'b' 'c' 'd']` (9 bytes). count=1, remaining
 * after count = 5 ≥ 5 (pre-check passes); readString declares 5 bytes, only 4
 * remain → RangeError.
 */
export function truncatedRegionBuffer(): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeInt32LE(1, 0); // count = 1
  buf[4] = 0x05; // declares a 5-byte string
  buf[5] = 0x61; // 'a'
  buf[6] = 0x62; // 'b'
  buf[7] = 0x63; // 'c'
  buf[8] = 0x64; // 'd' — only 4 bytes; 5th is missing (truncated)
  return buf;
}

/**
 * A COPY of the committed fixture with the version int32 bumped to 21 (an
 * unknown/newer version). The structural walk is version-agnostic — the format
 * is self-describing — so the rest of the save (SaveHeader, entity list) parses
 * unchanged and {@link readVersion} returns `unknownVersion: true` (SC-5
 * warn-but-parse). The shared cached fixture buffer is NOT mutated.
 *
 * @returns a fresh Buffer (copy of the fixture with version byte 0..3 = 21).
 */
export function versionBumpedFixtureBuffer(): Buffer {
  const copy = Buffer.from(loadFixtureBuffer()); // copy — never mutate the cached shared buffer
  copy.writeInt32LE(21, 0); // bump version 20 → 21
  return copy;
}
