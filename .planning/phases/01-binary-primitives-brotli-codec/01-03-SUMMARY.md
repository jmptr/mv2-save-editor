---
phase: 01-binary-primitives-brotli-codec
plan: 03
subsystem: primitives
tags: [binary-reader, binary-writer, little-endian, bigint, 7-bit-length-prefix, round-trip, node-test, strict-ts, c8, dotnet-parity]

# Dependency graph
requires:
  - phase: 01-01 (toolchain + fixture scaffolding)
    provides: "Full-strict tsconfig.json (strict + noUncheckedIndexedAccess), CommonJS package.json + devDeps (tsx/tsc/c8/@types/node), committed test/fixtures/test-fixture.sav (151,993 B compressed → 2,284,747 B decompressed), green tsx --test + tsc --noEmit toolchain"
provides:
  - "LE BinaryReader (src/binary-reader.ts): stateful cursor over a Buffer with readInt32/readInt64(BigInt)/readDouble/readBool/readString + seek/offset; throws on OOB (T-1-04) and malformed 7-bit prefix (T-1-02)"
  - "LE BinaryWriter (src/binary-writer.ts): stateful growable-buffer cursor with writeInt32/writeInt64(BigInt)/writeDouble/writeBool/writeString + toBuffer/offset; grows on demand (never overruns)"
  - "Reader/Writer round-trip on the full D-14 edge matrix (int32 min/max, int64 min/max as BigInt, double NaN/-0/Inf/denormal, string 7-bit boundaries, 4-byte emoji)"
  - "7-bit length-prefix boundary correctness pinned by hex vectors (127→7f, 128→8001, 16383→ff7f, 16384→808001, 65536→808004)"
  - "LE-only API (T-1-01/SC-4): no big-endian methods exposed; wrong-width + wrong-endian negatives assert corruption is detectable"
  - "D-12 fixture-slice round-trip: real .NET bytes extracted from test-fixture.sav round-trip through BinaryWriter and byte-match"
  - "test/primitives.test.ts: 38 node:test cases (D-14 edge matrix + 7-bit boundaries + wrong-width/endian negatives + OOB throws + D-12 fixture slices)"
  - "100% line/statement/function/branch coverage on both src files (D-04 gate)"
affects:
  - "02-parser (Phase 2): consumes BinaryReader sequentially to parse the SaveHeader/entity-list/ActionManager layout (matches the .NET BinaryReader mental model the spec is written in)"
  - "03-patch (Phase 3): consumes BinaryWriter for same-width in-place patching + XP-table writes"

# Tech tracking
tech-stack:
  added: []  # Node built-ins only — Buffer LE read/write + node:test/node:assert/strict; no new deps
  patterns:
    - "LE locked at the API surface — every read/write delegates to Buffer.readInt32LE/readBigInt64LE/readDoubleLE/readUInt8 and writeInt32LE/writeBigInt64LE/writeDoubleLE/writeUInt8; big-endian counterparts are never exposed (T-1-01/SC-4)"
    - "int64 as BigInt (readBigInt64LE/writeBigInt64LE) — no Number precision loss near INT64_MAX/MIN (RESEARCH Pitfall 3), required for GP/Slayer-Coin wallet values"
    - "double bit-faithful — readDoubleLE/writeDoubleLE preserve NaN/-0/Inf/denormals; callers use Object.is not === to distinguish +/-0 (RESEARCH Pitfall 4)"
    - "7-bit length prefix hand-rolled (the one 'DO hand-roll' exception — no canonical Node package) with hard bounds: decode rejects a 6th prefix byte (shift >= 35, >2GiB) with RangeError (T-1-02) and rejects a declared length past the buffer end (no silent subarray truncation)"
    - "OOB reads throw natively — Buffer.readXxxLE/readUInt8 throw ERR_OUT_OF_RANGE/ERR_BUFFER_OUT_OF_BOUNDS; no silent undefined read (T-1-04), satisfies D-08 noUncheckedIndexedAccess via readUInt8 (not buf[i] indexing)"
    - "Writer grows by doubling (min 64) via ensure() before every typed write — a write never silently overruns past the end (corruption-prevention guarantee)"
    - "c8 ignore comments on the file-header + closing-brace lines suppress esbuild-injected __export/__copyProps interop artifacts (NOT reader/writer logic) — same pattern established in 01-02, keeps --100 branch gate achievable"

key-files:
  created:
    - "src/binary-reader.ts — stateful LE BinaryReader (readInt32/readInt64/readDouble/readBool/readString + seek/offset) with OOB + 7-bit-overflow guards"
    - "src/binary-writer.ts — stateful LE BinaryWriter (writeInt32/writeInt64/writeDouble/writeBool/writeString + toBuffer/offset) with on-demand growth"
    - "test/primitives.test.ts — 38 node:test cases: D-14 edge matrix, 7-bit boundary hex vectors, wrong-width/wrong-endian negatives, OOB throws, D-12 fixture slices"
  modified: []

key-decisions:
  - "int64 exposed as BigInt end-to-end (readInt64(): bigint / writeInt64(v: bigint)) — mandatory for GP/Slayer Coins which exceed 2^53; Number would silently lose precision (RESEARCH Pitfall 3, PROJECT constraint)"
  - "readString bounds-checks the declared length against the remaining buffer and throws RangeError rather than returning a truncated subarray — a malformed/oversized prefix must fail loudly, never silently corrupt (T-1-02)"
  - "7-bit prefix decode caps at 5 bytes (shift >= 35) — a 6th byte would let the << wrap past 32 bits and produce a corrupt length; rejected with RangeError (T-1-02)"
  - "Writer buffer grows by doubling via a private ensure() guard called before every write — no caller pre-sizing needed and no code path writes past the end (corruption-prevention spine)"
  - "D-12 fixture-slice test decompresses the fixture inline (brotliDecompressSync) rather than importing the codec module — keeps Plan 03 self-contained and preserves Wave 1 parallelism with Plan 02 (the slice test only needs the decompressed buffer)"
  - "Applied the same esbuild-interop c8-ignore pattern from 01-02 (file-header block + closing-brace /* c8 ignore next */) to hit the D-04 --100 branch gate — suppresses only injected __export/__copyProps arms, not primitive logic"

patterns-established:
  - "Primitive API shape: BinaryReader(buf) with read{Int32,Int64,Double,Bool,String}() + seek/offset; BinaryWriter(capacity?) with write{Int32,Int64,Double,Bool,String}() + toBuffer/offset — the sequential .NET BinaryReader/Writer mental model Phase 2/3 consume"
  - "Round-trip proof shape: writeX(v) → new BinaryReader(writer.toBuffer()).readX() === v across the full D-14 edge matrix, plus D-12 real-fixture slices byte-matching"
  - "LE-only surface as a corruption guard: no big-endian method exists to call by accident; the SC-4 negative test asserts LE (01000000) differs from BE (00000001) so a future regression is caught loudly"
  - "Coverage-gate discipline carried from 01-02: 100% lines+branches on corruption-critical core, esbuild interop suppressed via targeted c8 ignore, threshold never lowered"

requirements-completed: []  # IO-03 was completed by 01-02; Plan 03 delivers the primitives that back the parser/patcher — no new roadmap requirement is claimed here

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "LE BinaryReader/Writer primitives (int32/int64-BigInt/double/bool/7-bit-string) round-trip across the full D-14 edge matrix"
    verification:
      - kind: unit
        ref: "test/primitives.test.ts#int32/int64/double/bool round-trip (min/max/NaN/-0/Inf/denormal edges)"
        status: pass
      - kind: unit
        ref: "test/primitives.test.ts#string round-trip at 7-bit boundaries (len 0/1/127/128/16383/16384 + 4-byte emoji)"
        status: pass
      - kind: other
        ref: "npx c8 --100 --include 'src/binary-reader.ts' --include 'src/binary-writer.ts' --exclude 'test/**' tsx --test test/primitives.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess, D-07/D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Little-endian byte order enforced: writeInt32(1) → 01000000 not 00000001 (SC-4); LE-only API"
    verification:
      - kind: unit
        ref: "test/primitives.test.ts#wrong-endian write caught (SC-4): LE (01000000) differs from BE (00000001)"
        status: pass
      - kind: unit
        ref: "test/primitives.test.ts#wrong-width write caught (SC-4/T-1-01): int32 into an int64 slot is detectable"
        status: pass
    human_judgment: false
  - id: D3
    description: "7-bit length-prefix boundaries + overflow guard (T-1-02): 127→7f, 128→8001, 16383→ff7f, 16384→808001; 6-byte prefix + over-length throw RangeError"
    verification:
      - kind: unit
        ref: "test/primitives.test.ts#7-bit boundary hex vectors match"
        status: pass
      - kind: unit
        ref: "test/primitives.test.ts#7-bit length-prefix overflow throws (T-1-02): 6-byte prefix + declared-length-past-buffer both throw RangeError"
        status: pass
    human_judgment: false
  - id: D4
    description: "OOB reads throw, never silent undefined (T-1-04)"
    verification:
      - kind: unit
        ref: "test/primitives.test.ts#out-of-bounds read throws (T-1-04): readInt32/readBool past end throw RangeError/ERR_BUFFER_OUT_OF_BOUNDS"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-12 fixture-extracted real .NET slices round-trip through BinaryWriter and byte-match"
    verification:
      - kind: unit
        ref: "test/primitives.test.ts#D-12 fixture slices round-trip (real bytes from test-fixture.sav)"
        status: pass
    human_judgment: false

# Metrics
duration: 13min
completed: 2026-07-03
status: complete
---

# Phase 1 Plan 03: LE Binary Primitives Summary

**Little-endian BinaryReader + BinaryWriter mirroring .NET BinaryReader/BinaryWriter — int32/int64(BigInt)/double/bool/7-bit-length-prefixed UTF-8 strings — round-tripped across the full D-14 edge matrix and real D-12 fixture slices, with LE-only surface (SC-4), 7-bit-overflow (T-1-02) and OOB (T-1-04) guards, at 100% line+branch coverage under strict TS.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-03T13:36:19-07:00 (first RED test commit)
- **Completed:** 2026-07-03T13:49:17-07:00 (coverage + typecheck gate commit)
- **Tasks:** 2 (Task 1 TDD RED→GREEN positive round-trips; Task 2 negative tests + coverage/typecheck gates)
- **Files created:** 3 (src/binary-reader.ts, src/binary-writer.ts, test/primitives.test.ts)

## Accomplishments

- **src/binary-reader.ts** — `BinaryReader` class: stateful cursor over a `Buffer` with `readInt32` (4B), `readInt64(): bigint` (8B, no precision loss), `readDouble` (8B IEEE 754, bit-faithful), `readBool` (1B), and `readString` (7-bit-length-prefixed UTF-8), plus `seek`/`offset` for testability. Every read delegates to a `Buffer.readXxxLE`/`readUInt8` (LE-only). OOB reads throw natively (T-1-04); a malformed 7-bit prefix (6th byte, shift ≥ 35) or a declared length past the buffer end throws `RangeError` (T-1-02).
- **src/binary-writer.ts** — `BinaryWriter` class: stateful cursor over an internal growable Buffer with `writeInt32`/`writeInt64(bigint)`/`writeDouble`/`writeBool`/`writeString`, plus `toBuffer`/`offset`. A private `ensure()` grows the buffer by doubling (min 64) before every write, so no code path overruns past the end. LE-only surface — no big-endian methods exposed or re-exported (T-1-01/SC-4).
- **D-14 edge matrix proven**: int32 min/max, int64 min/max as BigInt (`-9223372036854775808n`/`9223372036854775807n`), double NaN/-0/+Inf/-Inf/denormal (`5e-324`), and strings at every 7-bit boundary (0/1/127/128/16383/16384) plus a 4-byte emoji all round-trip `writeX → toBuffer → readX`.
- **7-bit boundary hex vectors pinned**: 127→`7f`, 128→`8001`, 16383→`ff7f`, 16384→`808001`, 65536→`808004` — asserted on the actual written bytes.
- **SC-4 negatives**: `writeInt32(1)` produces `01000000` (LE), distinct from `00000001` (BE); a wrong-width write (int32 into an int64 slot) is detectable as sign corruption. The LE-only API means a big-endian regression cannot even be written without being caught.
- **T-1-02 guards**: a 6-byte prefix (`0x80 ×5 + 0x01`) and a declared-length-greater-than-remaining-buffer both throw `RangeError` in `readString`.
- **T-1-04 guards**: `readInt32`/`readBool` past the end throw `RangeError`/`ERR_BUFFER_OUT_OF_BOUNDS` — never a silent undefined read.
- **D-12 fixture slices**: real .NET bytes extracted at known offsets from `test/fixtures/test-fixture.sav` (decompressed inline via `brotliDecompressSync`) round-trip through `BinaryWriter` and byte-match.
- **D-04 coverage gate satisfied**: `npx c8 --100 --include 'src/binary-reader.ts' --include 'src/binary-writer.ts' --exclude 'test/**' tsx --test test/primitives.test.ts` → 100% lines/statements/functions/branches on both files.
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + `noUncheckedIndexedAccess` unchanged; reads use `readUInt8`, never `buf[i]` indexing).

## Task Commits

TDD: RED positive tests → GREEN implementation → negative tests + coverage/typecheck gates.

1. **Task 1 RED: failing round-trip + fixture-slice tests** — `a63f0de` (test) — test/primitives.test.ts (325 lines; src files absent → the expected RED state)
2. **Task 1 GREEN: implement LE BinaryReader + BinaryWriter** — `b46945d` (feat) — src/binary-reader.ts + src/binary-writer.ts (271 lines); positive round-trips green
3. **Task 2: negative tests + coverage gate + typecheck gate** — `7ff00f2` (test) — added wrong-width/wrong-endian/OOB/7-bit-overflow negatives (144 lines) + c8-ignore refinements to both src files (esbuild interop artifacts); 38/38 tests green, c8 100/100/100/100, tsc clean

## Files Created/Modified

- `src/binary-reader.ts` (created) — LE `BinaryReader` with OOB + 7-bit-overflow guards.
- `src/binary-writer.ts` (created) — LE `BinaryWriter` with on-demand growth.
- `test/primitives.test.ts` (created) — 38 node:test cases (D-14 matrix, 7-bit hex vectors, SC-4 negatives, OOB throws, D-12 slices).

## Decisions Made

- **int64 as BigInt end-to-end** — `readInt64(): bigint` / `writeInt64(v: bigint)` via `readBigInt64LE`/`writeBigInt64LE`. GP and Slayer Coins exceed 2^53; `Number` would silently lose precision (RESEARCH Pitfall 3, a PROJECT constraint).
- **`readString` fails loudly on a bad length** — bounds-checks the declared length against the remaining buffer and throws `RangeError` rather than returning a truncated `subarray`. Corruption must never be silent.
- **7-bit prefix caps at 5 bytes** — a 6th byte (shift ≥ 35) would let the `<<` wrap past 32 bits and yield a corrupt length; rejected with `RangeError` (T-1-02).
- **Writer grows on demand** — a private `ensure()` doubles the buffer (min 64) before every write, so callers never pre-size and no path writes past the end (the corruption-prevention guarantee this phase delivers).
- **D-12 slice test decompresses the fixture inline** (not via the codec module) — keeps Plan 03 self-contained and preserves Wave 1 parallelism with Plan 02.
- **Reused 01-02's esbuild-interop c8-ignore pattern** — targeted `/* c8 ignore */` on the file-header comment + the class's closing brace suppresses only the injected `__export`/`__copyProps` defensive arms (source-mapped there), not primitive logic; the `--100` threshold was not lowered.

## Deviations from Plan

None material. Implementation followed the plan's `must_haves` and behavior blocks directly. The only non-obvious addition was carrying forward the esbuild-interop `c8 ignore` technique already established and justified in 01-02 (proven via a pure-CJS control there) to satisfy the D-04 `--100` branch gate under the tsx/esbuild toolchain — no threshold change, no logic excluded.

## Issues Encountered

- **esbuild (tsx) interop branches vs. the `--100` branch gate** — same class of artifact documented in 01-02: `export class` syntax triggers `__export`/`__toCommonJS`/`__copyProps` whose defensive "key already on target" arm never fires for a real require'd module. Suppressed with targeted `/* c8 ignore */` on the header + closing-brace lines (source-map targets); primitive logic remains fully tracked and covered (100% on all metrics).

## Authentication Gates

None — pure local library, no auth/session/network surface.

## User Setup Required

None — Node built-ins only (Buffer, node:test, node:assert/strict, node:fs, node:zlib for the inline fixture decompress). Fixture committed at test/fixtures/test-fixture.sav (D-10).

## Next Phase Readiness

- **Phase 1 primitives are COMPLETE** — BinaryReader/Writer round-trip the full D-14 edge matrix + real D-12 fixture slices, with LE-only surface (SC-4), 7-bit-overflow (T-1-02), and OOB (T-1-04) guards, 100% covered under strict TS. Together with 01-02's codec (IO-03), the pure-format core spine of Phase 1 is proven byte-exact.
- **Phase 2 (parser/FieldTable)** can now consume `BinaryReader` sequentially to parse the documented layout (`[int32 version][SaveHeader][entity list][ActionManager][RNG][favourites][EventLog]`), and `BinaryWriter` backs Phase 3's same-width patch engine. The reader matches the .NET mental model `docs/current-skill.md` is written in.
- **Carried concern for Phase 2** (unchanged): exact Bank-wallet offset (`Walleta` marker), entity-region boundary detection, and item-stack context-validation heuristics still need pinning against a real fixture corpus before parsing work begins.
- **No blockers.**

---
*Phase: 01-binary-primitives-brotli-codec*
*Completed: 2026-07-03*

## Self-Check: PASSED

- src/binary-reader.ts — FOUND
- src/binary-writer.ts — FOUND
- test/primitives.test.ts — FOUND
- Commit a63f0de (RED) — FOUND in git log
- Commit b46945d (GREEN) — FOUND in git log
- Commit 7ff00f2 (negatives + gates) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- Gates re-verified green: `npx tsx --test test/primitives.test.ts` (38 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/binary-reader.ts' --include 'src/binary-writer.ts' --exclude 'test/**' tsx --test test/primitives.test.ts` (100% lines/statements/functions/branches, exit 0)
