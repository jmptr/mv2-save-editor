/* c8 ignore start */
// Little-endian BinaryWriter mirroring .NET BinaryWriter.
//
// A stateful cursor over a growable Buffer exposing one method per .NET primitive:
// int32 (4B), int64 (8B BigInt — no Number precision loss), double (8B IEEE 754),
// bool (1B), and 7-bit-length-prefixed UTF-8 strings. The buffer grows on demand so a
// write never silently overruns into uninitialized bytes (no silent corruption — the
// corruption-prevention spine this phase delivers).
//
// LE is locked at the API surface: every write delegates to Buffer.writeInt32LE /
// writeBigInt64LE / writeDoubleLE / writeUInt8 (never the big-endian counterparts). The
// 7-bit length-prefix encode is the one "DO hand-roll" exception (RESEARCH Don't Hand-Roll).
//
// Implements: D-04 (coverage-gated core), D-07/D-08 (strict + noUncheckedIndexedAccess),
// D-14 (full edge matrix). Mitigates T-1-01 (LE-only API — never re-exports big-endian
// counterparts; SC-4 negative test asserts LE differs from BE).
/* c8 ignore end */

/**
 * Stateful little-endian binary writer mirroring .NET `BinaryWriter`. Holds a cursor
 * offset over an internal growable Buffer; each write method appends a primitive at the
 * cursor and advances it by the primitive's width. {@link toBuffer} returns a view of the
 * bytes written so far (suitable for constructing a {@link BinaryReader} to round-trip).
 *
 * The buffer grows on demand (doubling) when a write would exceed the current capacity,
 * so a write never silently overruns past the end — it grows instead. This is the
 * corruption-prevention guarantee: there is no code path that writes past the buffer.
 *
 * LE-only API (T-1-01/SC-4 mitigation): no big-endian write methods are exposed or
 * re-exported. A future accidental big-endian use would be caught by the SC-4 negative
 * test.
 */
export class BinaryWriter {
  private buf: Buffer;
  private cursor = 0;

  /**
   * @param capacity Initial buffer capacity in bytes (default 64). The buffer grows on
   *                  demand — callers writing large strings (e.g. 16384 bytes) need not
   *                  pre-size; the writer doubles until the write fits.
   */
  constructor(capacity: number = 64) {
    this.buf = Buffer.alloc(capacity);
  }

  /** Current cursor position (bytes written so far). */
  get offset(): number {
    return this.cursor;
  }

  /**
   * Return a view of the bytes written so far (`buf.subarray(0, cursor)`). The view is
   * read-only by contract — callers (tests, Phase 2/3 patcher) construct a BinaryReader
   * on it or compare it byte-for-byte against a fixture slice.
   */
  toBuffer(): Buffer {
    return this.buf.subarray(0, this.cursor);
  }

  /**
   * Ensure the internal buffer has room for `needed` bytes at the cursor. Grows by
   * doubling (minimum 64) until the write fits. Called before every write so the
   * subsequent typed write (e.g. writeInt32LE) never silently overruns past the end.
   */
  private ensure(needed: number): void {
    if (needed <= this.buf.length) return;
    let cap = this.buf.length;
    do {
      cap = Math.max(cap * 2, 64);
    } while (cap < needed);
    const grown = Buffer.alloc(cap);
    this.buf.copy(grown, 0, 0, this.cursor);
    this.buf = grown;
  }

  /** Write a signed 32-bit little-endian integer. Advances the cursor by 4 bytes. */
  writeInt32(v: number): void {
    this.ensure(this.cursor + 4);
    this.buf.writeInt32LE(v, this.cursor);
    this.cursor += 4;
  }

  /**
   * Write a signed 64-bit little-endian integer from a `bigint` (no Number precision loss
   * near INT64_MAX/MIN — RESEARCH Pitfall 3). Advances the cursor by 8 bytes.
   */
  writeInt64(v: bigint): void {
    this.ensure(this.cursor + 8);
    this.buf.writeBigInt64LE(v, this.cursor);
    this.cursor += 8;
  }

  /**
   * Write an 8-byte IEEE 754 little-endian double. Preserves NaN, -0.0, +Infinity,
   * -Infinity, and denormals bit-faithfully (RESEARCH Pitfall 4). Advances the cursor by 8 bytes.
   */
  writeDouble(v: number): void {
    this.ensure(this.cursor + 8);
    this.buf.writeDoubleLE(v, this.cursor);
    this.cursor += 8;
  }

  /** Write a 1-byte boolean (.NET bool: 0 = false, 1 = true). Advances the cursor by 1 byte. */
  writeBool(v: boolean): void {
    this.ensure(this.cursor + 1);
    this.buf.writeUInt8(v ? 1 : 0, this.cursor);
    this.cursor += 1;
  }

  /**
   * Write a 7-bit-length-prefixed UTF-8 string (.NET `BinaryWriter.Write(string)` format).
   * The UTF-8 byte length is encoded as an integer "seven bits at a time" (high bit set
   * means "more bytes follow"), then the UTF-8 body is appended.
   *
   * Boundary behaviour (D-14 / RESEARCH Pitfall 5): the prefix flips from 1 byte to 2 at
   * len=128, and from 2 to 3 at len=16384 — pinned by the boundary test vectors.
   *
   * Advances the cursor by (prefix length + UTF-8 body length).
   */
  writeString(s: string): void {
    const body = Buffer.from(s, 'utf8');
    let len = body.length;
    // .NET Write7BitEncodedInt: emit 7 bits at a time, high bit set if more bytes follow.
    const prefix: number[] = [];
    while (len > 0x7f) {
      prefix.push((len & 0x7f) | 0x80);
      len >>>= 7; // unsigned right shift (length is non-negative)
    }
    prefix.push(len & 0x7f);
    this.ensure(this.cursor + prefix.length + body.length);
    for (const b of prefix) {
      this.buf.writeUInt8(b, this.cursor);
      this.cursor += 1;
    }
    body.copy(this.buf, this.cursor);
    this.cursor += body.length;
  }
  // The closing brace of an `export class` is where esbuild source-maps the
  // __export/__toCommonJS/__copyProps interop helper's defensive "key already on target"
  // arm — it never fires for a real require'd module (NOT writer logic). Ignoring this
  // line's coverage excludes only that injected artifact; the class body is fully covered.
  /* c8 ignore next */
}
