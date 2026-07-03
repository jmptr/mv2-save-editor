/* c8 ignore start */
// Little-endian BinaryReader mirroring .NET BinaryReader.
//
// A stateful cursor over a Buffer exposing one method per .NET primitive: int32 (4B),
// int64 (8B BigInt — no Number precision loss, RESEARCH Pitfall 3), double (8B IEEE 754,
// preserves NaN/-0/Inf/denormals), bool (1B), and 7-bit-length-prefixed UTF-8 strings.
//
// LE is locked at the API surface: every read delegates to Buffer.readInt32LE /
// readBigInt64LE / readDoubleLE / readUInt8 (never the big-endian counterparts). The
// 7-bit length-prefix decode is the one "DO hand-roll" exception (RESEARCH Don't Hand-Roll)
// — no canonical Node package exists, and the encoding is spec-simple (<=5 bytes).
//
// Implements: D-04 (coverage-gated core), D-07/D-08 (strict + noUncheckedIndexedAccess —
// uses readUInt8 not buf[i] indexing), D-13 (no .NET SDK), D-14 (full edge matrix). Mitigates
// T-1-02 (7-bit overflow -> RangeError at shift >= 35) and T-1-04 (Buffer.readXxxLE throws
// ERR_OUT_OF_RANGE natively on OOB — no silent undefined read).
/* c8 ignore end */

/**
 * Stateful little-endian binary reader mirroring .NET `BinaryReader`. Holds a cursor
 * offset over a Buffer; each read method advances the cursor by the primitive's width
 * and returns the decoded value. Throws on out-of-bounds reads and malformed 7-bit
 * length prefixes — never silently reads undefined or returns a truncated string.
 *
 * Phase 2's FieldTable parser consumes this sequentially (matching the .NET mental model
 * the spec `docs/current-skill.md` is written in). The reader is single-use per parse;
 * re-parse offsets fresh from the (possibly edited) buffer per the CONTEXT.md lesson
 * "always re-parse offsets fresh".
 *
 * LE-only API (T-1-01/SC-4 mitigation): no big-endian read methods are exposed. A future
 * accidental big-endian use would be caught by the SC-4 negative test.
 */
export class BinaryReader {
  private cursor = 0;

  /**
   * @param buf The little-endian byte buffer to read from. Read-only by contract — the
   *            reader does not mutate it, but editing the underlying buffer after
   *            constructing a reader (without re-parsing offsets) is the anti-pattern
   *            flagged in RESEARCH Anti-Patterns.
   */
  constructor(private readonly buf: Buffer) {}

  /** Current cursor position (bytes from the start of {@link buf}). */
  get offset(): number {
    return this.cursor;
  }

  /**
   * Set the cursor to an absolute offset. Intended for testability (D-12 fixture-slice
   * extraction at known offsets). Bounds are enforced by the next read method — a seek
   * past the end is caught when a subsequent read throws ERR_OUT_OF_RANGE.
   */
  seek(off: number): void {
    this.cursor = off;
  }

  /** Read a signed 32-bit little-endian integer. Advances the cursor by 4 bytes. */
  readInt32(): number {
    const v = this.buf.readInt32LE(this.cursor); // throws ERR_OUT_OF_RANGE on OOB (T-1-04)
    this.cursor += 4;
    return v;
  }

  /**
   * Read a signed 64-bit little-endian integer as a `bigint` (no Number precision loss
   * near INT64_MAX/MIN — RESEARCH Pitfall 3). Advances the cursor by 8 bytes.
   */
  readInt64(): bigint {
    const v = this.buf.readBigInt64LE(this.cursor);
    this.cursor += 8;
    return v;
  }

  /**
   * Read an 8-byte IEEE 754 little-endian double. Preserves NaN, -0.0, +Infinity,
   * -Infinity, and denormals bit-faithfully (RESEARCH Pitfall 4 — use `Object.is` to
   * distinguish +/-0 in callers, not `===`). Advances the cursor by 8 bytes.
   */
  readDouble(): number {
    const v = this.buf.readDoubleLE(this.cursor);
    this.cursor += 8;
    return v;
  }

  /** Read a 1-byte boolean (.NET bool: 0 = false, nonzero = true). Advances the cursor by 1 byte. */
  readBool(): boolean {
    const b = this.buf.readUInt8(this.cursor); // throws ERR_OUT_OF_RANGE on OOB (T-1-04)
    this.cursor += 1;
    return b !== 0;
  }

  /**
   * Read a 7-bit-length-prefixed UTF-8 string (.NET `BinaryReader.ReadString` format).
   * The length prefix encodes the UTF-8 byte count as an integer "seven bits at a time":
   * each byte contributes 7 bits, with the high bit set meaning "more bytes follow".
   *
   * Mitigates T-1-02 (DoS via giant length-prefix): rejects prefixes exceeding 5 bytes
   * (shift >= 35, >2GiB cap on the declared length) and rejects a declared length that
   * exceeds the remaining buffer (bounds check — prevents silent truncation via subarray).
   *
   * Advances the cursor by (prefix length + UTF-8 body length).
   */
  readString(): string {
    let len = 0;
    let shift = 0;
    // Read the 7-bit length prefix one byte at a time. readUInt8 throws ERR_OUT_OF_RANGE
    // natively if the cursor runs past the end mid-prefix (T-1-04 — no silent undefined).
    while (true) {
      const b = this.buf.readUInt8(this.cursor);
      this.cursor += 1;
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break; // high bit clear: this is the final prefix byte
      shift += 7;
      // A valid .NET length prefix maxes at 5 bytes (35 bits — enough for any int32 length).
      // A 6th byte (shift reaches 35) indicates a malformed prefix; reject it loudly rather
      // than allowing the `<<` to wrap past 32 bits and produce a corrupt length (T-1-02).
      if (shift >= 35) {
        throw new RangeError(
          '7-bit length prefix exceeds 5 bytes (shift >= 35, >2GiB cap) — malformed prefix (T-1-02)',
        );
      }
    }
    // Bounds check: a declared length greater than the remaining buffer would silently
    // return a truncated string via subarray (silent corruption). Throw instead.
    if (this.cursor + len > this.buf.length) {
      throw new RangeError(
        `declared string length ${len} exceeds remaining buffer (${this.buf.length - this.cursor} bytes)`,
      );
    }
    const start = this.cursor;
    this.cursor += len;
    return this.buf.subarray(start, this.cursor).toString('utf8');
  }
  // The closing brace of an `export class` is where esbuild source-maps the
  // __export/__toCommonJS/__copyProps interop helper's defensive "key already on target"
  // arm — it never fires for a real require'd module (NOT reader logic). Ignoring this
  // line's coverage excludes only that injected artifact; the class body is fully covered.
  /* c8 ignore next */
}
