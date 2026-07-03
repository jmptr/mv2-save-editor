# Phase 1: Binary Primitives + Brotli Codec - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A pure-core (no Electron) format layer, proven headless before any UI exists. This phase delivers:

1. **Brotli codec** — `compress(decompress(original))` round-trips a real `.sav` to a byte-identical *decompressed* buffer, asserting `output.length === input.length`. Standard-parameter Brotli (no large-window) that .NET can read.
2. **Little-endian BinaryReader/Writer primitives** — int32 (4B), int64/BigInt (8B), double (8B IEEE 754), bool (1B), and 7-bit-length-prefixed UTF-8 strings — matching .NET `BinaryReader`/`BinaryWriter` byte-for-byte.
3. **Unit-test proof** — round-trip + wrong-width/wrong-endian detection, all headless.

**Not in this phase (locked out by ROADMAP):** the format parser/FieldTable (Phase 2), the patcher/validation/XP table (Phase 3), the Electron shell/IPC (Phase 4), the renderer UI (Phase 5). Phase 1 stops at the codec + raw primitives; it does not walk the save layout or know about GP/items/skills.

</domain>

<decisions>
## Implementation Decisions

### Test framework
- **D-01:** Use Node's built-in `node:test` runner (zero-dep, native, matches the CommonJS scaffold and the "use native Node" philosophy already chosen for Brotli). The project's `package.json` test script becomes a `node --test` invocation.
- **D-02:** Assert byte-exact equality with `node:assert` `deepStrictEqual` (compares Buffer contents natively, built-in diff on failure). No custom offset-reporting helper in v1 — deepStrictEqual's diff is sufficient; revisit if large-buffer failure noise becomes a problem.
- **D-03:** Test files live in a top-level `test/` directory mirroring `src/` (e.g. `test/codec.test.ts`). Run via `node --test` (or `tsx --test` for TS — see D-09).
- **D-04:** Coverage via `c8` (V8 coverage, devDep) with a **threshold gate** (high, e.g. 100% lines) for the codec/primitives — this core is corruption-critical, so coverage is a gate, not advisory.

### TypeScript toolchain
- **D-05:** Commit to **TypeScript now** in Phase 1. The codec/primitives are the foundation Phases 2-5 build on; type-safety on BigInt/double/Buffer boundaries is high-value for a corruption-critical core. Sets up `tsconfig.json` + `@types/node`.
- **D-06:** Stay **CommonJS** — keep `"type": "commonjs"` in `package.json`. Matches the existing scaffold and gives zero friction with Electron's traditional CJS main process in Phase 4. (ESM was considered and deferred to avoid Electron-main caveats.)
- **D-07:** Run TS with **`tsx` (esbuild-based, no build step)** for tests/dev; typecheck separately via **`tsc --noEmit`**. No `dist/` build artifact to manage in v1. (`ts-node` rejected as slower/older; `tsc`-to-`dist` rejected as heavier loop.)
- **D-08:** `tsconfig` is **full strict + `noUncheckedIndexedAccess: true`** (plus `noImplicitOverride`, `exactOptionalPropertyTypes`). The core does heavy `buf[offset]` indexing — forcing undefined-checks on index access catches out-of-bounds reads at typecheck time. This is the strictness choice most relevant to byte-level code.

### Save fixture corpus
- **D-09:** Phase 1 ships against the **single existing fixture** (`docs/test-fixture.sav`). The codec is parameter-agnostic, so one real save fully proves the round-trip. The expanded varied corpus (different gamemodes, char-name lengths, bank sizes, non-ASCII names) is a **Phase 2 dependency** — variety matters for the parser, not for the codec.
- **D-10:** Move `docs/test-fixture.sav` → `test/fixtures/` and **commit it** to git. It's the user's own 152KB save (no privacy/LFS concern); committing makes clone-and-test work with no local setup.
- **D-11:** Commit **only the `.sav`** — tests decompress it at runtime. No separate decompressed `.bin` golden. Single source of truth, and since the codec is the thing under test, decompressing in the test is more honest (it exercises the very code being verified).

### Primitive test vectors
- **D-12:** Source vectors via **both** hand-crafted canonical byte sequences (full edge-case control) **and** fixture-extracted slices from the real `.sav` (proven real .NET output). Hand-crafted covers edge cases the fixture may not contain (≥128-byte length prefix, multi-byte UTF-8); fixture slices prove genuine .NET compatibility.
- **D-13:** Validate the .NET-compatibility claim via **spec + fixture cross-check** — no .NET toolchain/SK dependency. `docs/current-skill.md` documents the .NET `BinaryReader` format precisely; the real `.sav` slices (which ARE .NET output) serve as the live compatibility check. A one-time .NET reference generator was considered and rejected to avoid a .NET SDK dependency.
- **D-14:** **Full edge-case matrix** per type: ints `{0, -1, INT32_MAX, INT64_MAX, INT64_MIN}`; double `{0.0, -0.0, NaN, +Infinity, -Infinity, PI, a denormal}`; bool `{0, 1}`; string `{empty, ASCII, multi-byte emoji, length-prefix boundaries at 127/128/255/256/16384}` (the 7-bit encoding flips to 2/3 bytes at these boundaries).
- **D-15:** Vectors live **inline in test source** as typed constants (e.g. `const INT64_MAX = 9223372036854775807n` next to the expected bytes). Readable, type-checked, co-located with the assertion. Edge cases are small enough that inline is fine; no separate data files.

### the agent's Discretion
The user did not pick "You decide" for any asked question. The following implementation-level details were **not** locked in discussion and are left to research/planning discretion (consistent with the philosophy that the user is the visionary, not the implementer):
- **Core module/file structure** under `src/` (e.g., `src/codec.ts` vs `src/brotli.ts`; `src/binary-reader.ts` vs `src/primitives.ts`) — planner decides, researcher grounds in conventions.
- **API shape** of the BinaryReader/Writer (`.NET`-mirroring stateful cursor class vs pure offset-based functions on `Buffer`) — planner decides; Phase 2's FieldTable will inform the ergonomic choice.
- **Error handling mode** for invariant failures ("fail loudly" per success criterion 2) — throw a typed `InvariantError` vs bare `throw new Error`; researcher/planner decide. Must fail loudly, never silently corrupt.
- **Brotli parameter pinning** — "standard-parameter Brotli (no large-window) that .NET can read" is locked; the *specific* `zlib.brotliCompressSync` params (quality level, mode) that achieve .NET-readable output are a research question, not a user vision call.
- **Save-version read boundary** — Phase 1's codec/primitives are version-agnostic; where (if anywhere) Phase 1 reads the int32 save-version is a planning detail. Phase 2 owns version-aware parsing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Save format spec (authoritative)
- `docs/current-skill.md` — The authoritative reverse-engineered spec for the Melvor Idle 2 `.sav` format. Defines: Brotli compression (NOT encrypted), .NET `BinaryReader`/`BinaryWriter` little-endian primitives (int32=4B, int64=8B, double=8B IEEE754, bool=1B, 7-bit-length-prefixed UTF-8 strings), the full file layout (`[int32 version][SaveHeader][entity list][...]`), entity IDs, GP/item/skill editing, and the XP table. **Phase 1 implements the codec + primitives documented here.** Researcher and planner MUST read this end-to-end before scoping implementation. Note: examples are Python-style; the implementation is TypeScript.

### Real save fixture
- `docs/test-fixture.sav` — Real 152KB Melvor Idle 2 save (save version 17 = Alpha 0.9.1), Brotli-compressed, .NET-produced. Per D-10 this moves to `test/fixtures/test-fixture.sav` and is committed. Used as the round-trip golden and as the source of fixture-extracted primitive slices (D-12).

### Project-level decisions (already-locked context)
- `.planning/PROJECT.md` — Core value, constraints, and Key Decisions table. Carries forward: Node native Brotli (`zlib.brotliDecompressSync`/`brotliCompressSync`, no external dep), in-place same-byte-width edits only for v1, non-destructive write to new file, lean Electron+TS.
- `.planning/REQUIREMENTS.md` — Phase 1 owns requirement **IO-03** (no-op round-trip + `output.length === input.length` length invariant).
- `.planning/ROADMAP.md` §"Phase 1" — Goal + 4 success criteria (the correctness gate this phase must satisfy).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` — CommonJS Node scaffold (`"type": "commonjs"`, stub `test` script, no deps yet). Phase 1 adds `typescript`, `tsx`, `c8`, `@types/node` as devDeps and replaces the test script.
- Node built-in `zlib` (`brotliDecompressSync` / `brotliCompressSync`) — the Brotli codec. **No external decompression dependency** (locked in PROJECT.md). Researcher must confirm which `zlib` params produce .NET-readable output.
- Node built-in `Buffer` — provides LE `readInt32LE`/`writeInt32LE`/`readBigInt64LE`/`writeBigInt64LE`/`readDoubleLE`/`writeDoubleLE`/`readUInt8` helpers. The BinaryReader/Writer primitives may wrap these or hand-roll byte assembly; planner decides.

### Established Patterns
- **Greenfield** — no `src/`, no `tsconfig`, no test dir, no prior code patterns to mirror. Phase 1 establishes the project's first patterns.
- **"Use native Node" philosophy** — the one established pattern (from PROJECT.md's Brotli decision). Extend it: prefer `node:zlib`, `node:assert`, `node:test`, `Buffer` over external deps where they fit. This informed the `node:test` + `node:assert` + `c8` choices.

### Integration Points
- Phase 1 creates `src/` from scratch. The codec (`src/codec.ts` or similar) and primitives (`src/binary-reader.ts` / `src/primitives.ts`) become the foundation **Phase 2's FieldTable parser consumes** and Phase 3's patcher consumes. There are no existing integration points to connect to — Phase 1 *is* the root.
- `test/` is created from scratch and sets the test-layout convention for all later phases.

</code_context>

<specifics>
## Specific Ideas

- **Round-trip target is decompressed-buffer-identical, NOT compressed-bytes-identical.** Brotli compression is not canonical across implementations (Node vs .NET may emit different compressed bytes for the same input), so the success criterion is `decompress(compress(decompress(original))) === decompress(original)` plus the `output.length === input.length` length invariant on the *decompressed* buffer. Do not assert the recompressed `.sav` bytes match the original `.sav` bytes — that is neither required nor reliably achievable. (Already locked in ROADMAP success criteria 1-2; restated here because it's the single most common implementation trap.)
- **The "known .NET-produced bytes" claim (success criterion 3) is satisfied by the real `.sav` slices, not a .NET toolchain.** The hand-crafted canonical vectors are trusted to the spec; the fixture-extracted slices are the live .NET-compatibility proof. No .NET SDK should be added to this JS/TS project.
- **`noUncheckedIndexedAccess` was chosen deliberately for the `buf[offset]`-heavy core** — researcher/planner should not weaken it; if it causes friction, prefer explicit bounds checks over relaxing the flag.
- **Save version 17 = Alpha 0.9.1** is the fixture's version; Phase 1's codec is version-agnostic but the primitives must read/write the int32 version field correctly (it's the first 4 bytes of the layout).

</specifics>

<deferred>
## Deferred Ideas

- **Expanded real-save fixture corpus** (varied gamemodes, char-name lengths, bank sizes, non-ASCII names) — deferred to **Phase 2**. The codec is param-agnostic so Phase 1 needs only one real save; the parser in Phase 2 is where save-variety matters (different gamemodes, name lengths, and bank sizes exercise different layout paths). Flagged in STATE.md as a Phase-2 blocker/concern (already noted there). The user is the sole source of real saves and should assemble this corpus before Phase 2 planning.

</deferred>

---

*Phase: 1-Binary Primitives + Brotli Codec*
*Context gathered: 2026-07-03*
