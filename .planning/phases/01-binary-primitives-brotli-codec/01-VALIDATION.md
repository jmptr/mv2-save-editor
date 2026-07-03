---
phase: 1
slug: binary-primitives-brotli-codec
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture (research confidence: HIGH).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) + `node:assert/strict` (built-in), executed via `tsx --test` for TypeScript (D-01/D-02/D-07) |
| **Config file** | none — `node:test` is zero-config. Coverage config: `.c8rc.json` (optional; can pass `--100 --include src/**` inline) |
| **Quick run command** | `npx tsx --test test/**/*.test.ts` (or `npm test` after adding the script) |
| **Full suite command** | `npm run typecheck && npx c8 --100 --include 'src/**' --exclude 'test/**' tsx --test test/**/*.test.ts` |
| **Estimated runtime** | ~3–6 seconds (single fixture + in-memory primitive matrix; no I/O-heavy work) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test test/**/*.test.ts`
- **After every plan wave:** Run `npm run typecheck && npx tsx --test test/**/*.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green: `npm run typecheck && npx c8 --100 --include 'src/**' tsx --test test/**/*.test.ts`
- **Max feedback latency:** ~6 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | IO-03 (toolchain) | — | N/A | unit (smoke) | `npx tsx --test test/scaffold.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | IO-03 (fixture) | — | fixture is valid Brotli stream | unit (golden fixture) | `node -e "require('node:zlib').brotliDecompressSync(require('node:fs').readFileSync('test/fixtures/test-fixture.sav'))"` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | IO-03 (typecheck) | — | strict + noUncheckedIndexedAccess active | typecheck | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | IO-03 (supply chain) | T-1-SC | devDep legitimacy gate (tsx + @types/node SUS false-positive) | checkpoint (human-verify) | (Plan 01 Task 2 — six `npm view` checks) | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | IO-03 SC-1 | — | byte-identical decompressed round-trip | unit (golden fixture) | `npx tsx --test test/codec.test.ts -t 'real fixture round-trips'` | ❌ W1 | ⬜ pending |
| 1-02-02 | 02 | 1 | IO-03 SC-2 | — | length invariant fail-loud | unit (invariant) | `npx tsx --test test/codec.test.ts -t 'length invariant'` | ❌ W1 | ⬜ pending |
| 1-02-03 | 02 | 1 | IO-03 (per-quality) | — | decompressed-buffer-identical across qualities | unit | `npx tsx --test test/codec.test.ts -t 'per-quality'` | ❌ W1 | ⬜ pending |
| 1-02-04 | 02 | 1 | IO-03 (bomb cap) | T-1-03 | maxOutputLength enforced | unit (negative) | `npx tsx --test test/codec.test.ts -t 'bomb'` | ❌ W1 | ⬜ pending |
| 1-02-05 | 02 | 1 | IO-03 (large-window) | T-1-05 | large-window param rejected | unit (negative) | `npx tsx --test test/codec.test.ts -t 'large-window'` | ❌ W1 | ⬜ pending |
| 1-02-06 | 02 | 1 | D-04 coverage | — | 100% lines on src/codec.ts | coverage | `npx c8 --100 --include 'src/codec.ts' --exclude 'test/**' tsx --test test/codec.test.ts` | ❌ W1 | ⬜ pending |
| 1-02-07 | 02 | 1 | D-07/D-08 typecheck | — | strict + noUncheckedIndexedAccess | typecheck | `npx tsc --noEmit` | ❌ W1 | ⬜ pending |
| 1-03-01 | 03 | 1 | SC-3 int32 | T-1-01 | reject wrong-width write | unit | `npx tsx --test test/primitives.test.ts -t 'int32'` | ❌ W1 | ⬜ pending |
| 1-03-02 | 03 | 1 | SC-3 int64 | T-1-01 | BigInt LE, no precision loss | unit | `npx tsx --test test/primitives.test.ts -t 'int64'` | ❌ W1 | ⬜ pending |
| 1-03-03 | 03 | 1 | SC-3 double | — | NaN/-0/Inf bit-pattern round-trip | unit | `npx tsx --test test/primitives.test.ts -t 'double'` | ❌ W1 | ⬜ pending |
| 1-03-04 | 03 | 1 | SC-3 bool | — | 1-byte 0/1 | unit | `npx tsx --test test/primitives.test.ts -t 'bool'` | ❌ W1 | ⬜ pending |
| 1-03-05 | 03 | 1 | SC-3 string | T-1-02 | 7-bit length prefix reject >5 bytes | unit | `npx tsx --test test/primitives.test.ts -t 'string'` | ❌ W1 | ⬜ pending |
| 1-03-06 | 03 | 1 | SC-4 wrong-width | T-1-01 | detect width mismatch loudly | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-width'` | ❌ W1 | ⬜ pending |
| 1-03-07 | 03 | 1 | SC-4 wrong-endian | T-1-01 | LE ≠ BE, never re-export BE | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-endian'` | ❌ W1 | ⬜ pending |
| 1-03-08 | 03 | 1 | D-12 slice | — | real .NET bytes byte-match | unit (golden slice) | `npx tsx --test test/primitives.test.ts -t 'fixture slice'` | ❌ W1 | ⬜ pending |
| 1-03-09 | 03 | 1 | D-04 coverage | — | 100% lines on src/binary-reader.ts + src/binary-writer.ts | coverage | `npx c8 --100 --include 'src/binary-reader.ts' --include 'src/binary-writer.ts' --exclude 'test/**' tsx --test test/primitives.test.ts` | ❌ W1 | ⬜ pending |
| 1-03-10 | 03 | 1 | D-07/D-08 typecheck | — | strict + noUncheckedIndexedAccess | typecheck | `npx tsc --noEmit` | ❌ W1 | ⬜ pending |

*Task IDs map to the actual PLAN.md decomposition: Plan 01 (Wave 0) = scaffold + fixture move + toolchain + human-verify checkpoint; Plan 02 (Wave 1) = codec + codec tests + coverage/typecheck gates (Task 2); Plan 03 (Wave 1) = primitives + primitives tests + coverage/typecheck gates (Task 2). `test/codec.test.ts` and `test/primitives.test.ts` are created via TDD as the first action step of their respective Wave 1 plans — they are NOT pre-stubbed in Wave 0 (Plan 01 creates only `test/scaffold.test.ts`). Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tsconfig.json` — full strict + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `target: ES2022` + `module: commonjs` + `moduleResolution: node` + `lib: ["ES2022"]` (D-05/D-06/D-08)
- [ ] `test/scaffold.test.ts` — trivial `node:test` smoke test proving `tsx --test` runs `.test.ts` files (Plan 01 Task 1)
- [ ] `test/fixtures/test-fixture.sav` — moved from `docs/test-fixture.sav` per D-10, committed
- [ ] `package.json` updates: `devDependencies` (typescript, tsx, c8, @types/node), `scripts.test` → `tsx --test`, `scripts.typecheck` → `tsc --noEmit`
- [ ] Framework install: `npm i -D typescript@^6 tsx@^4 c8@^11 @types/node@^24` (with `checkpoint:human-verify` on tsx + @types/node per legitimacy protocol — false-positive "too-new" flags)

*`test/codec.test.ts` and `test/primitives.test.ts` are NOT Wave 0 stubs — they are created via TDD as the first action step of Plan 02 Task 1 and Plan 03 Task 1 respectively (Wave 1). Plan 01 explicitly does NOT pre-stub them (see 01-01-PLAN.md Task 1 action: "do NOT create ... test/codec.test.ts, or test/primitives.test.ts — Wave 1 plans own those"). The plans use TDD (test written as the first step of the implementation task) rather than pre-stubbing in Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| tsx/@types/node install is safe post-checkpoint | IO-03 (supply chain) | legitimacy check flagged "too-new" (false positive on long-established packages); planner protocol requires human confirm at install | Review `npm view` versions + postinstall scripts before `npm i -D`; confirm no unexpected postinstall |

*All runtime phase behaviors have automated verification. The only manual gate is the devDep install human-verify checkpoint.*

---

## Nyquist Edge Coverage

**Covered edges (happy path — must pass for the phase to ship):**
- Codec: `decompress(compress(decompress(fixture))) === decompress(fixture)` on the committed fixture (D-09).
- Codec: length invariant `reDecompressed.length === decompressed.length` after no-op round-trip.
- Primitives: each type's canonical round-trip with the D-14 edge matrix (`int32 {0,-1,MAX}`, `int64 {0n,-1n,MAX,MIN}`, `double {0.0,-0.0,NaN,±Inf,PI,denormal}`, `bool {0,1}`, `string {empty, ASCII, emoji, len≥128, multi-byte}`).
- Primitives: 7-bit length-prefix byte boundaries at 127/128/16383/16384 (D-14).
- D-12 fixture-extracted slices: real .NET-produced bytes for each type round-trip through the writer and byte-match.

**Backstop edges (safety net — must FAIL loudly, never silently corrupt):**
- Wrong-width write: int32-into-int64 slot leaves trailing bytes — negative test asserts corruption is *detectable*.
- Wrong-endian write: `writeInt32BE(1)` produces `00000001`; negative test asserts LE (`01000000`) ≠ BE.
- Out-of-bounds read: `Buffer.readInt32LE(offset)` throws `ERR_OUT_OF_RANGE` past end — test asserts the throw.
- 7-bit length-prefix overflow: a 6-byte prefix (shift > 35) rejected with `RangeError` (≈2GiB cap).
- Codec length-invariant violation: `assert.equal(out.length, in.length)` throws on length change.
- `BROTLI_PARAM_LARGE_WINDOW: true` rejected by the codec API (defensive — prevents .NET-incompatible output).

**Held-out fixtures:**
- Phase 1 uses the **single** committed fixture as BOTH covered and backstop. No held-out corpus in Phase 1 — varied corpus is a deferred Phase 2 dependency. The codec is parameter-agnostic so one fixture fully proves the round-trip. (Flag: when the Phase 2 corpus arrives, promote 1–2 saves to a held-out round-trip set.)

**Property-based test ideas (the agent's discretion — A2):**
- *int32 / int64 / double / string:* seeded-random sample round-trips (bit-pattern assertion for `±0`/`NaN`).
- *codec length-invariant + idempotent decompress:* seeded sample of random buffers of varied sizes (0..1MiB).
- *Recommendation:* hand-rolled `for (const v of seededSample)` loop with fixed-seed `Math.random`; defer `fast-check` unless Wave 0 reveals gaps (zero new dep, matches "use native Node" philosophy).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Plan 01 has automated verify on Task 1 + Task 3 and a checkpoint:human-verify on Task 2; Plans 02/03 have automated verify on every task)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task runs `npx tsx --test` / `npx tsc --noEmit` / `npx c8`)
- [x] Wave 0 covers all MISSING references (tsconfig.json + package.json devDeps + test/scaffold.test.ts + fixture move + legitimacy checkpoint — Wave 1 plans create their own test files via TDD)
- [x] No watch-mode flags (all commands are one-shot: `tsx --test`, `tsc --noEmit`, `c8 --100`)
- [x] Feedback latency < 6s (~3–6s estimated: single fixture + in-memory primitive matrix)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated — Per-Task Verification Map realigned to actual PLAN.md decomposition (Plan 01 Wave 0 = scaffold + fixture + toolchain + checkpoint; Plan 02 Wave 1 = codec + codec tests + coverage/typecheck; Plan 03 Wave 1 = primitives + primitives tests + coverage/typecheck). Test files created via TDD in Wave 1, not pre-stubbed in Wave 0.
