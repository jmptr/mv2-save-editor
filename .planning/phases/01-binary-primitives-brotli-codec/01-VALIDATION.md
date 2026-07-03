---
phase: 1
slug: binary-primitives-brotli-codec
status: draft
nyquist_compliant: false
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
| 1-01-01 | 01 | 0 | IO-03 SC-1 | — | N/A | unit (golden fixture) | `npx tsx --test test/codec.test.ts -t 'real fixture round-trips'` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | IO-03 SC-2 | — | fail loudly on length invariant | unit (invariant) | `npx tsx --test test/codec.test.ts -t 'length invariant'` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | SC-3 int32 | T-1-01 | reject wrong-width write | unit | `npx tsx --test test/primitives.test.ts -t 'int32'` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | SC-3 int64 | T-1-01 | BigInt LE, no precision loss | unit | `npx tsx --test test/primitives.test.ts -t 'int64'` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | SC-3 double | — | NaN/-0/Inf bit-pattern round-trip | unit | `npx tsx --test test/primitives.test.ts -t 'double'` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | SC-3 bool | — | 1-byte 0/1 | unit | `npx tsx --test test/primitives.test.ts -t 'bool'` | ❌ W0 | ⬜ pending |
| 1-02-05 | 02 | 1 | SC-3 string | T-1-02 | 7-bit length prefix reject >5 bytes | unit | `npx tsx --test test/primitives.test.ts -t 'string'` | ❌ W0 | ⬜ pending |
| 1-02-06 | 02 | 1 | SC-4 wrong-width | T-1-01 | detect width mismatch loudly | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-width'` | ❌ W0 | ⬜ pending |
| 1-02-07 | 02 | 1 | SC-4 wrong-endian | T-1-01 | LE ≠ BE, never re-export BE | unit (negative) | `npx tsx --test test/primitives.test.ts -t 'wrong-endian'` | ❌ W0 | ⬜ pending |
| 1-02-08 | 02 | 1 | D-12 slice | — | real .NET bytes byte-match | unit (golden slice) | `npx tsx --test test/primitives.test.ts -t 'fixture slice'` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | D-04 coverage | — | 100% lines on src/{codec,binary-reader,binary-writer}.ts | coverage | `npx c8 --100 --include 'src/**' tsx --test test/**/*.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | D-07/D-08 typecheck | — | strict + noUncheckedIndexedAccess | typecheck | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Task IDs are provisional — finalized when PLAN.md files are written. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tsconfig.json` — full strict + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `target: ES2022` + `module: commonjs` + `moduleResolution: node` + `lib: ["ES2022"]` (D-05/D-06/D-08)
- [ ] `test/codec.test.ts` — stubs for IO-03 SC-1, SC-2, per-quality round-trip
- [ ] `test/primitives.test.ts` — stubs for SC-3, SC-4, D-12 fixture slices, D-14 edge matrix
- [ ] `test/fixtures/test-fixture.sav` — moved from `docs/test-fixture.sav` per D-10, committed
- [ ] `package.json` updates: `devDependencies` (typescript, tsx, c8, @types/node), `scripts.test` → `tsx --test`, `scripts.typecheck` → `tsc --noEmit`
- [ ] Framework install: `npm i -D typescript@^6 tsx@^4 c8@^11 @types/node@^24` (with `checkpoint:human-verify` on tsx + @types/node per legitimacy protocol — false-positive "too-new" flags)

*Greenfield phase — all infrastructure is Wave 0 work.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 6s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
