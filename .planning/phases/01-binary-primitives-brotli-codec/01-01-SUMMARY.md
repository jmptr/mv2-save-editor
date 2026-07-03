---
phase: 01-binary-primitives-brotli-codec
plan: 01
subsystem: infra
tags: [typescript, tsx, c8, node-test, brotli, commonjs, strict-tsconfig]

# Dependency graph
requires: []
provides:
  - "Full-strict tsconfig.json (D-05/D-08: strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + noImplicitOverride)"
  - "package.json with CommonJS type + devDependencies (typescript, tsx, c8, @types/node) + test/typecheck scripts (D-01/D-06/D-07)"
  - "Committed test fixture at test/fixtures/test-fixture.sav (D-10/D-11 — real 152KB .NET-produced Melvor Idle 2 save, valid Brotli, decompresses to 2,284,747 bytes)"
  - "Installed Node toolchain: tsx --test + tsc --noEmit + c8 all green"
  - "test/scaffold.test.ts trivial node:test smoke test"
affects:
  - "02-codec (Plan 02): consumes tsconfig + package.json + fixture + toolchain for codec round-trip tests (IO-03)"
  - "03-primitives (Plan 03): consumes tsconfig + toolchain for binary-reader/writer primitive tests"

# Tech tracking
tech-stack:
  added:
    - "typescript 6.0.3 (devDep — strict typecheck gate)"
    - "tsx 4.23.0 (devDep — esbuild-based TS execution for node:test)"
    - "c8 11.0.0 (devDep — V8 coverage threshold gate)"
    - "@types/node 24.13.2 (devDep — Node type definitions; ^24 matches Node 24.18.0 runtime)"
  patterns:
    - "Full-strict TypeScript: strict + noUncheckedIndexedAccess (D-08 byte-level OOB safety net) + exactOptionalPropertyTypes + noImplicitOverride"
    - "node:test via tsx --test (D-01/D-07 — zero-dep native test runner, no build step)"
    - "tsc --noEmit as separate typecheck gate (D-07 — strict config active, no dist/ artifact)"
    - "Fixture committed to test/fixtures/ (D-10 — clone-and-test, no local setup)"
    - "Tests decompress fixture at runtime (D-11 — single source of truth, exercises code under test)"

key-files:
  created:
    - "tsconfig.json — full-strict TS config (D-05/D-08)"
    - "test/scaffold.test.ts — trivial node:test smoke test"
    - "test/fixtures/test-fixture.sav — real .NET save (moved from docs/ per D-10)"
    - "package-lock.json — npm lockfile"
  modified:
    - "package.json — added devDependencies + test/typecheck scripts, kept type:commonjs (D-06)"

key-decisions:
  - "Added ignoreDeprecations: \"6.0\" to tsconfig (Rule 3 auto-fix) — TS 6 deprecated moduleResolution=node10 (TS5107); required to keep D-06's CJS+node resolution green without switching module strategy"
  - "Added types: [\"node\"] to tsconfig (Rule 3 auto-fix) — TS 6 no longer auto-includes @types/* by default; required so Buffer/node:test/node:assert/strict resolve under strict mode"
  - "Did NOT approve esbuild's postinstall script (npm allow-scripts warning) — tsx functions correctly without it (esbuild ships a prebuilt binary); least-privilege supply-chain stance"
  - "Did NOT mark IO-03 complete — IO-03 (no-op round-trip + length invariant) is the codec requirement owned by Plan 02; Plan 01-01 only sets up the toolchain IO-03's tests run on"

patterns-established:
  - "Strict TS config: noUncheckedIndexedAccess is the byte-level OOB safety net for the buf[offset]-heavy core (D-08) — never relax"
  - "Test layout: top-level test/ mirroring src/ (D-03); fixture in test/fixtures/ (D-10)"
  - "Toolchain gate sequence: npx tsx --test (runtime) + npx tsc --noEmit (typecheck) both must exit 0"

requirements-completed: []  # IO-03 (no-op round-trip + length invariant) is owned by Plan 02 (codec). Plan 01-01 only sets up the toolchain IO-03's tests will run on. Marking IO-03 complete here would be a false claim — the codec doesn't exist yet. Plan 02 will mark IO-03 complete when src/codec.ts + test/codec.test.ts ship the round-trip + length invariant.

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Full-strict tsconfig.json with noUncheckedIndexedAccess (D-08) + CommonJS module (D-06)"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit exits 0 (strict + noUncheckedIndexedAccess enforced); grep '\"noUncheckedIndexedAccess\": true' tsconfig.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "package.json keeps type:commonjs (D-06) + declares typescript/tsx/c8/@types/node devDeps + test/typecheck scripts (D-01/D-07)"
    verification:
      - kind: automated
        ref: "node -e require('./package.json') — scripts.test='tsx --test test/**/*.test.ts', scripts.typecheck='tsc --noEmit', devDependencies present, type='commonjs'"
        status: pass
    human_judgment: false
  - id: D3
    description: "test/fixtures/test-fixture.sav committed (D-10/D-11) — real .NET save, valid Brotli, decompresses to 2,284,747 bytes (move did not corrupt)"
    verification:
      - kind: automated
        ref: "git status shows rename docs/test-fixture.sav -> test/fixtures/test-fixture.sav; node -e brotliDecompressSync(readFileSync('test/fixtures/test-fixture.sav')).length === 2284747"
        status: pass
    human_judgment: false
  - id: D4
    description: "Toolchain green: tsx --test runs node:test on .test.ts (D-01/D-07), tsc --noEmit passes strict config (D-05/D-08), c8 runs"
    verification:
      - kind: automated
        ref: "npx tsx --test test/scaffold.test.ts (1 pass, exit 0); npx tsc --noEmit (exit 0); npx c8 --100 --include 'src/**' tsx --test (exit 0, no src/ yet)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Supply-chain threat T-1-SC mitigated: tsx + @types/node legitimacy human-verified before install (6 npm view checks)"
    verification:
      - kind: manual_procedural
        ref: "Orchestrator pre-approved checkpoint: npm view tsx version 4.23.0 (privatenumber/tsx, empty postinstall); npm view @types/node 26.1.0 (DefinitelyTyped, empty postinstall); typescript + c8 pre-approved OK"
        status: pass
    human_judgment: true
    rationale: "Package-legitimacy verification is a human-judgment supply-chain gate per T-1-SC protocol — cannot be auto-proven; the orchestrator + user confirmed all 6 npm view checks match research before approving install."

# Metrics
duration: 12min
completed: 2026-07-03
status: complete
---

# Phase 1 Plan 01: Toolchain + Fixture Scaffolding Summary

**Full-strict TypeScript toolchain (tsx + tsc + c8 + @types/node) stood up green, real .sav fixture committed to test/fixtures/, supply-chain gate T-1-SC pre-approved — Wave 1 can now write src/ + test/ against a working strict TS setup.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-03T19:04:16Z
- **Completed:** 2026-07-03T19:16:22Z
- **Tasks:** 3 (1 auto-write, 1 checkpoint pre-approved, 1 auto-install+verify+commit)
- **Files modified:** 5 (tsconfig.json, package.json, package-lock.json, test/fixtures/test-fixture.sav [moved], test/scaffold.test.ts)

## Accomplishments

- **Full-strict tsconfig.json** (D-05/D-08): `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` + `noImplicitOverride: true` + `target/module/lib: ES2022/commonjs/ES2022`. The byte-level OOB safety net (`noUncheckedIndexedAccess`) is active — Wave 1's `buf[offset]`-heavy core gets typecheck-time OOB detection.
- **CommonJS package.json** (D-01/D-06/D-07): kept `"type": "commonjs"`; added `devDependencies` (typescript `^6` → 6.0.3, tsx `^4` → 4.23.0, c8 `^11` → 11.0.0, @types/node `^24` → 24.13.2); replaced stub test script with `tsx --test test/**/*.test.ts` + added `typecheck: tsc --noEmit`.
- **Fixture committed** (D-10/D-11): `git mv docs/test-fixture.sav test/fixtures/test-fixture.sav` — git recognized as 100% rename. Real 152KB .NET-produced Melvor Idle 2 save (save version 17), valid Brotli, decompresses to 2,284,747 bytes (D-10 move did not corrupt it). Tests decompress at runtime — single source of truth, exercises code under test.
- **Toolchain green**: `npx tsx --test test/scaffold.test.ts` → 1 pass, exit 0 (D-01/D-07 — tsx runs node:test on .ts); `npx tsc --noEmit` → exit 0 (D-05/D-08 — strict config compiles cleanly); `npx c8 --100 --include 'src/**' tsx --test` → exit 0 (no src/ yet — coverage gate applies once Wave 1 creates src/codec.ts + binary-reader/writer).
- **Supply-chain threat T-1-SC mitigated** (Task 2): tsx + @types/node legitimacy human-verified via 6 `npm view` checks (orchestrator pre-approved; all matched research). typescript + c8 pre-approved (OK verdict). 0 vulnerabilities; 0 install-time postinstall scripts on any of the 4 direct devDeps.

## Task Commits

Each task was committed atomically. (Task 1 wrote files but did NOT commit — the plan's Task 3 action explicitly stages all scaffolding files in a single atomic commit after install + verify. Task 2 was a pre-approved checkpoint with no code changes.)

1. **Task 1: Write tsconfig + update package.json + git-mv fixture + scaffold test** — no separate commit (files staged in Task 3's commit per plan instruction: "stage tsconfig.json, package.json, package-lock.json, test/fixtures/test-fixture.sav, test/scaffold.test.ts")
2. **Task 2: Verify tsx + @types/node legitimacy (checkpoint:human-verify, gate="blocking")** — pre-approved by orchestrator/user; no code changes; no commit (checkpoint outcome recorded here)
3. **Task 3: Install devDeps + verify toolchain + commit** — `8c38531` (chore)

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `tsconfig.json` (created) — full-strict TS config with noUncheckedIndexedAccess (D-08), module commonjs (D-06), target ES2022, ignoreDeprecations 6.0 + types [node] (Rule 3 auto-fixes)
- `package.json` (modified) — kept type:commonjs; added devDependencies {typescript ^6, tsx ^4, c8 ^11, @types/node ^24}; replaced stub test script with tsx --test + added typecheck script
- `package-lock.json` (created) — npm lockfile (61 packages, 0 vulnerabilities)
- `test/fixtures/test-fixture.sav` (moved from docs/) — real 152KB .NET save, valid Brotli (D-10/D-11)
- `test/scaffold.test.ts` (created) — trivial node:test smoke test proving tsx --test runs

## Decisions Made

- **`ignoreDeprecations: "6.0"` added to tsconfig** — TS 6.0.3 deprecated `moduleResolution: "node"` (aliases to `node10`) per TS5107, scheduled for removal in TS 7.0. D-06 locks `module: "commonjs"`; the only valid `moduleResolution` for `module: "commonjs"` is `"node"`/`"node10"` (deprecated) — switching to `node16`/`nodenext` would require changing `module` and alter CJS semantics (violating D-06). The TS error message itself recommends `ignoreDeprecations: "6.0"`; this is the minimal, D-06-preserving fix.
- **`types: ["node"]` added to tsconfig** — TS 6 changed the default `@types/*` auto-inclusion behavior (no longer auto-includes all `@types/*` packages without an explicit `types`/`typeRoots` field). Without this, tsc couldn't find `Buffer`, `node:test`, `node:assert/strict`, etc. — `tsc --noEmit` failed with TS2591. The TS error message explicitly recommends `add 'node' to the types field`. This is the standard fix for TS 6 CJS projects.
- **Did NOT approve esbuild's postinstall script** — npm's `allow-scripts` security feature blocked `esbuild@0.28.1`'s `postinstall: node install.js` (esbuild is a transitive dep of tsx). Verified `tsx --test` works WITHOUT approving it (esbuild ships a prebuilt binary). Least-privilege supply-chain stance: no install-time scripts run if not needed.
- **Did NOT mark IO-03 complete** — IO-03 (no-op round-trip + `output.length === input.length` length invariant) is the codec requirement, owned by Plan 02. Plan 01-01 only sets up the toolchain IO-03's tests will run on. Marking IO-03 complete here would be a false claim (the codec doesn't exist yet). `requirements-completed: []`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `ignoreDeprecations: "6.0"` to tsconfig.json**
- **Found during:** Task 3 (tsc --noEmit verification)
- **Issue:** TS 6.0.3 deprecated `moduleResolution: "node"` (TS5107: "Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0"). The plan's `moduleResolution: "node"` (inherited from research verifying TS 6.0.3, but the research didn't catch this deprecation) caused `tsc --noEmit` to fail with exit 2, blocking the Task 3 typecheck gate.
- **Fix:** Added `"ignoreDeprecations": "6.0"` to compilerOptions — exactly what TS's own error message recommends. Preserves D-06's `module: "commonjs"` + classic Node resolution intent. NOT an architectural change (no module/resolution-strategy switch — switching to `node16`/`nodenext` would require changing `module` and alter CJS semantics, violating D-06).
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` now exits 0 (TS5107 resolved)
- **Committed in:** 8c38531 (Task 3 commit)

**2. [Rule 3 - Blocking] Added `types: ["node"]` to tsconfig.json**
- **Found during:** Task 3 (tsc --noEmit verification, after the first fix resolved TS5107)
- **Issue:** After fixing TS5107, `tsc --noEmit` revealed a deeper issue: TS 6 no longer auto-includes `@types/*` packages by default. tsc failed with TS2591 ("Cannot find name 'node:test'... Cannot find name 'Buffer'... add 'node' to the types field in your tsconfig"). `@types/node@24.13.2` was correctly installed in `node_modules/@types/node` (and `test.d.ts` declares `declare module "node:test"` ambiently, referenced from `index.d.ts`), but TS 6 wasn't loading it without an explicit `types` field. The research verified `tsx --test` works (runtime) but didn't verify `tsc --noEmit` passes (typecheck) with the plan's bare config.
- **Fix:** Added `"types": ["node"]` to compilerOptions — exactly what TS's error message recommends. Standard fix for TS 6 CJS+TS projects. Phase 1 has no other `@types/*` packages, so this is non-lossy.
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` now exits 0 (Buffer, node:test, node:assert/strict all resolve; strict + noUncheckedIndexedAccess still active)
- **Committed in:** 8c38531 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — both Rule 3, both minimal one-line additions to tsconfig compilerOptions, both directly recommended by TS's own error messages, both preserving D-06/D-08 intent)
**Impact on plan:** Both auto-fixes are necessary for the Task 3 typecheck gate to pass under TS 6.0.3. No scope creep — the tsconfig still matches the plan's intent (full-strict, CJS, classic Node resolution); the two additions are TS-6-version-drift accommodations, not architectural changes. Wave 1 plans consume the working strict tsconfig unchanged.

## Issues Encountered

- **npm `allow-scripts` warning for esbuild postinstall** — npm's `allow-scripts` security feature blocked `esbuild@0.28.1`'s `postinstall: node install.js` (esbuild is a transitive dep of tsx, expected per D-07 "tsx (esbuild-based)"). Verified `tsx --test` works WITHOUT approving the script (esbuild ships a prebuilt binary that functions without the postinstall). No action taken — least-privilege stance. If a future plan needs esbuild's native binary (e.g., for bundling), the script can be approved then via `npm approve-scripts esbuild`.

## Authentication Gates

None. Task 2 was a `checkpoint:human-verify` (T-1-SC supply-chain mitigation), NOT an auth gate. It was pre-approved by the orchestrator/user before this executor was spawned (all 6 `npm view` checks matched research: tsx 4.23.0 from privatenumber/tsx with empty postinstall; @types/node 26.1.0 from DefinitelyTyped with empty postinstall; typescript 6.0.3 + c8 11.0.0 pre-approved OK). The executor recorded the pre-approval outcome and proceeded directly to Task 3's `npm install` without pausing.

## User Setup Required

None — no external service configuration required. All devDeps install via `npm install`; no env vars, no API keys, no dashboard config.

## Next Phase Readiness

- **Wave 1 (Plans 02 + 03) can now write `src/codec.ts`, `src/binary-reader.ts`, `src/binary-writer.ts`, `test/codec.test.ts`, `test/primitives.test.ts` against a working strict TS setup.** Both `npx tsx --test` and `npx tsc --noEmit` are green; the fixture is committed at `test/fixtures/test-fixture.sav`; `@types/node` provides `Buffer`/`zlib`/`test`/`assert` types under strict mode.
- **Coverage gate applies once Wave 1 creates `src/` files** — `c8 --100 --include 'src/**'` will enforce 100% line coverage on the codec/primitives (D-04). Currently c8 reports "All files 0%" (expected — no src/ yet).
- **No blockers.** The two tsconfig auto-fixes (`ignoreDeprecations`, `types`) are stable and won't require re-visiting in Wave 1.

---
*Phase: 01-binary-primitives-brotli-codec*
*Completed: 2026-07-03*

## Self-Check: PASSED

- tsconfig.json — FOUND
- package.json — FOUND
- package-lock.json — FOUND
- test/fixtures/test-fixture.sav — FOUND
- test/scaffold.test.ts — FOUND
- .planning/phases/01-binary-primitives-brotli-codec/01-01-SUMMARY.md — FOUND
- docs/test-fixture.sav — CONFIRMED GONE (fixture moved)
- Commit 8c38531 — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- Toolchain re-verified green: npx tsx --test (1 pass, 0 fail) + npx tsc --noEmit (exit 0)
