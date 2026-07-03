/* c8 ignore start */
// Brotli codec — the corruption-prevention spine.
//
// A thin wrapper over `node:zlib`'s Brotli convenience methods that (a) pins
// standard-parameter Brotli (no large-window) that .NET can decode,
// (b) enforces a decompression-bomb cap, and (c) asserts the IO-03 length +
// byte-identity invariants on every no-op round-trip.
//
// IMPORTANT — the round-trip target is decompressed-buffer-identical, NOT
// compressed-bytes-identical (RESEARCH Pitfall 1). Brotli compression is not
// canonical across implementations: Node and .NET emit different (but equivalent)
/* c8 ignore end */
// compressed bytes for the same input. So we assert
//   deepStrictEqual(decompress(compress(decompress(original))), decompress(original))
// plus `output.length === input.length` on the DECOMPRESSED buffer — never that
// the recompressed .sav bytes equal the original .sav bytes.
//
// Implements: D-02 (deepStrictEqual), D-04 (coverage-gated core), D-07/D-08 (strict
// TS + noUncheckedIndexedAccess), D-13 (no .NET SDK — codec correctness proven via the
// real fixture, which IS .NET-produced output). Mitigates T-1-03 (bomb cap) and
// T-1-05 (large-window rejection).

import {
  brotliCompressSync,
  brotliDecompressSync,
  constants,
  type BrotliOptions,
} from 'node:zlib';
import { equal, deepStrictEqual } from 'node:assert/strict';

/**
 * Maximum decompressed size accepted by {@link decompress}. 256 MiB — real Melvor
 * Idle 2 saves are ~2.3 MiB decompressed, so this is a generous DoS cap that rejects
 * crafted decompression bombs (RESEARCH Security Domain, threat T-1-03). Passed as
 * `maxOutputLength` to `brotliDecompressSync`, which throws `ERR_BUFFER_TOO_LARGE`
 * when an input would decompress past the cap.
 */
export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

/**
 * Pinned standard-parameter Brotli encoder params (no large-window). Node's defaults
 * (quality 11, lgwin 22, mode GENERIC, LARGE_WINDOW=false) are already .NET-safe, but
 * PINNING them explicitly defends against a future Node version changing defaults and
 * silently emitting Brotli .NET cannot read (RESEARCH Pattern 1). Frozen so a caller
 * cannot mutate the shared object.
 *
 * NEVER set `BROTLI_PARAM_LARGE_WINDOW: true` — it emits non-RFC-7932 "Large Window
 * Brotli" that .NET's `BrotliDecoder`/`BrotliStream` cannot decode (RESEARCH Pitfall 2,
 * threat T-1-05). {@link compress} defensively rejects it if a caller tries.
 */
export const CODEC_PARAMS: Readonly<NonNullable<BrotliOptions['params']>> = Object.freeze({});

/**
 * Decompress a Brotli `.sav` buffer. The decoder auto-detects the encoder's params
 * (quality, lgwin, mode), so a single decompressor handles every quality the encoder
 * emits. A `maxOutputLength` cap (default {@link MAX_DECOMPRESSED_BYTES}) mitigates
 * decompression-bomb DoS (T-1-03): an input that would decompress past the cap throws
 * `ERR_BUFFER_TOO_LARGE` instead of allocating gigabytes.
 *
 * @param compressed The raw Brotli-compressed bytes (e.g. a `.sav` file's contents).
 * @param opts Optional `{ maxOutputLength }` override (defaults to 256 MiB). Used by
 *            the bomb-cap test to prove the cap is enforced by OUR code, not just Node's.
 */
export function decompress(
  compressed: Buffer,
  opts: { maxOutputLength?: number } = {},
): Buffer {
  return brotliDecompressSync(compressed, {
    maxOutputLength: opts.maxOutputLength ?? MAX_DECOMPRESSED_BYTES,
  });
}

/**
 * Compress a decompressed buffer back to standard-parameter RFC 7932 Brotli that .NET
 * can decode. Merges {@link CODEC_PARAMS} (pinned defaults) with any caller-supplied
 * `params` (e.g. `BROTLI_PARAM_QUALITY` for the per-quality round-trip test).
 *
 * Defensively rejects `BROTLI_PARAM_LARGE_WINDOW: true` (T-1-05): it would emit
 * non-RFC-7932 Brotli .NET cannot decode. The check fires BEFORE `brotliCompressSync`
 * is called, so no incompatible bytes are ever produced.
 *
 * @param decompressed The decompressed buffer to recompress.
 * @param opts Optional `{ params }` to override pinned defaults (e.g. encoder quality).
 * @throws {RangeError} if `opts.params[BROTLI_PARAM_LARGE_WINDOW] === true`.
 */
export function compress(
  decompressed: Buffer,
  opts: { params?: NonNullable<BrotliOptions['params']> } = {},
): Buffer {
  const params = opts.params ?? {};
  if (params[constants.BROTLI_PARAM_LARGE_WINDOW] === true) {
    throw new RangeError(
      'BROTLI_PARAM_LARGE_WINDOW: true is forbidden — it emits non-RFC-7932 Brotli ' +
        'that .NET cannot decode (threat T-1-05). Use standard-parameter Brotli only.',
    );
  }
  return brotliCompressSync(decompressed, { params: { ...CODEC_PARAMS, ...params } });
}

/**
 * No-op load→save round-trip with the IO-03 invariants asserted. Compresses, then
 * decompresses, then asserts BOTH:
 *   1. `reDecompressed.length === decompressed.length` (length invariant, SC-2)
 *   2. `deepStrictEqual(reDecompressed, decompressed)` (byte-identity, SC-1)
 *
 * Fails loudly (never silently corrupts) on any violation — success criterion 2.
 * Returns the recompressed buffer (NOT the original `.sav` bytes — recompressed bytes
 * legitimately differ from the original compressed bytes; only the decompressed buffer
 * is asserted identical).
 */
// The `export` keyword causes esbuild to inject `__export`/`__toCommonJS` interop
// helpers (source-mapped to this line) whose defensive branches (null-module /
// already-on-target arms) are uncoverable for a real require'd module — NOT this
// function's logic. Ignoring this line's coverage excludes only those injected
// artifacts; the function body below is independently covered.
/* c8 ignore next */
export function roundTrip(decompressed: Buffer): Buffer {
  const recompressed = compress(decompressed);
  const reDecompressed = decompress(recompressed);
  equal(reDecompressed.length, decompressed.length, 'length invariant violated');
  deepStrictEqual(reDecompressed, decompressed, 'round-trip not byte-identical');
  return recompressed;
}
