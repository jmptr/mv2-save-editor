---
status: complete
phase: 01-binary-primitives-brotli-codec
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-07-03T21:58:00Z
updated: 2026-07-03T21:59:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Supply-chain package legitimacy gate (T-1-SC)
expected: The six npm-view legitimacy checks for tsx/@types/node/typescript/c8 were human-verified against research before install (01-01 D5).
result: pass

### 2. Full-strict TypeScript config (D-08/D-06)
expected: tsconfig.json enforces strict + noUncheckedIndexedAccess; CommonJS module; `tsc --noEmit` exits 0.
result: pass
source: automated
coverage_id: 01-01-D1

### 3. package.json scripts + devDeps (D-06/D-01/D-07)
expected: type=commonjs, test/typecheck scripts present, typescript/tsx/c8/@types/node declared.
result: pass
source: automated
coverage_id: 01-01-D2

### 4. Committed real .sav fixture (D-10/D-11)
expected: test/fixtures/test-fixture.sav present; brotliDecompressSync → 2,284,747 bytes (move did not corrupt).
result: pass
source: automated
coverage_id: 01-01-D3

### 5. Toolchain green (D-01/D-05/D-08)
expected: tsx --test runs node:test, tsc --noEmit passes strict, c8 runs.
result: pass
source: automated
coverage_id: 01-01-D4

### 6. Brotli codec + IO-03 round-trip (IO-03 SC-1)
expected: decompress/compress/roundTrip round-trips the real .sav decompressed-buffer-identical; CODEC_PARAMS frozen; 100% coverage on codec.ts.
result: pass
source: automated
coverage_id: 01-02-D1

### 7. IO-03 length invariant (SC-2)
expected: roundTrip asserts reDecompressed.length === decompressed.length (2,284,747) and throws loudly on violation.
result: pass
source: automated
coverage_id: 01-02-D2

### 8. Large-window Brotli rejection (T-1-05)
expected: compress throws RangeError before brotliCompressSync when BROTLI_PARAM_LARGE_WINDOW: true is passed.
result: pass
source: automated
coverage_id: 01-02-D3

### 9. Decompression-bomb cap (T-1-03)
expected: decompress enforces maxOutputLength (256 MiB); a 1000-byte cap throws ERR_BUFFER_TOO_LARGE; real saves pass.
result: pass
source: automated
coverage_id: 01-02-D4

### 10. LE primitives round-trip on D-14 edge matrix
expected: BinaryReader/Writer round-trip int32/int64(BigInt)/double/bool/7-bit-string across min/max/NaN/-0/Inf/denormal + string 7-bit boundaries + emoji; 100% coverage.
result: pass
source: automated
coverage_id: 01-03-D1

### 11. Little-endian byte order + LE-only API (SC-4/T-1-01)
expected: writeInt32(1) → 01000000 (LE) not 00000001 (BE); wrong-width write detectable; no big-endian methods exposed.
result: pass
source: automated
coverage_id: 01-03-D2

### 12. 7-bit length-prefix boundaries + overflow guard (T-1-02)
expected: 127→7f, 128→8001, 16383→ff7f, 16384→808001; 6-byte prefix + over-length throw RangeError.
result: pass
source: automated
coverage_id: 01-03-D3

### 13. OOB reads throw (T-1-04)
expected: readInt32/readBool past end throw RangeError/ERR_BUFFER_OUT_OF_BOUNDS — never silent undefined.
result: pass
source: automated
coverage_id: 01-03-D4

### 14. D-12 fixture-slice round-trip
expected: real .NET bytes extracted from test-fixture.sav round-trip through BinaryWriter and byte-match.
result: pass
source: automated
coverage_id: 01-03-D5

## Summary

total: 14
passed: 14
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
