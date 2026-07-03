# Phase 1: Binary Primitives + Brotli Codec - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 1-Binary Primitives + Brotli Codec
**Areas discussed:** Test framework, TypeScript toolchain, Save fixture corpus, Primitive test vectors

---

## Test framework

### Q1 — Which test runner for Phase 1 (and the project)?

| Option | Description | Selected |
|--------|-------------|----------|
| node:test | Zero-dep, ships with Node, matches the CommonJS scaffold and the 'use native Node' philosophy already chosen for Brotli. Best fit for a personal local tool. | ✓ |
| Vitest | Rich watch/UI/coverage DX, but adds a dependency and skews ESM-first (works with CJS but less idiomatic here). | |
| Jest | Mature and familiar, but heavier install and slower; overkill for a solo local tool. | |

**User's choice:** node:test
**Notes:** Sets the test pattern for all later phases.

### Q2 — How should byte-exact round-trip equality be asserted?

| Option | Description | Selected |
|--------|-------------|----------|
| node:assert deepStrictEqual | Compares Buffer contents natively. Zero-dep, consistent with node:test. Built-in diff on failure, though for a 152KB buffer the diff can be large. | ✓ |
| Custom offset-reporting helper | Finds the first mismatched byte offset and prints old/new bytes around it. Better failure UX for large buffers, tiny bit of code to maintain. | |
| Both (gate + offset helper) | deepStrictEqual for pass/fail gate PLUS a custom offset helper for the failure message. Slightly more code, best of both. | |

**User's choice:** node:assert deepStrictEqual
**Notes:** Revisit the custom offset helper later if large-buffer failure noise becomes a problem.

### Q3 — Where do test files live?

| Option | Description | Selected |
|--------|-------------|----------|
| test/ dir | Top-level test/ dir mirroring src/ (e.g. test/codec.test.ts). Clean separation, traditional Node, easy to glob with node --test. | ✓ |
| Co-located *.test.* | Co-located files next to source (e.g. src/codec.test.ts). Common in modern setups, keeps tests near code. | |
| src/__tests__/ | src/__tests__/ subdirectories per module. Grouped but still under src. | |

**User's choice:** test/ dir

### Q4 — Coverage tooling for the correctness-critical core?

| Option | Description | Selected |
|--------|-------------|----------|
| c8 + threshold gate | c8 (V8 coverage, zero-config, devDep) with a high threshold gate for the codec/primitives (e.g. 100% lines) since this core is corruption-critical. | ✓ |
| c8 advisory only | c8 reports coverage in CI/local but doesn't fail the build. Numbers are advisory; round-trip tests remain the real gate. | |
| None for Phase 1 | No coverage tool. Byte-exact round-trip + primitive round-trip tests are the gate; add coverage measurement later. | |

**User's choice:** c8 + threshold gate

---

## TypeScript toolchain

### Q1 — Commit to TypeScript in Phase 1, or prototype in JS first?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript now | Set up tsconfig + types in Phase 1. The codec/primitives are the foundation all later phases build on. Type-safety on BigInt/double/Buffer boundaries is genuinely valuable for a corruption-critical core. | ✓ |
| Plain JS first, TS later | Ship the codec in plain JS (with JSDoc) first, adopt TS in a later phase. Faster start, no build step, but the core that most needs types goes untyped. | |
| JS + JSDoc throughout | Stay in plain JS + JSDoc for the whole project. No TS toolchain ever; lean on tests + JSDoc for safety. | |

**User's choice:** TypeScript now
**Notes:** PROJECT.md already leaned TS ("research to confirm"); Phase 1 confirms it.

### Q2 — Module system for the project?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay CommonJS | Keep "type": "commonjs". Matches the existing scaffold, zero friction with Electron's traditional CJS main process in Phase 4, and node:test + zlib both work fine in CJS. | ✓ |
| Flip to ESM | Flip to "type": "module". More modern, cleaner import syntax, but Electron's main-process ESM support has caveats that Phase 4 will have to navigate. | |
| You decide | You weigh the Phase-4 Electron implications and pick. (Agent would lean CJS for simplicity.) | |

**User's choice:** Stay CommonJS

### Q3 — How should TS be run and typechecked?

| Option | Description | Selected |
|--------|-------------|----------|
| tsx + tsc --noEmit | tsx (esbuild-based) runs TS directly with no build step for tests/dev; a separate tsc --noEmit does strict typechecking. Fast loop, clean separation, no dist/ artifact to manage. | ✓ |
| tsc build + node --test | tsc compiles to dist/, then node --test runs the compiled JS. Explicit build artifact, closer to a shipped Electron app bundle, but slower loop and a dist/ to manage. | |
| ts-node | ts-node for running TS. Older and slower than tsx; works but tsx is the modern choice. | |

**User's choice:** tsx + tsc --noEmit

### Q4 — How strict should the tsconfig be?

| Option | Description | Selected |
|--------|-------------|----------|
| Full strict + index access | strict: true PLUS noUncheckedIndexedAccess: true (and noImplicitOverride/exactOptionalPropertyTypes). The core reads buf[offset] constantly; forcing undefined-checks on index access catches out-of-bounds reads at typecheck time. | ✓ |
| Baseline strict | strict: true only. Standard TS safety; indexed access stays possibly-undefined unchecked. Simpler, but skips the check most relevant to byte-level code. | |
| Lenient | Light config (no strict). JS-like, lets some unsafe patterns through. Not advised for a byte-exact core. | |

**User's choice:** Full strict + noUncheckedIndexedAccess

---

## Save fixture corpus

### Q1 — Fixture corpus breadth for Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| I'll provide 2-4 more | User provides 2-4 more varied saves now (different gamemodes, char-name lengths, bank sizes, ideally one with a non-ASCII name). Gives the round-trip and later parser real variety. | |
| Single fixture for Phase 1 | Proceed with just docs/test-fixture.sav (the codec is param-agnostic, so one real save still proves the round-trip). Expand the corpus in Phase 2 where variety actually matters for parsing. | ✓ |
| Provide later (note as dep) | User provides them later/async. Note the expanded corpus as a Phase-2 dependency; Phase 1 ships against the single existing fixture. | |

**User's choice:** Single fixture for Phase 1
**Notes:** Expanded varied corpus flagged as a Phase-2 dependency.

### Q2 — Where do .sav fixtures live, and are they committed?

| Option | Description | Selected |
|--------|-------------|----------|
| test/fixtures/ + commit | Move docs/test-fixture.sav to test/fixtures/ and commit it. Co-located with tests, lives in git so clone-and-test just works. Own save, 152KB, no privacy/LFS concern. | ✓ |
| Gitignored + README | Keep test/fixtures/ gitignored with a README of drop-instructions; don't commit binary saves. Cleaner repo but tests need the fixture supplied locally. | |
| Stay in docs/ | Leave the fixture at docs/test-fixture.sav and reference it from tests by that path. No move. | |

**User's choice:** test/fixtures/ + commit

### Q3 — Should the decompressed buffer also be committed as a golden fixture?

| Option | Description | Selected |
|--------|-------------|----------|
| Commit only .sav | Commit only the .sav. Tests decompress it at runtime — single source of truth, and since the codec is the thing under test, decompressing in the test is more honest (it exercises the very code being verified). | ✓ |
| Commit .sav + decompressed .bin | Commit the .sav AND its decompressed .bin golden. Tests can compare against pre-decompressed bytes without running Brotli, but two files must be kept in sync. | |
| .sav + small slices | Commit .sav plus small decompressed slices (e.g. first 64 bytes) as golden for primitive tests. Hybrid: small committed slices, full buffer decompressed at runtime. | |

**User's choice:** Commit only .sav (decompress at runtime)

---

## Primitive test vectors

### Q1 — How should primitive test vectors be sourced?

| Option | Description | Selected |
|--------|-------------|----------|
| Both: hand-crafted + fixture slices | Hand-craft canonical byte sequences from the spec (full edge-case control: ≥128-byte length prefix, multi-byte UTF-8, int64 -1/max, double NaN/-0/Infinity) AND extract a few slices from the real .sav to prove against genuine .NET output. Strongest coverage. | ✓ |
| Hand-crafted canonical only | Hand-craft canonical vectors entirely from the spec. Deterministic, fully documented, no dependence on fixture contents — but the 'known .NET-produced' claim rests on the spec, not a real .NET artifact. | |
| Fixture-extracted slices only | Extract real byte slices from the .sav fixture only. Proven-real .NET output, but opaque, hard to reason about, and may not contain the required ≥128-byte / multi-byte edge cases. | |

**User's choice:** Both: hand-crafted + fixture slices

### Q2 — How to validate the .NET-compatibility of hand-crafted vectors?

| Option | Description | Selected |
|--------|-------------|----------|
| Spec + fixture cross-check | Trust docs/current-skill.md (documents the .NET BinaryReader format precisely) for hand-crafted vectors, and rely on the fixture-extracted slices — which ARE real .NET output — as the live .NET-compatibility cross-check. No .NET toolchain needed. | ✓ |
| One-time .NET reference generator | Write a tiny one-time C#/.NET script that emits canonical byte sequences for every primitive, commit its output as a checked-in golden byte set. Strongest provenance, but adds a .NET SDK dependency. | |
| Cross-check a JS port | Cross-check against an existing JS port of .NET BinaryReader (npm). Shifts trust to a third-party lib rather than the spec or real .NET. | |

**User's choice:** Spec + fixture cross-check
**Notes:** No .NET SDK added to this JS/TS project.

### Q3 — How exhaustive should the primitive edge-case matrix be?

| Option | Description | Selected |
|--------|-------------|----------|
| Full edge-case matrix | ints: 0, -1, INT32_MAX, INT64_MAX/MIN. double: 0.0, -0.0, NaN, +/-Infinity, PI, a denormal. bool: 0, 1. string: empty, ASCII, multi-byte emoji, length-prefix boundaries 127/128/255/256/16384 (7-bit encoding flips to 2/3 bytes). | ✓ |
| Criterion-minimal | One representative per type plus the two the criterion names explicitly: a ≥128-byte length prefix string and a multi-byte UTF-8 string. Smallest set that satisfies the success criteria. | |
| Middle ground | Full ints/double edge cases and the criterion's two explicit strings, but skip exhaustive length-prefix boundary vectors (127/128/255/256). | |

**User's choice:** Full edge-case matrix

### Q4 — Where do primitive test vectors live?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in tests | Inline in test source as typed constants (e.g. const INT64_MAX = 9223372036854775807n next to the expected bytes). Readable, type-checked, co-located with the assertion, no extra files. Edge cases are small enough that inline is fine. | ✓ |
| Data files in test/fixtures/ | Committed data files under test/fixtures/vectors/ (JSON or .bin) loaded by tests. Separates data from logic, but adds files and a loader for small vectors. | |
| Inline + .bin for large | Inline for small canonical edge cases + binary .bin files for large sequences (e.g. the ≥128-byte and 16384-byte length-prefix strings). | |

**User's choice:** Inline in tests

---

## the agent's Discretion

The user did not select "You decide" for any asked question. The following implementation-level details were intentionally not locked (left to research/planning per the user-as-visionary philosophy):
- Core module/file structure under `src/` (e.g. `src/codec.ts` vs `src/brotli.ts`; `src/binary-reader.ts` vs `src/primitives.ts`).
- API shape of the BinaryReader/Writer (.NET-mirroring stateful cursor class vs pure offset-based functions on `Buffer`).
- Error handling mode for invariant failures (typed `InvariantError` vs bare `Error`) — must fail loudly, never silently corrupt.
- Brotli parameter pinning — "standard-parameter, no large-window, .NET-readable" is locked; the specific `zlib.brotliCompressSync` params (quality, mode) are a research question.
- Save-version read boundary — Phase 1's codec is version-agnostic; where the int32 version field is read (if at all in Phase 1) is a planning detail. Phase 2 owns version-aware parsing.

## Deferred Ideas

- **Expanded real-save fixture corpus** (varied gamemodes, char-name lengths, bank sizes, non-ASCII names) — deferred to Phase 2. The codec is param-agnostic so Phase 1 needs only one real save; Phase 2's parser is where save-variity matters. The user is the sole source of real saves and should assemble this corpus before Phase 2 planning.
