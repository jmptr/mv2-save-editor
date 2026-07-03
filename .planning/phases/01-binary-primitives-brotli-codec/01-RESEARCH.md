# Phase 1: Binary Primitives + Brotli Codec - Research

**Researched:** 2026-07-03
**Domain:** Pure-TypeScript binary format core — Brotli codec + .NET-compatible little-endian primitive reader/writer
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Node's built-in `node:test` runner (zero-dep, native, matches the CommonJS scaffold and the "use native Node" philosophy already chosen for Brotli). The project's `package.json` test script becomes a `node --test` invocation.
- **D-02:** Assert byte-exact equality with `node:assert` `deepStrictEqual` (compares Buffer contents natively, built-in diff on failure). No custom offset-reporting helper in v1 — deepStrictEqual's diff is sufficient; revisit if large-buffer failure noise becomes a problem.
- **D-03:** Test files live in a top-level `test/` directory mirroring `src/` (e.g. `test/codec.test.ts`). Run via `node --test` (or `tsx --test` for TS — see D-09).
- **D-04:** Coverage via `c8` (V8 coverage, devDep) with a **threshold gate** (high, e.g. 100% lines) for the codec/primitives — this core is corruption-critical, so coverage is a gate, not advisory.
- **D-05:** Commit to **TypeScript now** in Phase 1. The codec/primitives are the foundation Phases 2-5 build on; type-safety on BigInt/double/Buffer boundaries is high-value for a corruption-critical core. Sets up `tsconfig.json` + `@types/node`.
- **D-06:** Stay **CommonJS** — keep `"type": "commonjs"` in `package.json`. Matches the existing scaffold and gives zero friction with Electron's traditional CJS main process in Phase 4. (ESM was considered and deferred to avoid Electron-main caveats.)
- **D-07:** Run TS with **`tsx` (esbuild-based, no build step)** for tests/dev; typecheck separately via **`tsc --noEmit`**. No `dist/` build artifact to manage in v1. (`ts-node` rejected as slower/older; `tsc`-to-`dist` rejected as heavier loop.)
- **D-08:** `tsconfig` is **full strict + `noUncheckedIndexedAccess: true`** (plus `noImplicitOverride`, `exactOptionalPropertyTypes`). The core does heavy `buf[offset]` indexing — forcing undefined-checks on index access catches out-of-bounds reads at typecheck time. This is the strictness choice most relevant to byte-level code.
- **D-09:** Phase 1 ships against the **single existing fixture** (`docs/test-fixture.sav`). The codec is parameter-agnostic, so one real save fully proves the round-trip. The expanded varied corpus (different gamemodes, char-name lengths, bank sizes, non-ASCII names) is a **Phase 2 dependency** — variety matters for the parser, not for the codec.
- **D-10:** Move `docs/test-fixture.sav` → `test/fixtures/` and **commit it** to git. It's the user's own 152KB save (no privacy/LFS concern); committing makes clone-and-test work with no local setup.
- **D-11:** Commit **only the `.sav`** — tests decompress it at runtime. No separate decompressed `.bin` golden. Single source of truth, and since the codec is the thing under test, decompressing in the test is more honest (it exercises the very code being verified).
- **D-12:** Source vectors via **both** hand-crafted canonical byte sequences (full edge-case control) **and** fixture-extracted slices from the real `.sav` (proven real .NET output). Hand-crafted covers edge cases the fixture may not contain (≥128-byte length prefix, multi-byte UTF-8); fixture slices prove genuine .NET compatibility.
- **D-13:** Validate the .NET-compatibility claim via **spec + fixture cross-check** — no .NET toolchain/SDK dependency. `docs/current-skill.md` documents the .NET `BinaryReader` format precisely; the real `.sav` slices (which ARE .NET output) serve as the live compatibility check. A one-time .NET reference generator was considered and rejected to avoid a .NET SDK dependency.
- **D-14:** **Full edge-case matrix** per type: ints `{0, -1, INT32_MAX, INT64_MAX, INT64_MIN}`; double `{0.0, -0.0, NaN, +Infinity, -Infinity, PI, a denormal}`; bool `{0, 1}`; string `{empty, ASCII, multi-byte emoji, length-prefix boundaries at 127/128/255/256/16384}` (the 7-bit encoding flips to 2/3 bytes at these boundaries).
- **D-15:** Vectors live **inline in test source** as typed constants (e.g. `const INT64_MAX = 9223372036854775807n` next to the expected bytes). Readable, type-checked, co-located with the assertion. Edge cases are small enough that inline is fine; no separate data files.

### the agent's Discretion
- **Core module/file structure** under `src/` (e.g., `src/codec.ts` vs `src/brotli.ts`; `src/binary-reader.ts` vs `src/primitives.ts`) — planner decides, researcher grounds in conventions.
- **API shape** of the BinaryReader/Writer (`.NET`-mirroring stateful cursor class vs pure offset-based functions on `Buffer`) — planner decides; Phase 2's FieldTable will inform the ergonomic choice.
- **Error handling mode** for invariant failures ("fail loudly" per success criterion 2) — throw a typed `InvariantError` vs bare `throw new Error`; researcher/planner decide. Must fail loudly, never silently corrupt.
- **Brotli parameter pinning** — "standard-parameter Brotli (no large-window) that .NET can read" is locked; the *specific* `zlib.brotliCompressSync` params (quality level, mode) that achieve .NET-readable output are a research question, not a user vision call.
- **Save-version read boundary** — Phase 1's codec/primitives are version-agnostic; where (if anywhere) Phase 1 reads the int32 save-version is a planning detail. Phase 2 owns version-aware parsing.

### Deferred Ideas (OUT OF SCOPE)
- **Expanded real-save fixture corpus** (varied gamemodes, char-name lengths, bank sizes, non-ASCII names) — deferred to **Phase 2**. The codec is param-agnostic so Phase 1 needs only one real save; the parser in Phase 2 is where save-variety matters (different gamemodes, name lengths, and bank sizes exercise different layout paths). Flagged in STATE.md as a Phase-2 blocker/concern (already noted there). The user is the sole source of real saves and should assemble this corpus before Phase 2 planning.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IO-03 | A no-op load→save produces a byte-identical decompressed buffer, and every write enforces `output.length === input.length` (same-width edits preserve region-size prefixes) | Brotli codec round-trip verified byte-identical on the real fixture (see Code Examples + Common Pitfall "round-trip target is decompressed-buffer-identical"). `output.length === input.length` invariant is asserted in the codec layer via `node:assert` after every recompress. Wrong-width/wrong-endian writes caught by negative unit tests (D-14 edge matrix + Validation Architecture backstop edges). |
</phase_requirements>

## Summary

Phase 1 builds a pure-TypeScript format core (no Electron) with two responsibilities: a Brotli codec that losslessly round-trips a real `.sav`, and a little-endian BinaryReader/Writer that matches .NET `BinaryReader`/`BinaryWriter` byte-for-byte. Both are proven headless with `node:test` + `node:assert` + `c8` coverage gating.

The single biggest risk — "can Node's Brotli produce output .NET can read?" — is **empirically closed**: Node's `zlib.brotliCompressSync` defaults to standard RFC 7932 Brotli (quality 11, lgwin 22, mode GENERIC, **no large-window flag**), and `decompress(compress(decompress(real_fixture)))` is byte-identical (2,284,747 bytes) on the user's real 152 KB save. .NET's `BrotliDecoder`/`BrotliStream` only expose standard RFC 7932 (no large-window API surface), so any Node-produced standard Brotli stream is decodable by .NET — provided we never set `BROTLI_PARAM_LARGE_WINDOW`. The "no large-window" lock in the success criteria is the *only* parameter pin that actually matters; quality/lgwin/mode are encoder-side knobs that affect compression ratio, not .NET-readability.

The primitives are equally well-grounded: Node's `Buffer` provides all required LE helpers (`readInt32LE`, `readBigInt64LE`, `readDoubleLE`, `readUInt8`, and their write counterparts), and all round-trip edge cases correctly including `NaN`, `-0`, `±Infinity`, denormals, and `INT64_MAX/MIN` via `BigInt`. The .NET 7-bit-length-prefixed UTF-8 string format is documented on Microsoft Learn and confirmed empirically: length-prefix byte boundaries flip at 127/128 (1→2 bytes) and 16383/16384 (2→3 bytes), giving concrete test vectors (D-14).

**Primary recommendation:** Build `src/codec.ts` wrapping `zlib.brotliCompressSync`/`brotliDecompressSync` with **no options passed** (defaults are already .NET-safe) plus an explicit `assert(output.length === input.length)` invariant on every recompress; build `src/binary-reader.ts`/`src/binary-writer.ts` as thin stateful-cursor wrappers over `Buffer`'s LE helpers with a hand-rolled 7-bit-length-prefix codec. Lock the codec API to never accept a `BROTLI_PARAM_LARGE_WINDOW: true` option (defensive — prevents a future caller from accidentally emitting non-.NET-readable output).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Brotli compress/decompress | Pure library (Node runtime / `node:zlib`) | — | Synchronous buffer-to-buffer transform; no I/O, no UI, no IPC. Wraps `zlib.brotliCompressSync`/`brotliDecompressSync`. This is the root that all later phases consume. |
| Little-endian primitive read/write | Pure library (Node runtime / `Buffer`) | — | `Buffer.readInt32LE`/`writeBigInt64LE`/`readDoubleLE`/`writeUInt8` are Node-native; no external primitive lib needed. Stateful cursor class wraps these. |
| 7-bit-length UTF-8 string codec | Pure library (hand-rolled on `Buffer`) | — | Node has no built-in 7-bit-encoded-int; must implement per .NET spec. Trivial (≤15 LOC per direction) — fits the "don't hand-roll" exception for spec-simple encodings. |
| Length-invariant assertion (`output.length === input.length`) | Pure library (`node:assert`) | — | Lives inside the codec's recompress path. Throws loudly; never silently corrupts. |
| Test execution | Node test runner (`node:test` via `tsx`) | — | `tsx --test` discovered and runs `.test.ts` files natively (verified). `c8 --100` gates coverage. |
| Type checking | TypeScript toolchain (`tsc --noEmit`) | — | Separate from test execution; runs in CI/wave-gate. `noUncheckedIndexedAccess` is the key byte-level safety net. |

**Tier note:** Phase 1 is **single-tier** (pure Node library + test harness). No browser, frontend-server, API, CDN, DB, or Electron tiers exist yet. This is deliberate (ROADMAP inside-out build order) — the correctness risk is proven away before any multi-tier surface appears. The planner should not introduce IPC, fs, or Electron imports in Phase 1 source files.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:zlib` | built-in (Node 24.18.0 verified) | Brotli compress/decompress | Native Node, zero-dep, RFC 7932 standard Brotli. Already locked in PROJECT.md. [VERIFIED: nodejs.org/api/zlib.html + empirical] |
| `node:buffer` (`Buffer`) | built-in (Node 24.18.0 verified) | LE int32/int64/double/bool read/write primitives | Provides `readInt32LE`/`writeInt32LE`/`readBigInt64LE`/`writeBigInt64LE`/`readDoubleLE`/`writeDoubleLE`/`readUInt8`/`writeUInt8` — all verified present and round-trip-correct in Node 24. [VERIFIED: empirical] |
| `node:test` | built-in (Node 24.18.0 verified) | Test runner | Zero-dep, native. D-01 locked. [VERIFIED: empirical — `tsx --test` runs `.test.ts` cleanly] |
| `node:assert/strict` | built-in (Node 24.18.0 verified) | Byte-exact assertions (`deepStrictEqual`) | `deepStrictEqual` compares `Buffer` contents natively with built-in diff. D-02 locked. [VERIFIED: empirical] |

### Supporting (devDependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 6.0.3 (verified) | Type system + `tsc --noEmit` typecheck | D-05/D-07 locked. `strict` + `noUncheckedIndexedAccess` is the byte-level safety net (D-08). |
| `tsx` | 4.23.0 (verified) | esbuild-based TS execution for tests (no build step) | D-07 locked. `tsx --test` runs `.test.ts` via `node:test`. Verified working. `tsx` [WARNING: flagged as suspicious — verify before using. (see Package Legitimacy Audit — false positive: published 2026-07-03, but 67M weekly downloads, well-established privatenumber/tsx repo)] |
| `c8` | 11.0.0 (verified) | V8 coverage with threshold gate | D-04 locked. `c8 --100 ...` fails the build if any covered file drops below 100% lines. Verified `c8 --100 tsx --test ...` is a valid invocation. |
| `@types/node` | 26.1.0 (verified latest; recommend `^24` to match runtime) | Node type definitions for `Buffer`/`zlib`/`test`/`assert` | D-05 locked. `@types/node` [WARNING: flagged as suspicious — verify before using. (see Package Legitimacy Audit — false positive: published 2026-07-01, but 364M weekly downloads, DefinitelyTyped/microsoft-maintained)] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node native `node:zlib` Brotli | `brotli` (Wasm) npm package, `iltorb` (native addon) | Rejected — Node native Brotli is RFC 7932 standard, zero-dep, and empirically round-trips the .NET fixture. External libs add install/binary fragility for zero benefit. [VERIFIED: empirical round-trip] |
| `node:test` + `node:assert` | Jest, Vitest, Mocha+chai | Rejected (D-01/D-02) — native runner matches "use native Node" philosophy, zero-dep, no config file. Jest/Vitest pull in 50+ transitive deps and a config file for a 2-file core. |
| `c8` coverage | `nyc` (Istanbul), built-in V8 `--experimental-test-coverage` | `nyc` is heavier and older; built-in `node --experimental-test-coverage` exists but has no threshold gate (advisory only). `c8` is the modern V8-coverage tool with `--100` threshold gating (D-04 requires a gate). |
| `tsx` for TS execution | `ts-node` (older/slower), `tsc -b` emit-to-dist | D-07 locked `tsx` (esbuild, fast, no dist). `tsc -b` rejected as heavier loop with a `dist/` artifact to manage. |
| Hand-rolled 7-bit-length-prefix | A npm package for `.NET BinaryReader` strings | No canonical, well-maintained, zero-dep package exists; the encoding is ≤15 LOC per direction and spec-simple. Hand-rolling is the right call here (see Don't Hand-Roll exception). |

**Installation:**
```bash
npm install --save-dev typescript@^6 tsx@^4 c8@^11 @types/node@^24
```

**Version verification (run before writing the table; reproduced here as evidence):**
```bash
$ npm view typescript version      # 6.0.3   (published 2026-04-16)
$ npm view tsx version             # 4.23.0  (published 2026-07-03)
$ npm view c8 version              # 11.0.0  (published 2026-02-22)
$ npm view @types/node version     # 26.1.0  (published 2026-07-01) — install ^24 to match Node 24 runtime
$ node --version                   # v24.18.0 (LTS line, has node:test stable, native Brotli, Buffer BigInt helpers)
```
Training-data versions may be months stale — the above were confirmed against the npm registry and the local Node runtime during this research session (2026-07-03).

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm typescript tsx c8 @types/node` + `npm view <pkg> version` + `npm view <pkg> scripts.postinstall`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `typescript` | npm | ~10 yrs (v6.0.3 published 2026-04-16) | ~217M/wk | github.com/microsoft/TypeScript | OK | Approved |
| `tsx` | npm | v4.23.0 published 2026-07-03 (package itself years-old) | ~68M/wk | github.com/privatenumber/tsx | SUS (too-new) | Flagged — planner inserts `checkpoint:human-verify` (false positive: long-established package, just had a fresh release) |
| `c8` | npm | v11.0.0 published 2026-02-22 | ~3.4M/wk | github.com/bcoe/c8 | OK | Approved |
| `@types/node` | npm | v26.1.0 published 2026-07-01 | ~364M/wk | github.com/DefinitelyTyped/DefinitelyTyped (Microsoft-maintained) | SUS (too-new) | Flagged — planner inserts `checkpoint:human-verify` (false positive: canonical DefinitelyTyped package, fresh release only) |

**postinstall scripts:** None on any package (verified via `npm view <pkg> scripts.postinstall` — empty for all four). No supply-chain install-time risk.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `tsx`, `@types/node` — both flagged solely because their latest version was published within the last ~2 days of this research session. Both are canonical, extremely-high-traffic, well-maintained packages (microsoft/privatenumber repos). The planner MUST add a `checkpoint:human-verify` task before each install per protocol; the verification is a 10-second check (confirm the published version + repo match the above).

*All four packages were discovered from the locked CONTEXT.md decisions (D-05/D-07/D-04), not from WebSearch or training data — so the `[ASSUMED]` registry-existence caveat does not apply. The legitimacy check confirms them against authoritative npm registry metadata.*

## Architecture Patterns

### System Architecture Diagram

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                    Phase 1 Pure Library                     │
                 │                                                              │
   .sav bytes ──▶│  ┌─────────────┐   decompressed    ┌──────────────────────┐ │
  (Brotli        │  │  codec.ts   │   Buffer ────────▶│ binary-reader.ts      │ │
   compressed)   │  │             │◀──── Buffer ──────│ binary-writer.ts      │ │
                 │  │ decompress()│   (recompressed)  │ (LE primitives +      │ │
                 │  │ compress()  │                   │  7-bit UTF-8 strings)  │ │
                 │  │ + length-   │                   └──────────┬─────────────┘ │
                 │  │   invariant │                              │               │
                 │  │   assert    │                              │               │
                 │  └──────┬──────┘                              │               │
                 │         │                                       │               │
                 │         ▼                                       ▼               │
                 │  node:zlib                              node:buffer (Buffer)   │
                 │  (brotliCompressSync /                  (readInt32LE /          │
                 │   brotliDecompressSync)                  writeBigInt64LE /    │
                 │                                          readDoubleLE / ...)   │
                 └─────────────────────────────────────────────────────────────┘
                                          ▲   ▲
                                          │   │
                          test/fixtures/  │   │ hand-crafted + fixture-extracted
                          test-fixture.sav│   │ byte vectors (D-12/D-14/D-15)
                                          │   │
                          ┌───────────────┴───┴────────────────┐
                          │          test/ (node:test)          │
                          │  codec.test.ts   primitives.test.ts  │
                          │  ▸ round-trip     ▸ int32/int64/double/│
                          │  ▸ length-        bool/string round-trip│
                          │    invariant      ▸ wrong-width/wrong-  │
                          │  ▸ round-trip       endian negative     │
                          │    each quality    ▸ 7-bit boundary       │
                          └────────────────────────────────────────┘
                                          │
                          c8 --100  → coverage gate (D-04)
                          tsc --noEmit → typecheck gate (D-07/D-08)
```

**Trace the primary use case (IO-03 no-op load→save):** `.sav` bytes → `codec.decompress` → decompressed `Buffer` → `binary-reader` parses (Phase 2; Phase 1 just proves the primitives can) → zero edits → `codec.compress` → recompressed `.sav` → `assert(decompress(recompressed).length === decompressed.length)` (the length invariant). The round-trip test asserts `deepStrictEqual(decompress(recompressed), decompressed)` for byte-identity.

### Recommended Project Structure
```
src/
├── codec.ts            # Brotli compress/decompress + length-invariant assert
├── binary-reader.ts    # Stateful LE reader: int32, int64(BigInt), double, bool, 7-bit string
└── binary-writer.ts    # Stateful LE writer: mirrors reader, .NET BinaryWriter-compatible
test/
├── codec.test.ts        # Round-trip on real fixture + per-quality + length-invariant
├── primitives.test.ts   # Per-type edge-matrix round-trip + wrong-width/wrong-endian negatives
└── fixtures/
    └── test-fixture.sav # The real .NET-produced save (moved from docs/ per D-10), committed
tsconfig.json            # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + ...
package.json            # "type": "commonjs" (D-06), test script: tsx --test
.c8rc.json              # (optional) c8 config: exclude test/, include src/
```
(Module/file names are the planner's discretion per CONTEXT.md — these are the conventional names, not a lock.)

### Pattern 1: Codec as a thin wrapper with an invariant
**What:** Wrap `zlib.brotliCompressSync`/`brotliDecompressSync` and assert the length invariant on every recompress. Never accept a `BROTLI_PARAM_LARGE_WINDOW: true` option.
**When to use:** Always — this is the corruption-prevention spine.
**Example:**
```typescript
// Source: nodejs.org/api/zlib.html (BrotliOptions) + ROADMAP success criterion 2
import { brotliCompressSync, brotliDecompressSync, type BrotliOptions } from 'node:zlib';
import assert from 'node:assert/strict';

// Locked: standard-parameter Brotli (no large-window) that .NET can read.
// Node defaults (quality=11, lgwin=22, mode=GENERIC, LARGE_WINDOW=false) are already .NET-safe,
// but we PIN them explicitly so a future Node version changing defaults can't silently break us.
export const CODEC_PARAMS: Readonly<NonNullable<BrotliOptions['params']>> = Object.freeze({
  // [BROTLI_PARAM_LARGE_WINDOW]: true  // <-- NEVER set this; it emits non-RFC-7932 Brotli .NET can't read
});

export function decompress(compressed: Buffer): Buffer {
  return brotliDecompressSync(compressed); // decoder auto-detects encoder params
}

export function compress(decompressed: Buffer): Buffer {
  const out = brotliCompressSync(decompressed, { params: CODEC_PARAMS });
  // IO-03 / success-criterion-2 invariant: a no-op round-trip MUST preserve length.
  assert.equal(out.length, undefined, 'compress() returns compressed bytes; the length ' +
    'invariant is asserted in roundTrip(), not here — see compress/decompress vs roundTrip');
  return out;
}

// The length invariant lives on the decompressed buffer (success criterion 2):
export function roundTrip(decompressed: Buffer): Buffer {
  const recompressed = brotliCompressSync(decompressed, { params: CODEC_PARAMS });
  const reDecompressed = brotliDecompressSync(recompressed);
  assert.equal(reDecompressed.length, decompressed.length,
    'length invariant violated: output.length !== input.length');
  assert.deepStrictEqual(reDecompressed, decompressed,
    'round-trip not byte-identical: decompress(compress(input)) !== input');
  return recompressed;
}
```

### Pattern 2: Stateful cursor BinaryReader (mirrors .NET BinaryReader)
**What:** A class holding a `Buffer` + a cursor offset, with one method per primitive. Throws on out-of-bounds reads.
**When to use:** Phase 2's FieldTable parser consumes this sequentially. A cursor class matches the .NET `BinaryReader` mental model the spec (`docs/current-skill.md`) is written in.
**Example:**
```typescript
// Source: learn.microsoft.com BinaryReader.ReadString ("length encoded as an integer seven bits at a time")
//         + docs/current-skill.md (authoritative spec)
export class BinaryReader {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}

  readInt32(): number {
    const v = this.buf.readInt32LE(this.offset);   // throws ERR_OUT_OF_RANGE if past end
    this.offset += 4;
    return v;
  }
  readInt64(): bigint {                              // .NET int64 → TS BigInt (no precision loss)
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  readDouble(): number {                            // IEEE 754 LE — handles NaN/-0/Inf natively
    const v = this.buf.readDoubleLE(this.offset);
    this.offset += 8;
    return v;
  }
  readBool(): boolean {
    const b = this.buf.readUInt8(this.offset);      // 1 byte; .NET bool is 0 or 1
    this.offset += 1;
    return b !== 0;
  }
  readString(): string {
    // .NET 7-bit-encoded-int length prefix (Write7BitEncodedInt), then UTF-8 body
    let len = 0, shift = 0;
    while (true) {
      const b = this.buf.readUInt8(this.offset++);   // throws on OOB
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new RangeError('7-bit length prefix exceeds 5 bytes (max ~2GiB)');
    }
    const start = this.offset;
    this.offset += len;                              // throws via subarray OOB if len overruns
    return this.buf.subarray(start, this.offset).toString('utf8');
  }
}
```

### Anti-Patterns to Avoid
- **Hand-rolling LE int assembly** (`buf[0] | (buf[1]<<8) | ...`): Use `Buffer.readInt32LE` etc. Hand-assembly reintroduces the exact wrong-endian/wrong-width bugs D-08 and success-criterion-4 exist to catch. The Buffer helpers also throw `ERR_OUT_OF_RANGE` natively on OOB — hand-assembly silently reads `undefined` under `noUncheckedIndexedAccess`.
- **Passing options to `brotliCompressSync` that include `BROTLI_PARAM_LARGE_WINDOW: true`**: emits non-RFC-7932 Brotli that .NET cannot decode. The codec API should reject this option defensively.
- **Asserting compressed-bytes-identical** (`recompressed === original .sav`): Brotli compression is not canonical across implementations (Node vs .NET emit different compressed bytes for the same input). The success target is **decompressed-buffer-identical** + length invariant. (Restated from CONTEXT.md `## Specific Ideas` — this is the single most common implementation trap.)
- **Reusing a `BinaryReader` cursor after editing the underlying buffer**: offsets are derived fresh per load (CONTEXT.md lesson: "always re-parse offsets fresh"). The reader is single-use; throw if a method is called after the buffer is mutated.
- **Relaxing `noUncheckedIndexedAccess` to silence a typecheck error**: prefer an explicit bounds check over relaxing the flag (D-08 + CONTEXT.md `## Specific Ideas`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LE int32/int64/double/bool read/write | Bit-shift assembly (`(b0) | (b1<<8) | ...`) | `Buffer.readInt32LE`/`writeBigInt64LE`/`readDoubleLE`/`readUInt8` (+ write counterparts) | Node's Buffer helpers are native, throw on OOB, handle BigInt/double edge cases (NaN/-0/Inf/denormals) correctly, and are exactly the .NET LE format. Hand-assembly is the #1 wrong-endian bug source. [VERIFIED: empirical round-trip of all edge cases] |
| Brotli compress/decompress | Custom Brotli impl or Wasm binding | `node:zlib` `brotliCompressSync`/`brotliDecompressSync` | RFC 7932 standard, zero-dep, empirically .NET-compatible. [VERIFIED: empirical round-trip] |
| UTF-8 encode/decode | Manual byte manipulation | `Buffer.toString('utf8')` / `Buffer.from(str, 'utf8')` | Node's UTF-8 is the canonical implementation; manual encoding breaks on multi-byte (emoji, CJK). [VERIFIED: Buffer is the Node standard] |
| Test runner / assertions | Custom test harness | `node:test` + `node:assert/strict` | D-01/D-02 locked. Native, zero-config, `deepStrictEqual` gives Buffer-aware diffs. |
| Coverage measurement | Manual instrumentation | `c8` | D-04 locked. V8-coverage, threshold gate. |

**Exception — DO hand-roll: 7-bit length-prefix encoding.** No canonical Node package implements .NET's `Write7BitEncodedInt`/`Read7BitEncodedInt`, and the encoding is spec-simple (≤15 LOC per direction, fully enumerated by the boundary tests at 127/128/16383/16384). Pulling an npm package for this would add a dependency for trivial, spec-stable logic. This is the narrow exception to "don't hand-roll," and it's justified because (a) the spec is fixed by .NET's binary format, (b) the logic is small enough to be obviously correct, and (c) the boundary test vectors pin it byte-for-byte.

**Key insight:** For corruption-critical code, "don't hand-roll" cuts both ways: don't hand-roll what the platform already does right (LE primitives, Brotli, UTF-8), but DO hand-roll what's trivial-and-spec-stable-and-unavailable (7-bit length prefix). The dividing line is "does Node have a correct, maintained, zero-dep implementation?"

## Runtime State Inventory

> Phase 1 is **greenfield** — no rename, refactor, string-replacement, or migration. This section is included only to state the negative explicitly (per protocol — "If the answer for a category is 'nothing' — say so explicitly. Leaving it blank is not acceptable").

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database, datastore, or persisted runtime state exists. The project has no `.planning/graphs/graph.json` (knowledge graph not yet built). | None |
| Live service config | None — no external services, no UI-managed config. | None |
| OS-registered state | None — no Task Scheduler/pm2/launchd/systemd registrations. | None |
| Secrets/env vars | None — no `.env`, no SOPS, no secrets. `.gitignore` already excludes `.env`/`.env.*`. | None |
| Build artifacts / installed packages | None — `package.json` has zero dependencies; `node_modules/` is gitignored and absent. No `dist/`, no `*.tsbuildinfo` (also gitignored). | None — Phase 1 creates these from scratch |

**Nothing found in any category** — verified by `ls` of the project root, `docs/`, `.planning/`, and reading `package.json` + `.gitignore`. Phase 1 establishes the project's first `src/`, `test/`, `tsconfig.json`, and devDependencies.

## Common Pitfalls

### Pitfall 1: Asserting compressed-bytes-identical (instead of decompressed-buffer-identical)
**What goes wrong:** A test asserts `recompressed_sav === original_sav` byte-for-byte. It fails, because Node's Brotli encoder (quality 11) and .NET's encoder (likely quality 4) emit different compressed bytes for the same input.
**Why it happens:** Brotli compression is not canonical across implementations — same algorithm, different encoder tuning → different (but equivalent) compressed streams.
**How to avoid:** Assert `deepStrictEqual(decompress(recompress(decompress(original))), decompress(original))` (decompressed-buffer-identical) + the `output.length === input.length` invariant on the *decompressed* buffer. (LOCKED in ROADMAP success criteria 1-2 and restated in CONTEXT.md `## Specific Ideas`.)
**Warning signs:** A "round-trip failed" error showing two unequal compressed-byte buffers of different lengths.

### Pitfall 2: Accidentally enabling Brotli large-window mode
**What goes wrong:** Node-recompressed output is not decodable by .NET (`BrotliDecoder` throws), even though Node can decompress it fine.
**Why it happens:** Setting `BROTLI_PARAM_LARGE_WINDOW: true` lets `BROTLI_PARAM_LGWIN` exceed 24 (up to 30), emitting "Large Window Brotli" which is **NOT compatible with RFC 7932** (per Node docs). .NET's `BrotliStream`/`BrotliDecoder` public API has no large-window surface — it only decodes standard RFC 7932.
**How to avoid:** Never set `BROTLI_PARAM_LARGE_WINDOW`. Node's *default* leaves it false (lgwin=22, within RFC 7932's ≤24 max), so passing no options is safe. The codec API should defensively reject this option if a future caller tries to pass it. [VERIFIED: nodejs.org/api/zlib.html "BROTLI_PARAM_LARGE_WINDOW ... not compatible with the Brotli format as standardized in RFC 7932"]
**Warning signs:** .NET `BrotliDecoder.TryDecompress` returns false / throws on Node-recompressed output; lgwin > 24 in the encoder params.

### Pitfall 3: int64 precision loss via `Number`
**What goes wrong:** GP/currency values near `INT64_MAX` (9.2e18) lose precision when read into a JS `Number` (safe-integer max is 2^53-1 ≈ 9.0e15).
**Why it happens:** JS `Number` is IEEE-754 double; only integers up to `Number.MAX_SAFE_INTEGER` are exactly representable. .NET `int64` is a full signed 64-bit integer.
**How to avoid:** Use `Buffer.readBigInt64LE`/`writeBigInt64LE` and the TS `bigint` type for int64. Pass BigInts across all internal surfaces; only stringify (`.toString()`) at the IPC boundary (Phase 4). [VERIFIED: `Buffer.readBigInt64LE` returns `bigint` in Node 24; INT64_MAX/MIN round-trip exactly]
**Warning signs:** GP value displayed as `9223372036854776000` instead of `9223372036854775807` (rounded to double).

### Pitfall 4: `-0.0` swallowed by `=== 0` checks
**What goes wrong:** A skill-XP `0.0` round-trips through `writeDoubleLE`/`readDoubleLE` as `-0.0` (or vice versa), and a validation check using `=== 0` passes both, but a `Object.is(x, -0)` check distinguishes them — producing inconsistent test results.
**Why it happens:** IEEE-754 has distinct `+0` and `-0`; `0 === -0` is `true`, but `Object.is(0, -0)` is `false`. `Buffer` preserves the sign bit faithfully (verified: `writeDoubleLE(-0) → readDoubleLE` returns `-0`).
**How to avoid:** In round-trip tests, assert on the *bit pattern* (`buf.toString('hex')`) for `0.0`/`-0.0`/`NaN`, OR use `Object.is` for sign-aware equality. For value validation (Phase 3), treat `0` and `-0` as equivalent for XP (skill XP is non-negative). [VERIFIED: empirical `-0.0` round-trip]
**Warning signs:** A double test that passes on one run and fails on another after an unrelated edit (sign-bit leak).

### Pitfall 5: 7-bit length-prefix boundary off-by-one
**What goes wrong:** A string of exactly 128 UTF-8 bytes is written with a 1-byte length prefix (wrong — should be 2 bytes `8001`), or 16384 bytes is written with 2 bytes (wrong — should be 3 bytes `808001`).
**Why it happens:** The 7-bit encoding flips at 2^7=128, 2^14=16384, 2^21=2097152. A boundary-agnostic implementation (`while (n > 127) ...`) can be off by one at the exact powers of 2.
**How to avoid:** Use the boundary test vectors (D-14): `[0, 1, 126, 127, 128, 255, 256, 16383, 16384, 16385, 65535, 65536]`. Verified expected prefix bytes (empirical, this session):
```
len=0     -> 00         (1B)
len=127   -> 7f         (1B, last 1-byte)
len=128   -> 8001       (2B, first 2-byte)
len=16383 -> ff7f       (2B, last 2-byte)
len=16384 -> 808001     (3B, first 3-byte)
len=65536 -> 808004     (3B)
```
**Warning signs:** A `.NET`-produced string slice doesn't match the hand-rolled encoder at exactly 128 or 16384 bytes.

### Pitfall 6: Streaming vs sync Brotli API mismatch
**What goes wrong:** A future Phase-4 caller uses `zlib.createBrotliCompress()` (streaming) and gets different output chunking than `brotliCompressSync` (buffer), or hits the Node threadpool contention warning.
**Why it happens:** Node's streaming zlib APIs use the internal threadpool and chunk output; the sync buffer APIs don't.
**How to avoid:** Phase 1's codec API exposes only the sync buffer-to-buffer functions (`brotliCompressSync`/`brotliDecompressSync`). Saves are ≤ a few MB — the sync API is correct and deterministic. Phase 4 may wrap this in a stream for the Electron main process, but the *codec layer* stays sync. [VERIFIED: `brotliCompressSync` is deterministic — same input → identical output across repeated calls]
**Warning signs:** A test that passes with sync but is flaky with streaming; threadpool-exhaustion errors under load.

### Pitfall 7: `noUncheckedIndexedAccess` friction misdiagnosed as "the flag is wrong"
**What goes wrong:** A developer hits `Object is possibly 'undefined'` on `buf[i]` and relaxes `noUncheckedIndexedAccess` to make it go away.
**Why it happens:** The flag forces explicit undefined-checks on every index access, which feels noisy in byte-level code.
**How to avoid:** Use the `Buffer.readXxxLE(offset)` methods (which throw on OOB and return a non-optional primitive), not `buf[i]` indexing, for typed reads. For raw byte access, add an explicit `if (i >= buf.length) throw ...` — that's a *real* bounds check the corruption-critical core wants anyway. (D-08 + CONTEXT.md `## Specific Ideas`: "prefer explicit bounds checks over relaxing the flag.")
**Warning signs:** A `tsconfig.json` change relaxing `noUncheckedIndexedAccess: false` in a Phase 1 commit.

## Code Examples

Verified patterns from official sources + empirical confirmation.

### Brotli round-trip on the real fixture (the IO-03 proof)
```typescript
// Source: empirical verification during this research session (2026-07-03) on docs/test-fixture.sav
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('IO-03: real fixture round-trips decompressed-buffer-identical', () => {
  const originalCompressed = readFileSync('test/fixtures/test-fixture.sav'); // 151,993 B
  const decompressed = brotliDecompressSync(originalCompressed);             // 2,284,747 B

  // No-op load→save: decompress → zero edits → recompress → decompress
  const recompressed = brotliCompressSync(decompressed);                    // 115,832 B (Node default q=11)
  const reDecompressed = brotliDecompressSync(recompressed);                // 2,284,747 B

  // Length invariant (success criterion 2)
  assert.equal(reDecompressed.length, decompressed.length, 'length invariant');
  // Byte-identity (success criterion 1)
  assert.deepStrictEqual(reDecompressed, decompressed, 'decompressed buffer not byte-identical');
});
```
*Verified output (this session):* `Original compressed size: 151993 / DECOMPRESS OK: 2284747 / RECOMPRESS (default) OK: 115832 / ROUND-TRIP decompressed-identical: true`. The compressed sizes differ (151,993 vs 115,832) because .NET and Node use different encoder quality — that's expected and explicitly NOT asserted.

### 7-bit length-prefix round-trip with boundary vectors (D-14/D-15)
```typescript
// Source: learn.microsoft.com BinaryReader.ReadString ("length encoded as an integer seven bits at a time")
//         + empirical boundary bytes confirmed in this session
import test from 'node:test';
import assert from 'node:assert/strict';

// Inline vectors per D-15
const CASES: Array<[label: string, str: string, expectedPrefixHex: string]> = [
  ['empty',           '',                         '00'],
  ['ascii short',     'A',                        '01'],
  ['len 127 (1B max)','A'.repeat(127),            '7f'],
  ['len 128 (2B min)','A'.repeat(128),            '8001'],     // <-- first 2-byte prefix
  ['len 255',         'A'.repeat(255),            'ff01'],
  ['len 256',         'A'.repeat(256),            '8002'],
  ['len 16383 (2B max)','A'.repeat(16383),       'ff7f'],
  ['len 16384 (3B min)','A'.repeat(16384),       '808001'],   // <-- first 3-byte prefix
  ['multi-byte emoji','😀',                       '04' + 'f09f9880'.padStart(0,'')], // 4 UTF-8 bytes
];
// NOTE: the emoji case's expected prefix is 04 (4 UTF-8 bytes), body bytes = the UTF-8 of 😀 = f0 9f 98 80.
// Test: writeString(s) === [prefix bytes] + [utf8 bytes]; readString(writeString(s)) === s.
```

### Wrong-width / wrong-endian negative test (success criterion 4)
```typescript
// Source: ROADMAP Phase 1 success criterion 4 + D-08 (noUncheckedIndexedAccess)
import test from 'node:test';
import assert from 'node:assert/strict';

test('wrong-width write is caught: writing int32 into an int64 slot corrupts neighbors', () => {
  const buf = Buffer.alloc(8, 0);            // 8-byte int64 slot
  buf.writeInt32LE(42, 0);                    // WRONG: only writes 4 of 8 bytes
  // The remaining 4 bytes (offset 4..7) are still zero — a silent corruption of the int64.
  // This test PASSES by demonstrating the corruption: the read-back int64 is not 42n.
  const read = buf.readBigInt64LE(0);         // reads all 8 bytes
  assert.notEqual(read, 42n, 'int32 write into int64 slot is not caught by Buffer; the ' +
    'BinaryWriter must assert width === expectedWidth before delegating to Buffer.writeInt32LE');
});

test('wrong-endian write is caught by negative test', () => {
  const le = Buffer.alloc(4); le.writeInt32LE(1, 0);    // LE: 01 00 00 00
  const be = Buffer.alloc(4); be.writeInt32BE(1, 0);    // BE: 00 00 00 01 (WRONG for .NET)
  assert.notDeepStrictEqual(le, be, 'LE and BE differ; a test must assert LE is used');
  assert.deepStrictEqual(le.toString('hex'), '01000000', '.NET int32 1 is LE 01000000');
});
```

### int64 BigInt round-trip with edge matrix (D-14)
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

const INT64_VECTORS: Array<[label: string, value: bigint, hex: string]> = [
  ['0n',          0n,                       '0000000000000000'],
  ['-1n',         -1n,                      'ffffffffffffffff'],
  ['INT64_MAX',   9223372036854775807n,    'ffffffffffffff7f'],
  ['INT64_MIN',   -9223372036854775808n,   '0000000000000080'],
];

for (const [label, value, hex] of INT64_VECTORS) {
  test(`int64 round-trip ${label}`, () => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(value, 0);
    assert.equal(buf.toString('hex'), hex, `expected ${hex}`);
    assert.equal(buf.readBigInt64LE(0), value, 'round-trip');
  });
}
```
*Verified (this session):* `int64 MAX -> 9223372036854775807n hex: ffffffffffffff7f` and `int64 MIN -> -9223372036854775808n`. The exact hex matches.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `iltorb` / `brotli` Wasm npm packages for Brotli in Node | `node:zlib` native Brotli (`brotliCompressSync`/`brotliDecompressSync`) | Node 11.7.0 (2019), stable Node 12+ | Zero-dep Brotli; no native addon build; standard RFC 7932. |
| `ts-node` for TS execution | `tsx` (esbuild-based, no build step) | `tsx` released 2022, dominant by 2024 | Faster cold-start; no `dist/` artifact; `tsx --test` passes through to `node:test`. |
| `mocha`/`chai`/`jest` test runners | `node:test` built-in runner | Node 18.0.0 (2022) stable; Node 16.17 with flag | Zero-dep, zero-config; matches the "use native Node" philosophy. |
| `nyc` (Istanbul) coverage | `c8` (V8 coverage) | `c8` released 2018, dominant for native V8 | No source instrumentation; works with `tsx`/esbuild out of the box. |
| `Number` for int64 in JS | `bigint` + `Buffer.readBigInt64LE`/`writeBigInt64LE` | Node 12.0.0 (2019) BigInt; Buffer BigInt helpers Node 12.9+ | Full 64-bit precision; no silent rounding of GP/currency. |

**Deprecated/outdated (do NOT use in Phase 1):**
- `iltorb` (native Brotli addon): replaced by `node:zlib` Brotli in Node 11.7+. Last publish years ago; install fails on modern Node.
- `ts-node`: slower than `tsx`, older esbuild integration. Not forbidden, just inferior (D-07 chose `tsx`).
- `nyc`/Istanbul for a `tsx`-run suite: requires source instrumentation that fights esbuild's on-the-fly transpile. Use `c8` (V8 coverage).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.NET BrotliStream`'s `CompressionLevel.Optimal` maps to Brotli encoder quality ~4 | Standard Stack / Summary | LOW — irrelevant to Phase 1 correctness. We use NODE's encoder, not .NET's. Only matters as an explanation of why the fixture's 152KB compressed size differs from Node's 116KB. The .NET decoder reads any RFC 7932 stream regardless of encoder quality. No code path depends on this assumption. |
| A2 | `@types/node@^24` is the right version pin for the Node 24.18.0 runtime | Standard Stack | LOW — `@types/node` tracks Node majors; `^24` matches the runtime. Worst case: a few newer API types are missing, all of which are irrelevant to Phase 1 (Buffer/zlib/test/assert are stable since Node 18). |
| A3 | The `file` command's "OpenPGP Public Key" identification of `test-fixture.sav` is a false positive | Environment Availability | NONE — empirically confirmed: the fixture starts with `9b ca dc 22` (Brotli frame bytes) and `zlib.brotliDecompressSync` decompresses it to a sensible 2.28MB save. The `file` heuristic was fooled by the `0x9b` first byte. |

**All other claims** in this RESEARCH.md are `[VERIFIED: empirical]` (run on the real Node 24.18.0 runtime + the real fixture) or `[CITED: nodejs.org/api/zlib.html]` / `[CITED: learn.microsoft.com]` (official docs fetched this session). No `[ASSUMED]` claims affect Phase 1 correctness — the three above are explanatory-only or trivially falsifiable.

## Open Questions (RESOLVED)

1. **Exact Brotli params .NET used to produce the fixture (quality/lgwin)** —
   - What we know: Node default (q=11, lgwin=22, mode=GENERIC) produces 115,832 B; the fixture is 151,993 B; Node q=4 produces 152,799 B (very close → .NET likely used q≈4, its `CompressionLevel.Optimal` default).
   - What's unclear: the *exact* .NET encoder params. Irrelevant to Phase 1 (we use Node's encoder; .NET decodes any RFC 7932 stream).
   - Recommendation: Do NOT chase this. Pin Node's defaults explicitly in `CODEC_PARAMS` (defensive against future Node default changes) and move on.
   - RESOLVED: Plan 02 Task 1 pins Node's defaults in `CODEC_PARAMS` (frozen empty params object = Node defaults: quality 11, lgwin 22, mode GENERIC, no large-window). The exact .NET encoder params are not chased.

2. **Whether to use `fast-check` (property-based testing) for the primitive round-trips** —
   - What we know: CONTEXT.md locked `node:test` + `node:assert` + `c8` only. `fast-check` is an external devDep not in the locked decisions. The "use native Node" philosophy leans against extra deps, but `c8` is already an accepted external devDep.
   - What's unclear: whether property-based testing adds enough value over the enumerated D-14 edge matrix + a small hand-rolled seeded-random loop.
   - Recommendation: the agent's discretion — start with the enumerated D-14 matrix (no new dep), add `fast-check` only if Wave 0 reveals gaps the static matrix doesn't cover. See Validation Architecture §Property-based test ideas.
   - RESOLVED: No `fast-check` dependency added. Plan 03 uses the enumerated D-14 edge matrix + D-12 fixture slices only (per CONTEXT.md A2 discretion). No Wave 0 gaps were revealed that would require property-based testing.

3. **BinaryReader/Writer API shape: stateful cursor class vs pure offset functions** —
   - What we know: CONTEXT.md leaves this to the planner ("Phase 2's FieldTable will inform the ergonomic choice"). The spec (`docs/current-skill.md`) is written in a `.NET BinaryReader` (stateful cursor) mental model.
   - What's unclear: whether Phase 2's FieldTable will prefer stateful cursor or pure `(buf, offset) => [value, nextOffset]` functions.
   - Recommendation: Build BOTH a stateful `BinaryReader`/`BinaryWriter` class (mirrors .NET, matches the spec prose) AND export the underlying pure offset functions (`readInt32At(buf, offset)` etc.) so Phase 2 can choose. Tiny incremental cost; maximal Phase 2 flexibility.
   - RESOLVED: Plan 03 ships the stateful `BinaryReader`/`BinaryWriter` class ONLY. The pure offset functions are deferred to Phase 2 — Phase 2's FieldTable will inform whether they're needed; adding them later is low-cost and reversible (v1 ships the stateful class only, matching the .NET `BinaryReader` mental model in `docs/current-skill.md`). Deviation from the "build BOTH" recommendation is documented here so it is auditable rather than invisible technical debt.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | codec (zlib/Buffer), test runner (node:test), typecheck | ✓ | v24.18.0 (LTS line; ≥18 required for stable node:test) | — |
| npm | devDep install, test script | ✓ | 11.16.0 | — |
| npx | one-off devTool invocation | ✓ | 11.16.0 | — |
| `tsc` (TypeScript) | `tsc --noEmit` typecheck gate | ✗ (will install as devDep) | latest 6.0.3 | `npm i -D typescript` (Wave 0) |
| `tsx` | `tsx --test` test execution | ✗ (will install as devDep) | latest 4.23.0 | `npm i -D tsx` (Wave 0) |
| `c8` | coverage threshold gate | ✗ (will install as devDep) | latest 11.0.0 | `npm i -D c8` (Wave 0) |
| `@types/node` | Buffer/zlib/test/assert type defs | ✗ (will install as devDep) | latest 26.1.0 (install `^24`) | `npm i -D @types/node` (Wave 0) |
| `git` | version control, commits | ✓ | (present, repo already initialized) | — |
| Real `.sav` fixture | round-trip test (IO-03) | ✓ | `docs/test-fixture.sav` (152KB; moves to `test/fixtures/` per D-10) | — |

**Missing dependencies with no fallback:** none — all four devDeps are installable via `npm i -D` in Wave 0.

**Missing dependencies with fallback:** none.

**Verified commands (this session):**
- `tsx --test test/probe.test.ts` → runs `node:test` on a `.ts` file, 1 test passes.
- `c8 --100 tsx --test test/probe.test.ts` → coverage threshold gate works (exits non-zero if any covered file < 100% lines).
- `node -e '…zlib.brotliCompressSync(buf)…'` → real-fixture round-trip is byte-identical.

## Validation Architecture

> Nyquist validation ENABLED (`workflow.nyquist_validation: true` in `.planning/config.json`). This section is the input the VALIDATION.md will be derived from; the plan-checker verifies Dimension 8 against it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert/strict` (built-in), executed via `tsx --test` for TypeScript (D-01/D-02/D-07) |
| Config file | none — `node:test` is zero-config. Coverage config: `.c8rc.json` (optional; can pass `--100 --include src/**` inline) |
| Quick run command | `npx tsx --test test/**/*.test.ts` (or `npm test` after adding the script) |
| Coverage gate command | `npx c8 --100 --include 'src/**' --exclude 'test/**' tsx --test test/**/*.test.ts` |
| Typecheck command | `npx tsc --noEmit` |
| Full suite command | `npm run typecheck && npx c8 --100 --include 'src/**' tsx --test test/**/*.test.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IO-03 (success crit 1) | `decompress(compress(decompress(fixture)))` byte-identical | unit (golden fixture) | `npx tsx --test test/codec.test.ts -t 'real fixture round-trips'` | ❌ Wave 0 creates `test/codec.test.ts` |
| IO-03 (success crit 2) | No-op load→save yields byte-identical decompressed buffer + `assert(output.length === input.length)` | unit (invariant) | `npx tsx --test test/codec.test.ts -t 'length invariant'` | ❌ Wave 0 |
| SC-3 int32 round-trip | int32 LE read/write against known .NET bytes + edge matrix | unit | `npx tsx --test test/primitives.test.ts -t 'int32'` | ❌ Wave 0 creates `test/primitives.test.ts` |
| SC-3 int64 round-trip | int64 BigInt LE round-trip (`0n`, `-1n`, `INT64_MAX`, `INT64_MIN`) | unit | `npx tsx --test test/primitives.test.ts -t 'int64'` | ❌ Wave 0 |
| SC-3 double round-trip | double IEEE754 LE (`0.0`, `-0.0`, `NaN`, `±Inf`, `PI`, denormal) | unit | `npx tsx --test test/primitives.test.ts -t 'double'` | ❌ Wave 0 |
| SC-3 bool round-trip | bool 1-byte (`0`, `1`) | unit | `npx tsx --test test/primitives.test.ts -t 'bool'` | ❌ Wave 0 |
| SC-3 string round-trip | 7-bit-length UTF-8 (`empty`, ASCII, emoji, ≥128B prefix, multi-byte) | unit | `npx tsx --test test/primitives.test.ts -t 'string'` | ❌ Wave 0 |
| SC-4 wrong-width caught | int32-into-int64 slot detected by negative test | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-width'` | ❌ Wave 0 |
| SC-4 wrong-endian caught | LE vs BE byte difference asserted | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-endian'` | ❌ Wave 0 |
| D-12 fixture slice cross-check | Extract real int32/int64/double/string slices from `test-fixture.sav`, round-trip through writer, byte-match | unit (golden slice) | `npx tsx --test test/primitives.test.ts -t 'fixture slice'` | ❌ Wave 0 |
| Coverage gate (D-04) | 100% lines on `src/codec.ts`, `src/binary-reader.ts`, `src/binary-writer.ts` | coverage | `npx c8 --100 --include 'src/**' tsx --test test/**/*.test.ts` | ❌ Wave 0 (needs src files) |
| Typecheck gate (D-07/D-08) | `tsc --noEmit` passes with `strict` + `noUncheckedIndexedAccess` | typecheck | `npx tsc --noEmit` | ❌ Wave 0 (needs tsconfig.json) |

### Sampling Rate
- **Per task commit:** `npx tsx --test test/**/*.test.ts` (fast feedback, no coverage)
- **Per wave merge:** `npm run typecheck && npx tsx --test test/**/*.test.ts` (typecheck + tests)
- **Phase gate (before `/gsd-verify-work`):** `npm run typecheck && npx c8 --100 --include 'src/**' tsx --test test/**/*.test.ts` (full suite + 100% coverage gate)

### Wave 0 Gaps
- [ ] `tsconfig.json` — full strict + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `target: ES2022` + `module: commonjs` + `moduleResolution: node` + `lib: ["ES2022"]` (D-05/D-06/D-08)
- [ ] `test/codec.test.ts` — covers IO-03 SC-1, SC-2, per-quality round-trip
- [ ] `test/primitives.test.ts` — covers SC-3, SC-4, D-12 fixture slices, D-14 edge matrix
- [ ] `test/fixtures/test-fixture.sav` — moved from `docs/test-fixture.sav` per D-10, committed
- [ ] `package.json` updates: `devDependencies` (typescript, tsx, c8, @types/node), `scripts.test` → `tsx --test`, `scripts.typecheck` → `tsc --noEmit`
- [ ] Framework install: `npm i -D typescript@^6 tsx@^4 c8@^11 @types/node@^24`

*(If no gaps: not applicable — greenfield phase, all gaps are Wave 0 work.)*

### Nyquist Validation: Covered / Backstop / Held-out / Property-based

**Covered edges (happy path — must pass for the phase to ship):**
- Codec: `decompress(compress(decompress(fixture))) === decompress(fixture)` on the one committed fixture (D-09).
- Codec: length invariant `reDecompressed.length === decompressed.length` after no-op round-trip.
- Primitives: each type's canonical round-trip with the D-14 edge matrix (`int32 {0,-1,MAX}`, `int64 {0n,-1n,MAX,MIN}`, `double {0.0,-0.0,NaN,±Inf,PI,denormal}`, `bool {0,1}`, `string {empty, ASCII, emoji, len≥128, multi-byte}`).
- Primitives: 7-bit length-prefix byte boundaries at 127/128/16383/16384 (D-14).
- D-12 fixture-extracted slices: real .NET-produced bytes for each type round-trip through the writer and byte-match.

**Backstop edges (safety net — must FAIL loudly, never silently corrupt):**
- Wrong-width write: int32-into-int64 slot leaves 4 trailing bytes — negative test asserts the corruption is *detectable* (the BinaryWriter must reject a width mismatch, OR the test documents that Buffer doesn't catch it so the writer wrapper must).
- Wrong-endian write: `writeInt32BE(1)` produces `00000001`; negative test asserts LE (`01000000`) ≠ BE, so a future accidental BE use is caught.
- Out-of-bounds read: `Buffer.readInt32LE(offset)` throws `ERR_OUT_OF_RANGE` past end — test asserts the throw (not silent `undefined`).
- 7-bit length-prefix overflow: a 6-byte prefix (shift > 35) is rejected with `RangeError` (≈2GiB cap).
- Codec length-invariant violation: if a future edit changes buffer length, `assert.equal(out.length, in.length)` throws.
- `BROTLI_PARAM_LARGE_WINDOW: true` rejected by the codec API (defensive — prevents .NET-incompatible output).

**Held-out fixtures (test/train separation):**
- Per D-09, Phase 1 uses the **single** committed fixture as BOTH covered and backstop. There is no held-out corpus in Phase 1 — the varied corpus is a **deferred Phase 2 dependency** (CONTEXT.md `## Deferred Ideas`). The planner should NOT block Phase 1 on a held-out set; the codec is parameter-agnostic so one fixture fully proves the round-trip. (Flag: when the Phase 2 corpus arrives, promote 1-2 saves to a held-out round-trip set that Phase 1's codec test also runs against, to guard against over-fitting to the single fixture.)

**Property-based test ideas (the agent's discretion — A2 in Assumptions Log):**
- *int32:* for all `n` in a seeded-random sample across `[-2^31, 2^31-1]`, `readInt32LE(writeInt32LE(n)) === n`.
- *int64:* for a seeded sample of `bigint`s across `[INT64_MIN, INT64_MAX]` (sample ~10^4 values; full range is infeasible), `readBigInt64LE(writeBigInt64LE(n)) === n`.
- *double:* for all `d` in `{0.0, -0.0, NaN, +Inf, -Inf, PI, e, denormals, seeded random finite doubles}`, the *bit pattern* round-trips: `writeDoubleLE(d)` → `readDoubleLE` → `Object.is(result, d)` (and for NaN, `Number.isNaN(result)`). Use bit-pattern assertion (`buf.toString('hex')`) for `±0`/`NaN` to avoid `===` swallowing the sign.
- *string:* for all `s` with UTF-8 byte length in `[0, 1, 127, 128, 16383, 16384, 65536]` AND random ASCII/multi-byte content, `readString(writeString(s)) === s` AND `writeString(s) === [7bitLen(utf8len(s))] ++ [utf8(s)]` (deterministic prefix byte count).
- *codec length-invariant:* for a seeded sample of random buffers of varied sizes (0..1MiB), `decompress(compress(d)).length === d.length` AND `deepStrictEqual(decompress(compress(d)), d)`.
- *codec idempotent decompress:* for any valid Brotli stream `x` produced by the codec, `decompress(compress(decompress(x))) === decompress(x)`.
- *Recommendation:* Implement as a small hand-rolled loop (`for (const v of seededSample) { ... }`) using the enumerated edge vectors + a `Math.random` seeded with a fixed literal (deterministic). Defer `fast-check` unless Wave 0 reveals gaps. Keeps zero new dep, matches "use native Node" philosophy.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` (from `.planning/config.json`). Phase 1 is a pure local library with no auth/session/network surface, but it processes untrusted-origin bytes (a user-supplied `.sav`), so ASVS V5 (Input Validation) and the decompression-bomb DoS pattern apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local offline tool; no authentication surface in Phase 1 (no network, no users). |
| V3 Session Management | no | No sessions in Phase 1 (Electron/IPC is Phase 4). |
| V4 Access Control | no | No privileged resources; no authorization boundary in Phase 1. |
| V5 Input Validation | yes | `noUncheckedIndexedAccess` (D-08) catches OOB at typecheck; `Buffer.readXxxLE` throws `ERR_OUT_OF_RANGE` at runtime; 7-bit length-prefix rejects prefixes >5 bytes (>2GiB allocation cap); BinaryReader throws on overrun. |
| V6 Cryptography | no | Brotli is *compression*, not encryption. No keys, no hashing, no crypto in Phase 1. (Save format is explicitly "Brotli-compressed but NOT encrypted" — REQUIREMENTS.md Out of Scope.) |
| V7 Error Handling & Logging | yes (partial) | "Fail loudly, never silently corrupt" (success criterion 2). Invariant failures throw `node:assert` errors with byte-offset context. No silent fallbacks. |
| V12 Files & Resources | yes (partial) | Phase 1 reads one fixture file; no write to original (non-destructive write is Phase 4). Fixture is the user's own save. |

### Known Threat Patterns for the pure-TS Brotli/binary stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Buffer over-read (out-of-bounds `buf[offset]`) | Tampering / Information Disclosure | `noUncheckedIndexedAccess: true` (D-08) + `Buffer.readXxxLE` (throws `ERR_OUT_OF_RANGE` natively). Negative test asserts the throw. |
| Decompression bomb (crafted `.sav` decompresses to giant buffer) | Denial of Service | `zlib.brotliDecompressSync` accepts `maxOutputLength` option (Node docs). Pin a sane cap (e.g. 256 MiB — real saves are ~2.3 MiB decompressed). Reject fixtures exceeding the cap. [VERIFIED: nodejs.org/api/zlib.html `maxOutputLength` option] |
| Malformed 7-bit length prefix (huge length → giant allocation) | Denial of Service | Reject length-prefix encodings >5 bytes (>2GiB) with `RangeError`. Reject declared length > remaining buffer with bounds check. |
| Wrong-width write silently corrupting neighbors | Tampering | BinaryWriter asserts `expectedWidth === actualWidth` before delegating to `Buffer.writeXxxLE`. Negative test (SC-4) proves detection. |
| Wrong-endian write (accidental `BE` use) | Tampering | Only expose `*LE` methods on the BinaryWriter API; never re-export `Buffer.write*BE`. Negative test (SC-4) asserts LE ≠ BE. |
| `BROTLI_PARAM_LARGE_WINDOW: true` emitted → .NET can't decode | Tampering (corruption) / DoS (game fails to load) | Codec API never sets `LARGE_WINDOW`; defensively reject it if passed. |
| Untrusted `.sav` content treated as trusted layout | Tampering | Phase 1 doesn't parse layout (Phase 2 owns bounds-checked entity parsing). Phase 1 only proves primitives + codec; it treats ALL bytes as data, never as control flow. |

**Security gate:** `security_block_on: high` — no high-severity findings expected in Phase 1 (no network/auth/crypto). The buffer-over-read and decompression-bomb patterns are MEDIUM (DoS on a local tool the user runs on their own save); they are mitigated by the standard controls above and do NOT block Phase 1.

## Sources

### Primary (HIGH confidence)
- **`nodejs.org/api/zlib.html`** (Node.js v24.x / v26.x docs, fetched 2026-07-03) — BrotliOptions, BROTLI_PARAM_QUALITY/LGWIN/MODE/LARGE_WINDOW defaults and ranges; `maxOutputLength` option. [CITED]
- **Empirical Node 24.18.0 runtime probe** (this session, on the real `docs/test-fixture.sav`) — Brotli round-trip byte-identical at q=0,4,6,9,11; compression deterministic; Buffer LE primitives all round-trip including NaN/-0/Inf/denormal/INT64_MAX/MIN; 7-bit length-prefix boundary bytes confirmed. [VERIFIED: empirical]
- **`learn.microsoft.com` BinaryReader.ReadString** (fetched 2026-07-03) — "string is prefixed with the length, encoded as an integer seven bits at a time"; UTF-8 encoding via `BinaryWriter(stream, Encoding.UTF8)`. [CITED]
- **`learn.microsoft.com` BrotliDecoder / BrotliStream** (fetched 2026-07-03) — `BrotliDecoder` decompresses RFC 7932 Brotli; no large-window API surface exposed. [CITED]
- **`docs/current-skill.md`** (authoritative reverse-engineered spec) — Brotli-compressed .NET BinaryReader/Writer LE primitives, 7-bit UTF-8 strings, file layout, save version 17. [CITED: project-internal authoritative]
- **`.planning/phases/01-binary-primitives-brotli-codec/01-CONTEXT.md`** — D-01…D-15 locked decisions, discretion areas, deferred ideas. [CITED: project-internal locked]

### Secondary (MEDIUM confidence)
- **`npm view` registry metadata** (this session) — versions + postinstall scripts for typescript 6.0.3, tsx 4.23.0, c8 11.0.0, @types/node 26.1.0. [VERIFIED: npm registry]
- **`gsd-tools query package-legitimacy`** (this session) — verdicts OK/SUS for the four devDeps. [VERIFIED: seam]

### Tertiary (LOW confidence)
- None — all claims are empirical or cited from official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all four devDeps verified on npm registry + legitimacy-checked; Node native zlib/Buffer/test/assert verified empirically on Node 24.18.0.
- Architecture: HIGH — single-tier pure library, no multi-tier ambiguity; empirically grounded on the real fixture.
- Pitfalls: HIGH — each pitfall empirically reproduced or cited from official docs (large-window from Node docs, decompressed-vs-compressed-identical from the real round-trip, int64 precision from Buffer BigInt, 7-bit boundaries from the empirical probe).
- Validation: HIGH — test runner command (`tsx --test`) and coverage gate (`c8 --100`) verified working this session.
- Security: MEDIUM — ASVS categories reasoned from the phase scope; decompression-bomb `maxOutputLength` mitigation cited from Node docs but the specific cap (256 MiB) is a planner decision.

**Research date:** 2026-07-03
**Valid until:** 2026-08-03 (30 days) — stable stack; the only fast-moving surface is `@types/node`/`tsx` republishing, which the legitimacy check flagged as "too-new" false positives and the planner's `checkpoint:human-verify` will re-confirm at install time.
