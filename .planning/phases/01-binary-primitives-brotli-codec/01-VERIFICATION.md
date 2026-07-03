---
phase: 01-binary-primitives-brotli-codec
verified: 2026-07-03T22:15:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Binary Primitives + Brotli Codec Verification Report

**Phase Goal:** A pure-TS format core can losslessly Brotli round-trip a real save and read/write every little-endian primitive with correct width — proven headless before any Electron exists.
**Verified:** 2026-07-03T22:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal decomposes into four ROADMAP Success Criteria (the IO-03 contract), plus two goal-clause invariants: "proven headless before any Electron exists" and the cross-cutting strict-typecheck constraint. Every one is backed by source I read and by gates I re-ran in my own process (not SUMMARY claims).

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | SC-1: `compress(decompress(original))` decompresses back byte-identical using standard-parameter Brotli (no large-window) .NET can read | ✓ VERIFIED | `src/codec.ts` `compress`/`decompress` wrap `node:zlib` with frozen `CODEC_PARAMS = Object.freeze({})` (Node defaults, no large-window) and defensively reject `BROTLI_PARAM_LARGE_WINDOW`. `test/codec.test.ts` "IO-03 SC-1" + per-quality [0,4,6,9,11] `deepStrictEqual(reDecompressed, decompressed)` on the real fixture. **Ran the suite: 54/54 pass.** |
| 2 | SC-2: no-op load→save yields a byte-identical decompressed buffer AND the codec asserts `output.length === input.length`, failing loudly | ✓ VERIFIED | `roundTrip()` asserts `equal(reDecompressed.length, decompressed.length,...)` + `deepStrictEqual(...)` via `node:assert/strict`. Tests "roundTrip throws on invariant violation" mock `brotliCompressSync` to force both a length mismatch and a byte-identity mismatch and assert `roundTrip` throws. Fixture length pinned at 2,284,747. **Ran: pass.** |
| 3 | SC-3: BinaryReader/Writer round-trip int32, int64(BigInt), double, bool, 7-bit-length UTF-8 strings against known .NET bytes — incl. ≥128-byte prefix + multi-byte UTF-8 | ✓ VERIFIED | `src/binary-reader.ts` / `src/binary-writer.ts` delegate to `readInt32LE`/`readBigInt64LE`/`readDoubleLE`/`readUInt8` (int64 as `bigint`). `test/primitives.test.ts` D-14 matrix (int32/int64 min-max, double NaN/±0/±Inf/denormal), 7-bit boundaries 127/128/16383/16384/65536, 4-byte emoji, and **D-12 real `.NET` fixture slices** (version, timestamp, charName "Bob", gamemode "Test") byte-match. **Ran: pass.** |
| 4 | SC-4: all fixed-width reads/writes are little-endian; a wrong-width or wrong-endian write is caught by unit tests, not silent corruption | ✓ VERIFIED | LE-only API — no big-endian method exposed on either class. `writeInt32(1)` → hex `01000000` pinned; "wrong-endian" test asserts LE ≠ BE (`00000001`); "wrong-width" test proves int32-into-int64-slot sign corruption is detectable; OOB reads throw (T-1-04); 7-bit overflow throws (T-1-02). **Ran: pass.** |
| 5 | Goal clause: proven headless before any Electron exists (pure-TS core, no UI/server/network) | ✓ VERIFIED | `package.json` `dependencies: {}` (zero runtime deps); devDeps only `@types/node, c8, tsx, typescript`; `type: commonjs`. `grep -rniE "electron\|react\|vite" src/` → 0 hits. `src/` imports only `node:zlib` + `node:assert/strict` (+ global `Buffer`). Fixture decompresses headlessly: 151,993 B → 2,284,747 B. |
| 6 | Cross-cutting: `tsc --noEmit` passes with strict + noUncheckedIndexedAccess (D-07/D-08) | ✓ VERIFIED | **Ran `npx tsc --noEmit` → exit 0.** `tsconfig.json` has `strict: true` + `noUncheckedIndexedAccess: true` (byte-level OOB safety net); reads use `readUInt8`, never `buf[i]` indexing. |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/codec.ts` | Brotli decompress/compress/roundTrip + frozen CODEC_PARAMS + 256 MiB bomb cap + large-window rejection | ✓ VERIFIED | Substantive (124 lines), wired (imported by `test/codec.test.ts`), data flows (operates on the real fixture). 100% coverage. |
| `src/binary-reader.ts` | LE BinaryReader (int32/int64-BigInt/double/bool/7-bit string) + OOB + 7-bit-overflow guards | ✓ VERIFIED | Substantive (140 lines), wired (imported by `test/primitives.test.ts`), exercised on real fixture slices. 100% coverage. |
| `src/binary-writer.ts` | LE BinaryWriter with on-demand growth, LE-only surface | ✓ VERIFIED | Substantive (143 lines), wired, exercised. 100% coverage. |
| `test/codec.test.ts` | IO-03 SC-1/SC-2 + per-quality + bomb cap + large-window + throw-arm coverage | ✓ VERIFIED | 15 cases, all pass. |
| `test/primitives.test.ts` | D-14 edge matrix + 7-bit boundaries + wrong-width/endian + OOB + D-12 slices | ✓ VERIFIED | 38 cases, all pass. |
| `test/fixtures/test-fixture.sav` | real .NET .sav, valid Brotli, 2,284,747 B decompressed | ✓ VERIFIED | Confirmed: 151,993 B → 2,284,747 B via `brotliDecompressSync`. |

### Behavioral Spot-Checks (gates re-run in this verifier's process)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite | `npx tsx --test test/**/*.test.ts` | tests 54, pass 54, fail 0 | ✓ PASS |
| Strict typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Coverage gate (D-04) | `npx c8 --100 --include 'src/**' --exclude 'test/**' tsx --test test/**/*.test.ts` | 100% stmts/branch/funcs/lines on codec.ts + binary-reader.ts + binary-writer.ts; exit 0 | ✓ PASS |
| Fixture integrity | `brotliDecompressSync(test-fixture.sav).length` | 2,284,747 | ✓ PASS |
| Headless (no Electron/UI) | `grep -rniE 'electron\|react\|vite' src/` + package.json deps | 0 hits; `dependencies: {}` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| IO-03 | 01-02 (`requirements-completed: [IO-03]`) | No-op round-trip of the real `.sav` decompresses byte-identical + `output.length === input.length` length invariant, fail-loud | ✓ SATISFIED | SC-1 + SC-2 above; codec asserts both invariants; throw arms proven by mocked-compress tests. Confirmed by re-run of `test/codec.test.ts`. |

Plans 01-01 and 01-03 correctly declare `requirements-completed: []` — 01-01 only scaffolds the toolchain IO-03 runs on, and 01-03 delivers the SC-3/SC-4 primitives that back later phases without claiming a new roadmap requirement. No orphaned requirements: IO-03 is the sole Phase-1 requirement and it is claimed by 01-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | Debt-marker scan (`TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER`) over `src/` + `test/` returned zero hits. |

The `/* c8 ignore */` comments in all three `src/` files are documented, targeted suppressions of esbuild-injected interop artifacts (`__export`/`__toCommonJS`/`__copyProps` defensive arms), proven via a pure-CJS control probe (01-02 SUMMARY) to be interop code, not logic. They do not suppress any codec/primitive logic — coverage still reports 100% branches. Not an anti-pattern.

### Human Verification Required

None. This is a pure headless TypeScript library with no visual, real-time, or external-service surface. Every success criterion is automated-testable and was exercised by gates re-run in this verifier's own process. UAT (`01-UAT.md`) is already complete: 14/14 passed, 0 issues.

### Gaps Summary

No gaps. All four ROADMAP Success Criteria (the IO-03 contract), the "proven headless before any Electron exists" goal clause, and the strict-typecheck cross-cutting constraint are verified against the codebase with re-run gate evidence.

**Notes (info-level, non-blocking):**

1. **Single-fixture corpus.** SC-1's wording ("every fixture in the real-save corpus") is satisfied by the one committed real `.NET` save. `01-VALIDATION.md` explicitly scopes a multi-save corpus as a deferred Phase 2 dependency ("Phase 1 uses the single committed fixture as BOTH covered and backstop... varied corpus is a deferred Phase 2 dependency"); `STATE.md` carries the same concern forward. The codec is parameter-agnostic, so one real `.NET`-produced fixture proves the round-trip contract. This is a documented, intentional scope decision, not a gap.
2. **Stale "version 17" comment.** `test/codec.test.ts` header comment and `01-01-SUMMARY.md` describe the fixture as "save version 17", but `test/primitives.test.ts` asserts (and the fixture actually contains) version **20** — and that test passes. The code is correct; the "17" is a stale doc comment. Cosmetic only.

---

_Verified: 2026-07-03T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
