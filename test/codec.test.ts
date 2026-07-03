// Codec test suite — the IO-03 proof.
//
// Proves: (SC-1) a no-op load→save round-trips a real .sav to a byte-identical
// *decompressed* buffer; (SC-2) the length invariant (output.length === input.length)
// holds; per-quality round-trips stay decompressed-buffer-identical across encoder
// qualities 0/4/6/9/11; the large-window Brotli param is defensively rejected (T-1-05);
// the decompression-bomb cap is enforced (T-1-03); decompress is idempotent; and
// roundTrip throws loudly when the length invariant is violated.
//
// Per RESEARCH Pitfall 1, the target is decompressed-buffer-identical, NEVER
// compressed-bytes-identical (Node and .NET emit different compressed bytes for the
// same input — that is expected and explicitly NOT asserted).
//
// Implements decisions D-02 (deepStrictEqual), D-09/D-11 (single fixture, decompress at
// runtime), D-13 (no .NET SDK — fixture slices ARE the .NET-compatibility proof).

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import {
  compress,
  decompress,
  roundTrip,
  CODEC_PARAMS,
  MAX_DECOMPRESSED_BYTES,
} from '../src/codec';

// The single committed real .NET-produced Melvor Idle 2 save (save version 17 = Alpha
// 0.9.1). 151,993 compressed bytes → 2,284,747 decompressed bytes (D-09/D-10/D-11).
// Read-only — tests decompress it at runtime (D-11 — exercises the code under test).
const FIXTURE_PATH = 'test/fixtures/test-fixture.sav';
const fixtureCompressed: Buffer = readFileSync(FIXTURE_PATH);

// The BROTLI_PARAM_* constants live on zlib.constants (NOT as top-level named exports
// of node:zlib — Rule 3 auto-fix: the plan's `BROTLI_PARAM_LARGE_WINDOW` named import
// does not exist in the Node 24 API).
const LARGE_WINDOW = zlib.constants.BROTLI_PARAM_LARGE_WINDOW; // 6
const QUALITY = zlib.constants.BROTLI_PARAM_QUALITY; // 1

describe('IO-03 SC-1: real fixture round-trips decompressed-buffer-identical', () => {
  test('decompress → compress → decompress yields a byte-identical decompressed buffer', () => {
    const decompressed = decompress(fixtureCompressed); // 2,284,747 B
    const recompressed = compress(decompressed); // Node default quality 11
    const reDecompressed = decompress(recompressed);

    // SC-1: byte-identity of the DECOMPRESSED buffer (D-02 deepStrictEqual compares
    // Buffer contents natively with a built-in diff on failure).
    assert.deepStrictEqual(reDecompressed, decompressed, 'round-trip not byte-identical');
  });
});

describe('IO-03 SC-2: length invariant', () => {
  test('roundTrip asserts reDecompressed.length === decompressed.length (2,284,747)', () => {
    const decompressed = decompress(fixtureCompressed);

    // roundTrip() internally asserts both the length invariant and byte-identity; if
    // it returns without throwing, the invariants hold (success criterion 2: fail
    // loudly, never silently corrupt).
    const recompressed = roundTrip(decompressed);
    const reDecompressed = decompress(recompressed);

    // Pin the exact decompressed size for save version 17 — a regression in the codec
    // or fixture would surface here.
    assert.equal(decompressed.length, 2_284_747, 'expected decompressed size for the committed fixture');
    assert.equal(reDecompressed.length, decompressed.length, 'length invariant violated');
  });
});

describe('per-quality round-trip (decompressed-buffer-identical across qualities)', () => {
  // Brotli compression is not canonical across qualities — the *compressed* bytes
  // differ per quality, but the *decompressed* buffer MUST be byte-identical regardless
  // of encoder quality. This proves decompressed-buffer-identity, NOT compressed-bytes-
  // identity (RESEARCH Pitfall 1).
  for (const quality of [0, 4, 6, 9, 11] as const) {
    test(`quality ${quality} round-trips decompressed-buffer-identical`, () => {
      const decompressed = decompress(fixtureCompressed);
      const recompressed = compress(decompressed, { params: { [QUALITY]: quality } });
      const reDecompressed = decompress(recompressed);
      assert.deepStrictEqual(reDecompressed, decompressed, `quality ${quality} not byte-identical`);
    });
  }
});

describe('large-window rejected (T-1-05)', () => {
  test('compress throws RangeError when the large-window param is true', () => {
    const buf = Buffer.alloc(64, 0x42);
    // Defensive rejection — never emits non-RFC-7932 Brotli that .NET cannot decode
    // (RESEARCH Pitfall 2).
    assert.throws(
      () => compress(buf, { params: { [LARGE_WINDOW]: true } }),
      (err: unknown) => err instanceof RangeError && /LARGE_WINDOW/i.test(String(err)),
      'compress must reject the large-window param',
    );
  });

  test('CODEC_PARAMS is frozen and excludes the large-window key', () => {
    assert.equal(Object.isFrozen(CODEC_PARAMS), true, 'CODEC_PARAMS must be frozen');
    assert.equal(
      CODEC_PARAMS[LARGE_WINDOW],
      undefined,
      'CODEC_PARAMS must NOT pin the large-window param',
    );
  });
});

describe('decompression bomb capped (T-1-03)', () => {
  test('decompress throws when maxOutputLength is set below the fixture decompressed size', () => {
    // The fixture decompresses to 2,284,747 bytes; a 1,000-byte cap must reject it.
    // Proves the cap is enforced by OUR decompress (not just Node's).
    assert.throws(
      () => decompress(fixtureCompressed, { maxOutputLength: 1000 }),
      /ERR_BUFFER_TOO_LARGE/,
      'decompress must enforce the maxOutputLength cap',
    );
  });

  test('MAX_DECOMPRESSED_BYTES === 256 MiB (the DoS cap)', () => {
    assert.equal(MAX_DECOMPRESSED_BYTES, 256 * 1024 * 1024);
  });

  test('the default cap (256 MiB) lets real saves (~2.3 MiB decompressed) pass', () => {
    const decompressed = decompress(fixtureCompressed); // uses MAX_DECOMPRESSED_BYTES by default
    assert.equal(decompressed.length, 2_284_747, 'real save decompresses under the default cap');
  });
});

describe('idempotent decompress', () => {
  test('decompress(compress(decompress(fixture))) deepStrictEqual decompress(fixture)', () => {
    const first = decompress(fixtureCompressed);
    const recompressed = compress(first);
    const second = decompress(recompressed);
    assert.deepStrictEqual(second, first, 'idempotent decompress failed');
  });
});

describe('roundTrip throws on length-invariant violation', () => {
  test('a length mismatch causes roundTrip to throw loudly (never silently corrupt)', () => {
    const decompressed = decompress(fixtureCompressed);

    // Real Brotli is lossless, so a length violation cannot occur naturally. To prove the
    // invariant's assert actually fires when violated, stub brotliCompressSync to return
    // a compressed stream of a TRUNCATED buffer — decompress(recompressed).length will
    // then be < decompressed.length, tripping the assert.equal length check in roundTrip.
    const truncated = decompressed.subarray(0, decompressed.length - 100);
    const shortCompressed = zlib.brotliCompressSync(truncated);

    // mock.method on the default-imported zlib (the CJS module.exports object) propagates
    // to codec.ts's call site (verified empirically).
    mock.method(zlib, 'brotliCompressSync', () => shortCompressed);
    try {
      assert.throws(
        () => roundTrip(decompressed),
        (err: unknown) => /length invariant/i.test(String(err)),
        'roundTrip must throw loudly when the length invariant is violated',
      );
    } finally {
      mock.restoreAll();
    }

    // Sanity: after restore, roundTrip works again (the mock did not leak).
    const ok = roundTrip(decompressed);
    assert.ok(ok.length > 0, 'roundTrip works again after mock restore');
  });
});
