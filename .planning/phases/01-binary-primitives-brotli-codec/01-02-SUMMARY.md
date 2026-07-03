---
phase: 01-binary-primitives-brotli-codec
plan: 02
subsystem: codec
tags: [brotli, zlib, codec, round-trip, length-invariant, node-test, typescript, strict-ts, c8, decompression-bomb]

# Dependency graph
requires:
  - phase: 01-01 (toolchain + fixture scaffolding)
    provides: "Full-strict tsconfig.json (strict + noUncheckedIndexedAccess), CommonJS package.json + devDeps (tsx/tsc/c8/@types/node), committed test/fixtures/test-fixture.sav (151,993 B compressed → 2,284,747 B decompressed), green tsx --test + tsc --noEmit toolchain"
provides:
  - "Brotli codec src/codec.ts: decompress/compress/roundTrip + CODEC_PARAMS (frozen, no large-window) + MAX_DECOMPRESSED_BYTES (256 MiB DoS cap)"
  - "IO-03 proof: no-op load→save round-trips the real .sav to a byte-identical DECOMPRESSED buffer with the length invariant (output.length === input.length) asserted — proven on the committed fixture"
  - "Defensive large-window Brotli param rejection (T-1-05) — never emits non-RFC-7932 Brotli .NET cannot decode"
  - "Decompression-bomb cap (T-1-03) — maxOutputLength: 256 MiB rejects crafted oversized inputs"
  - "test/codec.test.ts: 15 tests covering SC-1/SC-2/per-quality/bomb-cap/large-window/idempotent/throw-on-violation"
  - "100% line + statement + function + branch coverage on src/codec.ts (D-04 gate satisfied)"
affects:
  - "02-parser (Phase 2): consumes decompress/compress to load + write .sav bytes"
  - "03-patch (Phase 3): consumes the codec for non-destructive write-to-new-file"
  - "04-electron (Phase 4): wraps the sync codec in the Electron main process IPC"
  - "03-primitives (Plan 03, Wave 1 sibling): independent — runs against the same tsconfig + fixture"

# Tech tracking
tech-stack:
  added: []  # uses Node built-in node:zlib + node:assert/strict only — no new deps
  patterns:
    - "Decompressed-buffer-identical round-trip (NOT compressed-bytes-identical) — Brotli is non-canonical across encoders; assert deepStrictEqual(decompress(compress(decompress(original))), decompress(original)) + length invariant (RESEARCH Pitfall 1)"
    - "Defensive param rejection — compress rejects BROTLI_PARAM_LARGE_WINDOW: true BEFORE calling brotliCompressSync, so no .NET-incompatible bytes are ever produced (T-1-05)"
    - "Decompression-bomb cap — decompress passes maxOutputLength: MAX_DECOMPRESSED_BYTES (256 MiB) to brotliDecompressSync; real saves ~2.3 MiB pass, bombs throw ERR_BUFFER_TOO_LARGE (T-1-03)"
    - "Pinned CODEC_PARAMS (frozen empty object = Node defaults: quality 11, lgwin 22, GENERIC, no large-window) — defends against future Node default changes (RESEARCH Pattern 1)"
    - "Fail-loud invariants — roundTrip uses node:assert/strict equal + deepStrictEqual so any length or byte-identity violation throws loudly (never silently corrupts, SC-2)"
    - "c8 ignore comments to suppress esbuild-injected __toESM/__copyProps interop helper defensive branches (NOT codec logic) — keeps --100 branch gate achievable with ESM-syntax source"

key-files:
  created:
    - "src/codec.ts — Brotli codec (decompress/compress/roundTrip + CODEC_PARAMS + MAX_DECOMPRESSED_BYTES) with length invariant + bomb cap + large-window rejection"
    - "test/codec.test.ts — 15 node:test cases: IO-03 SC-1/SC-2, per-quality [0,4,6,9,11], T-1-05 large-window, T-1-03 bomb cap, idempotent, roundTrip-throws-on-violation"
  modified: []

key-decisions:
  - "Accessed Brotli param constants via `constants.BROTLI_PARAM_LARGE_WINDOW` / `constants.BROTLI_PARAM_QUALITY` (zlib.constants), NOT as named exports of node:zlib — the plan's `import { BROTLI_PARAM_LARGE_WINDOW } from 'node:zlib'` does not exist in the Node 24 API (Rule 3 auto-fix)"
  - "Used named imports for both node:zlib and node:assert/strict (not default imports) — eliminates esbuild's __toESM interop helper, whose defensive mod==null and !isNodeMode/__esModule arms are uncoverable for require'd built-ins (Rule 3 auto-fix for the D-04 branch gate)"
  - "Added targeted `/* c8 ignore */` comments around the file header + the `export function roundTrip` line to suppress the residual esbuild __copyProps defensive arm (mapped there by the source map) — proven via a pure-CJS probe that codec logic scores 100/100/100/100 with zero injected helpers (Rule 3 auto-fix)"
  - "Made decompress accept an optional `{ maxOutputLength }` override (default MAX_DECOMPRESSED_BYTES) so the bomb-cap mechanism is testable by OUR code — the plan's `decompress(compressed: Buffer): Buffer` signature was under-specified relative to its own behavior block (\"decompress with maxOutputLength set below the fixture decompressed size throws\") (Rule 2 auto-fix)"
  - "Did NOT assert compressed-bytes-identical (recompressed !== original .sav) — Brotli is non-canonical across encoders; only decompressed-buffer-identity + length invariant are asserted (RESEARCH Pitfall 1, locked)"
  - "Mocked brotliCompressSync via node:test's mock.method on the default-imported zlib object to exercise roundTrip's throw arms — real Brotli is lossless so the invariant can't naturally violate; the mock propagates because codec uses live property access (verified empirically)"
  - "Did NOT lower the c8 threshold (D-04 is a gate) — achieved 100% on ALL metrics (lines/statements/functions/branches) via named imports + targeted c8 ignore comments for esbuild interop artifacts"

patterns-established:
  - "Codec API shape: decompress(compressed, opts?) / compress(decompressed, opts?) / roundTrip(decompressed) — thin wrappers over node:zlib with pinned CODEC_PARAMS + MAX_DECOMPRESSED_BYTES cap"
  - "Round-trip target: decompressed-buffer-identical + length invariant (NEVER compressed-bytes-identical) — the single most common implementation trap, locked by tests"
  - "Coverage-gate discipline: 100% lines + branches on corruption-critical core (D-04); esbuild interop artifacts suppressed via c8 ignore, NOT by lowering the threshold"
  - "Bomb-cap testability: decompress accepts an optional maxOutputLength override so the cap is provably enforced by OUR code (not just Node's)"

requirements-completed: [IO-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Brotli compress/decompress/roundTrip + CODEC_PARAMS (frozen, no large-window) + MAX_DECOMPRESSED_BYTES (256 MiB cap) in src/codec.ts"
    requirement: IO-03
    verification:
      - kind: unit
        ref: "test/codec.test.ts#IO-03 SC-1: real fixture round-trips decompressed-buffer-identical"
        status: pass
      - kind: unit
        ref: "test/codec.test.ts#per-quality round-trip (qualities 0,4,6,9,11 all byte-identical)"
        status: pass
      - kind: unit
        ref: "test/codec.test.ts#idempotent decompress"
        status: pass
      - kind: automated
        ref: "npx c8 --100 --include 'src/codec.ts' --exclude 'test/**' tsx --test test/codec.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess, D-07/D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "IO-03 SC-2: length invariant — roundTrip asserts reDecompressed.length === decompressed.length (2,284,747 === 2,284,747) and throws loudly on violation"
    requirement: IO-03
    verification:
      - kind: unit
        ref: "test/codec.test.ts#IO-03 SC-2: length invariant (roundTrip asserts + pinned 2,284,747 size)"
        status: pass
      - kind: unit
        ref: "test/codec.test.ts#roundTrip throws on invariant violation (length-mismatch via mocked brotliCompressSync)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Defensive large-window Brotli param rejection (T-1-05) — compress throws RangeError before brotliCompressSync when BROTLI_PARAM_LARGE_WINDOW: true is passed"
    verification:
      - kind: unit
        ref: "test/codec.test.ts#large-window rejected (T-1-05) (compress throws RangeError; CODEC_PARAMS frozen + excludes the key)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Decompression-bomb cap (T-1-03) — decompress enforces maxOutputLength: MAX_DECOMPRESSED_BYTES (256 MiB); throws ERR_BUFFER_TOO_LARGE below the fixture's 2.3 MiB"
    verification:
      - kind: unit
        ref: "test/codec.test.ts#decompression bomb capped (T-1-03) (maxOutputLength: 1000 throws; default 256 MiB lets real saves pass; MAX_DECOMPRESSED_BYTES === 256*1024*1024)"
        status: pass
    human_judgment: false

# Metrics
duration: 32min
completed: 2026-07-03
status: complete
---

# Phase 1 Plan 02: Brotli Codec Summary

**Brotli codec (compress/decompress/roundTrip) with IO-03 byte-identical round-trip + length invariant on the real .sav, defensive large-window rejection (T-1-05), and 256 MiB decompression-bomb cap (T-1-03) — 100% line+branch coverage gated under strict TS.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-03T19:32:05Z
- **Completed:** 2026-07-03T20:04:11Z
- **Tasks:** 2 (Task 1 TDD RED→GREEN, Task 2 coverage+typecheck gates)
- **Files modified:** 2 (src/codec.ts, test/codec.test.ts)

## Accomplishments

- **src/codec.ts** — Brotli codec: `decompress` (wraps `brotliDecompressSync` with `maxOutputLength: MAX_DECOMPRESSED_BYTES`), `compress` (defensively rejects `BROTLI_PARAM_LARGE_WINDOW: true` BEFORE calling `brotliCompressSync`, merges pinned `CODEC_PARAMS` with caller params), `roundTrip` (asserts both SC-2 length invariant + SC-1 byte-identity via `node:assert/strict`). `CODEC_PARAMS` is a frozen empty object (Node defaults: quality 11, lgwin 22, GENERIC, no large-window). `MAX_DECOMPRESSED_BYTES` = 256 MiB.
- **IO-03 SC-1 proven**: `decompress(compress(decompress(fixture)))` is byte-identical (`deepStrictEqual`) to `decompress(fixture)` on the committed real .NET .sav (151,993 B compressed → 2,284,747 B decompressed). Asserts decompressed-buffer-identity, NOT compressed-bytes-identity (RESEARCH Pitfall 1).
- **IO-03 SC-2 proven**: `roundTrip` asserts `reDecompressed.length === decompressed.length` (2,284,747 === 2,284,747) + `deepStrictEqual` on every no-op load→save; fails loudly (never silently corrupts).
- **T-1-05 mitigated**: `compress` throws `RangeError` when `BROTLI_PARAM_LARGE_WINDOW: true` is passed — never emits non-RFC-7932 Brotli .NET cannot decode. `CODEC_PARAMS` is frozen and excludes the key.
- **T-1-03 mitigated**: `decompress` enforces `maxOutputLength: MAX_DECOMPRESSED_BYTES` (256 MiB); a 1,000-byte cap throws `ERR_BUFFER_TOO_LARGE` on the fixture (proves the cap is enforced by OUR code). Real saves (~2.3 MiB) pass the default cap.
- **Per-quality round-trip**: qualities 0/4/6/9/11 all produce decompressed-buffer-identical output (compressed sizes differ — 195,577 / 152,799 / 133,556 / 131,682 / 115,832 B — expected and NOT asserted).
- **D-04 coverage gate satisfied**: `npx c8 --100 --include 'src/codec.ts' --exclude 'test/**' tsx --test test/codec.test.ts` → 100% lines / statements / functions / branches on src/codec.ts.
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + `noUncheckedIndexedAccess` unchanged).

## Task Commits

Each task was committed atomically (TDD: RED test → GREEN implementation → coverage gate):

1. **Task 1 RED: add failing codec test suite** — `f00ca63` (test) — test/codec.test.ts (15 behavior-block tests; src/codec.ts absent → MODULE_NOT_FOUND, the expected RED state)
2. **Task 1 GREEN: implement Brotli codec** — `7555b40` (feat) — src/codec.ts (decompress/compress/roundTrip + CODEC_PARAMS + MAX_DECOMPRESSED_BYTES); 14/14 tests green; tsc clean
3. **Task 2: coverage gate (100%) + typecheck gate** — `4fe62ec` (test) — added byte-identity-violation test (covers deepStrictEqual throw arm); codec.ts switched to named imports (eliminates esbuild `__toESM`) + targeted `/* c8 ignore */` for residual `__copyProps` arm; 15/15 tests green; c8 100/100/100/100; tsc clean

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `src/codec.ts` (created) — Brotli codec: decompress (bomb cap), compress (large-window rejection), roundTrip (length + byte-identity invariants), CODEC_PARAMS (frozen, no large-window), MAX_DECOMPRESSED_BYTES (256 MiB). Named imports from node:zlib + node:assert/strict (no esbuild `__toESM`).
- `test/codec.test.ts` (created) — 15 node:test cases: IO-03 SC-1 (byte-identical round-trip), SC-2 (length invariant + pinned 2,284,747), per-quality [0,4,6,9,11], T-1-05 large-window rejection, T-1-03 bomb cap (maxOutputLength), idempotent decompress, roundTrip-throws-on-length-violation + throws-on-byte-identity-violation (mocked brotliCompressSync).

## Decisions Made

- **`constants.BROTLI_PARAM_LARGE_WINDOW` (zlib.constants), not a named node:zlib export** — the plan's `import { BROTLI_PARAM_LARGE_WINDOW } from 'node:zlib'` does not exist in the Node 24 API (verified: `BROTLI_PARAM_LARGE_WINDOW = 6` is a property of `zlib.constants`). Used `import { ..., constants } from 'node:zlib'` + `constants.BROTLI_PARAM_LARGE_WINDOW`. Preserves the plan's intent (defensive rejection) with the correct Node API.
- **Named imports for node:zlib AND node:assert/strict (not default imports)** — esbuild injects `__toESM` for default imports of CJS modules, whose defensive `mod == null` and `!isNodeMode && __esModule` arms are uncoverable for require'd built-ins (they never fire). Named imports compile to live property access (`import_node_zlib.brotliCompressSync`) with NO `__toESM` injected. This eliminated 2 of the 3 originally-uncovered branches.
- **`/* c8 ignore */` comments for the residual esbuild `__copyProps` arm** — even with named imports, `export` syntax triggers `__export`/`__toCommonJS`/`__copyProps`, whose "key already on target / equals except" defensive arm never fires (all export keys are new). This single residual branch is source-mapped to the file header / the `export function` line. Targeted `/* c8 ignore start/end */` (header) + `/* c8 ignore next */` (roundTrip export line) suppress it WITHOUT lowering the `--100` threshold or ignoring any codec logic. Proven: a pure-CJS codec.ts (no import/export) scores 100/100/100/100 with zero injected helpers — confirming the suppressed branches are esbuild interop, NOT codec logic.
- **`decompress` accepts an optional `{ maxOutputLength }` override** — the plan's signature `decompress(compressed: Buffer): Buffer` was under-specified relative to its own behavior block ("decompress with maxOutputLength set below the fixture decompressed size throws"). The cap is only testable as OUR code's enforcement if `decompress` accepts an override (default `MAX_DECOMPRESSED_BYTES`). The acceptance criterion ("decompress passes maxOutputLength: MAX_DECOMPRESSED_BYTES to brotliDecompressSync") holds for the default path.
- **Mocked brotliCompressSync (node:test mock.method) to exercise roundTrip's throw arms** — real Brotli is lossless, so the length/byte-identity invariants can't naturally violate. The mock stubs `brotliCompressSync` to return a compressed-truncated / compressed-tampered buffer; the mock propagates to the codec's named-import binding (live property access on the shared require'd module — verified empirically).
- **Did NOT lower the c8 threshold** — D-04 is a gate. Achieved 100% on ALL metrics via named imports + targeted c8 ignore for esbuild interop artifacts (NOT codec logic).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's `BROTLI_PARAM_LARGE_WINDOW` named import does not exist in node:zlib**
- **Found during:** Task 1 GREEN (probing the node:zlib API before writing codec.ts)
- **Issue:** The plan's `<action>` specified `import { ..., BROTLI_PARAM_LARGE_WINDOW, ... } from 'node:zlib'`. Node 24 does NOT export `BROTLI_PARAM_LARGE_WINDOW` as a named export — it is a property of `zlib.constants` (value 6). A named import would fail at both typecheck (not in @types/node's named exports) and runtime (`SyntaxError: no export named 'BROTLI_PARAM_LARGE_WINDOW'`).
- **Fix:** Imported `constants` from `node:zlib` and accessed `constants.BROTLI_PARAM_LARGE_WINDOW` / `constants.BROTLI_PARAM_QUALITY`. Verified the constant values (6 and 1) and that `BrotliOptions.maxOutputLength` typechecks.
- **Files modified:** src/codec.ts
- **Verification:** `npx tsc --noEmit` exit 0; `npx tsx --test test/codec.test.ts` 15/15 pass (large-window rejection test uses `constants.BROTLI_PARAM_LARGE_WINDOW`).
- **Committed in:** 7555b40 (Task 1 GREEN), refined in 4fe62ec (named imports).

**2. [Rule 2 - Missing Critical] `decompress` accepts an optional `{ maxOutputLength }` override**
- **Found during:** Task 1 RED (writing the bomb-cap test)
- **Issue:** The plan's signature `decompress(compressed: Buffer): Buffer` takes no options, but the plan's behavior block requires "decompress with maxOutputLength set below the fixture decompressed size throws (proves the cap is enforced)". With no options parameter, the cap mechanism can't be tested as OUR code's enforcement — only Node's. The plan's stated intent ("proves the cap is enforced") requires `decompress` to accept a cap override.
- **Fix:** `decompress(compressed, opts: { maxOutputLength?: number } = {})` — default `opts.maxOutputLength ?? MAX_DECOMPRESSED_BYTES`. The default path (no opts) passes `maxOutputLength: MAX_DECOMPRESSED_BYTES` (satisfying the acceptance criterion); the bomb-cap test passes `{ maxOutputLength: 1000 }` to prove OUR function throws. Minimal, intent-preserving (the plan's behavior block explicitly requires it).
- **Files modified:** src/codec.ts
- **Verification:** `test/codec.test.ts#decompression bomb capped (T-1-03)` passes (1000-byte cap throws ERR_BUFFER_TOO_LARGE; default 256 MiB lets the real save pass).
- **Committed in:** 7555b40 (Task 1 GREEN).

**3. [Rule 3 - Blocking] esbuild (tsx) injects uncoverable interop helper branches that block the D-04 `--100` branch gate**
- **Found during:** Task 2 (c8 --100 coverage gate — branches at 87.5%, 3 uncovered)
- **Issue:** esbuild transforms ESM `import`/`export` syntax to CJS by injecting interop helpers (`__toESM` for default imports of CJS modules; `__export`/`__toCommonJS`/`__copyProps` for `export`). These helpers have defensive branches (`mod == null`, `!isNodeMode && __esModule`, "key already on target / equals except") that NEVER fire for real require'd built-in modules — they are genuinely uncoverable and NOT codec logic. The plan's `--100` flag enforces 100% branches, so these artifacts blocked the gate. The plan anticipated uncovered branches would be the codec's own throw arms (coverable by tests) — NOT esbuild interop.
- **Fix (3 steps, all preserving the plan's intent + the `--100` threshold):**
  1. Switched codec.ts to **named imports** for both `node:zlib` and `node:assert/strict` (eliminates `__toESM` entirely — 2 of 3 uncovered branches resolved). Named imports compile to live property access (`import_node_zlib.brotliCompressSync`) with no interop wrapper.
  2. Added **targeted `/* c8 ignore */` comments** — `/* c8 ignore start/end */` around the file header comment + `/* c8 ignore next */` before `export function roundTrip` — to suppress the single residual `__copyProps` defensive arm (source-mapped to those lines). These ignore ONLY esbuild interop artifacts mapped to those lines; the codec's actual logic (lines 60-120) remains fully tracked and covered.
  3. **Proved the artifacts are esbuild-injected, not codec logic** via a pure-CJS probe: a codec.ts written with `module.exports`/`require` (no `import`/`export`) scores 100/100/100/100 with ZERO injected helpers — confirming the suppressed branches are interop code, not my logic.
- **Files modified:** src/codec.ts (named imports + 2 c8 ignore comment blocks)
- **Verification:** `npx c8 --100 --include 'src/codec.ts' --exclude 'test/**' tsx --test test/codec.test.ts` → 100% lines/statements/functions/branches, exit 0. `npx tsc --noEmit` exit 0. `noUncheckedIndexedAccess` still true.
- **Committed in:** 4fe62ec (Task 2).

---

**Total deviations:** 3 auto-fixed (1 Rule 2 missing-critical, 2 Rule 3 blocking — all minimal, intent-preserving, all documented with empirical verification)
**Impact on plan:** All auto-fixes necessary to satisfy the plan's own behavior block + the D-04 `--100` gate under the actual Node 24 + tsx/esbuild toolchain. No scope creep — the codec matches the plan's intent (decompress/compress/roundTrip + bomb cap + large-window rejection + length invariant); the fixes address (a) a wrong API name in the plan, (b) an under-specified signature vs. the plan's own behavior, (c) an unanticipated esbuild+coverage-tooling interaction. The `--100` threshold was NOT lowered.

## Issues Encountered

- **c8 branch-coverage artifact with tsx (esbuild)** — the `--100` branch gate initially reported 87.5% (3 uncovered branches). Investigation via lcov + raw V8 coverage JSON + an esbuild-output probe + a pure-CJS control experiment isolated the uncovered branches to esbuild-injected `__toESM` (default-import interop) and `__copyProps` (export interop) defensive arms — NOT codec logic. Resolved by switching to named imports (eliminates `__toESM`) + targeted `/* c8 ignore */` comments (suppresses the residual `__copyProps` arm). The codec's own logic was proven 100%-covered on all metrics by the pure-CJS probe. This is a known class of esbuild+coverage-tooling interaction; the `/* c8 ignore */` comments document exactly which lines are esbuild interop (vs. codec logic) so future readers don't mistake them for uncovered code paths.
- **`mock.method` on a namespace import (`import * as zlib`) fails** with `ERR_INVALID_ARG_VALUE` ("methodName must be a method") — because esbuild's `__toESM` wrapper exposes properties as getters, which `mock.method` cannot intercept. Resolved by using a default import in the test file (`import zlib from 'node:zlib'`) + `mock.method(zlib, 'brotliCompressSync', impl)` (the default-import wrapper's getter-backed properties ARE mockable; the mock propagates to the codec's named-import binding via the shared require'd module). Verified empirically with a 2-file probe before writing the real test.

## Authentication Gates

None — Phase 1 is a pure local library with no auth/session/network surface. No secrets, no logins, no external services.

## User Setup Required

None — no external service configuration required. The codec uses Node built-ins only (node:zlib, node:assert/strict, node:fs, node:test); the fixture is committed at test/fixtures/test-fixture.sav (D-10).

## Next Phase Readiness

- **IO-03 is COMPLETE** — the no-op round-trip + length invariant are proven on the real .NET .sav fixture (SC-1 byte-identical, SC-2 length-pinned 2,284,747), with defensive large-window rejection (T-1-05) and bomb cap (T-1-03) mitigated. The codec is the corruption-prevention spine Phases 2-5 consume.
- **Phase 2 (parser/FieldTable)** can consume `decompress`/`compress`/`roundTrip` to load .sav bytes and write them back. The codec is version-agnostic (Phase 2 owns save-version parsing).
- **Plan 03 (binary-reader/writer primitives)** is the remaining Wave 1 plan — independent of Plan 02 (it runs against the same tsconfig + fixture + toolchain). It can execute next (or in parallel with Plan 02 in a worktree setup). Its `src/binary-reader.ts` + `src/binary-writer.ts` + `test/primitives.test.ts` are NOT created by this plan.
- **No blockers.** The 3 deviations are stable (named imports, c8 ignore for esbuild interop, optional maxOutputLength) and won't require re-visiting in Plan 03 or Phase 2.

---
*Phase: 01-binary-primitives-brotli-codec*
*Completed: 2026-07-03*

## Self-Check: PASSED

- src/codec.ts — FOUND
- test/codec.test.ts — FOUND
- .planning/phases/01-binary-primitives-brotli-codec/01-02-SUMMARY.md — FOUND
- Commit f00ca63 (RED) — FOUND in git log
- Commit 7555b40 (GREEN) — FOUND in git log
- Commit 4fe62ec (coverage+typecheck gates) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- Gates re-verified green: `npx tsx --test test/codec.test.ts` (15 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/codec.ts' --exclude 'test/**' tsx --test test/codec.test.ts` (100% lines/statements/functions/branches, exit 0)
- IO-03 SC-1 + SC-2 proven on the real fixture (decompressed-buffer-identical + length 2,284,747 pinned)
