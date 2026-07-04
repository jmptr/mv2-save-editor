---
phase: 02-format-parser-fieldtable-model
plan: 01
subsystem: parser
tags: [fieldtable, viewmodel, typescript, discriminated-union, bigint, no-offset, sc-4, sc-2, sc-3, d-03, node-test, strict-ts, c8, tdd]

# Dependency graph
requires:
  - phase: 01-01 (toolchain + fixture scaffolding)
    provides: "Full-strict tsconfig.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes), CommonJS package.json + devDeps (tsx/tsc/c8/@types/node), committed test/fixtures/test-fixture.sav (151,993 B compressed → 2,284,747 B decompressed), green tsx --test + tsc --noEmit toolchain"
  - phase: 01-02 (Brotli codec)
    provides: "src/codec.ts decompress() — test/helpers/fixture.ts wraps it to load the decompressed fixture buffer for Wave 2/3 parser tests"
  - phase: 01-03 (LE BinaryReader/Writer primitives)
    provides: "BinaryReader readInt32/readInt64(BigInt)/readDouble/readBool/readString — the value-kinds the FieldEntry union enumerates (int32/int64/double/bool/string)"
provides:
  - "FieldTable model (src/field-table.ts): FieldEntry discriminated union (kind → value typed per kind, int64 → bigint) + FieldTable container (add/get/getRequired + addCandidates/getCandidates) + FieldCandidate (offset + evidence) + ParseError base + RequiredFieldMissingError — the sole home of byte offsets (SC-4 boundary)"
  - "Offset-free ViewModel type (src/view-model.ts): ViewModel + Summary + BankItem + Skill + UnresolvedField + ViewCandidate — NO offset key at any depth (SC-4 by construction); int64 currencies as string (JSON/IPC-safe); raw namespaced IDs (D-02); free metadata isPlaceholder/isLocked/entityIds (D-01)"
  - "Shared test harness (test/helpers/fixture.ts): loadFixtureBuffer() returns the 2,284,747-byte decompressed fixture, cached at module load — reused by every Wave 2/3 parser test"
  - "SC-4 runtime guard (test/helpers/no-offset-scan.ts): assertNoOffsets(value) recursively scans objects/arrays and throws on any 'offset' key at any depth — catches a leak even if the type system is bypassed"
  - "D-03 candidate model: resolve-one (add) / candidates-when-many (addCandidates, intact, no auto-pick) / fail-loud-when-zero (getRequired throws RequiredFieldMissingError) — partial SC-2/SC-3 foundation"
affects:
  - "02-02 (structural walk spine): emits FieldEntry for version/SaveHeader/entity-walk; consumes loadFixtureBuffer; uses ParseError/RangeError for SC-5 bounds violations"
  - "02-03 (Wallet + Experience parsers): emit FieldEntry (int64 currency authoritative + double/int32 XP/Level/LevelCap); mark header mirrors readOnly; consume loadFixtureBuffer"
  - "02-04 (Bank Inventory bounded marker-search): emits FieldEntry per stack (int32 qty + bool placeholder/locked + string itemId); surfaces D-03 candidates for ambiguous matches"
  - "02-05 (parseSave orchestrator): wires spine + region parsers → FieldTable + derived offset-free ViewModel; uses assertNoOffsets to prove the projected view model is SC-4 clean"
  - "Phase 3 (patcher): reads FieldTable entries {offset, kind, width, value} for same-width in-place writes; NEVER reads the ViewModel"

# Tech tracking
tech-stack:
  added: []  # zero new deps — pure TS over Phase 1 core (BinaryReader value-kinds + codec decompress)
  patterns:
    - "Discriminated union on `kind` types `value` per primitive (int64 → bigint, never number) — compile-time enforcement of the CLAUDE.md precision constraint (T-02-06); tsc rejects value: number for kind: 'int64'"
    - "FieldTable is the sole home of byte offsets (SC-4 boundary) — every Wave 2 parser emits FieldEntry; every Wave 3 projection targets the offset-free ViewModel"
    - "Two-layer SC-4: type-level (ViewModel type has no `offset` property) + runtime (assertNoOffsets scans actual objects for any `offset` key at any depth)"
    - "D-03 contract in the FieldTable: add() for resolved (unique keys, throws on duplicate) / addCandidates() for unresolved (intact list, no auto-pick) / getRequired() throws RequiredFieldMissingError for zero-match required fields (fail-loud)"
    - "ViewCandidate (offset-free) in the ViewModel vs FieldCandidate (offset-bearing) in the FieldTable — the only interpretation consistent with both 'unresolvedFields has candidates' and 'no offset key at any depth' (SC-4)"
    - "esbuild interop c8-ignore pattern carried from 01-02/01-03 (file-header /* c8 ignore start/end */ + class closing-brace /* c8 ignore next */) — suppresses injected __export/__copyProps defensive arms, NOT field-table logic; 100% coverage on all metrics without lowering the --100 threshold"
    - "FIXTURE_BUFFER cached at module load in test/helpers/fixture.ts (decompressed once, returned by reference) — matches primitives.test.ts's module-level const pattern; avoids re-decompressing 152KB→2.3MB per test"

key-files:
  created:
    - "src/field-table.ts — FieldEntry discriminated union + FieldTable container + FieldCandidate + ParseError + RequiredFieldMissingError (the sole home of byte offsets)"
    - "src/view-model.ts — offset-free ViewModel type + member types (Summary/BankItem/Skill/UnresolvedField/ViewCandidate); SC-4 by construction"
    - "test/field-table.test.ts — 27 node:test cases: FieldEntry per-kind shape, flag round-trips, FieldTable add/get/getRequired + candidates, typed error hierarchy, assertNoOffsets (SC-4 runtime), loadFixtureBuffer"
    - "test/helpers/fixture.ts — loadFixtureBuffer() returns the 2,284,747-byte decompressed fixture (cached at module load via Phase 1 decompress)"
    - "test/helpers/no-offset-scan.ts — assertNoOffsets(value) SC-4 runtime guard (recursive scan for any 'offset' key at any depth)"
  modified: []

key-decisions:
  - "ViewCandidate (offset-free) used in ViewModel.unresolvedFields instead of FieldCandidate (which carries offset) — the only interpretation consistent with both 'unresolvedFields has candidates' and 'no offset key at any depth' (SC-4). The FieldTable holds offset-bearing FieldCandidate; the ViewModel surfaces offset-free ViewCandidate (evidence only)."
  - "int64 precision enforced at the type level via the discriminated union (Int64FieldEntry.value: bigint) — tsc rejects value: number for kind: 'int64' (T-02-06). No runtime guard added in FieldTable.add(); the plan's done criteria ('int64 entries hold bigint') is proven by typeof === 'bigint' at runtime + tsc --noEmit at compile time. A future plan can add a runtime guard if TS-bypass defense is needed."
  - "Carried the esbuild-interop /* c8 ignore */ pattern from 01-02/01-03 to src/field-table.ts (file-header + class closing-brace) — suppresses only the injected __export/__copyProps defensive arm (source-mapped there), NOT FieldTable logic. 100% coverage on all metrics achieved without lowering the --100 threshold. (Proven via a pure-CJS control in 01-02 that the suppressed branches are esbuild interop, not logic.)"
  - "FIXTURE_BUFFER cached at module load in test/helpers/fixture.ts — decompresses once (152KB→2.3MB) and returns the same Buffer reference on every call. Matches the module-level const pattern in primitives.test.ts; the 'stable reference' test pins this. Callers must NOT mutate the returned buffer (parser tests consume it read-only via BinaryReader, which doesn't mutate)."
  - "Did NOT mark IO-01 complete — IO-01 (load + parse the documented layout, offsets fresh every load) is the parse requirement owned by plans 02-02…02-05 (the actual parser). Plan 02-01 only establishes the type contracts the parser will use (FieldTable + ViewModel + test harness). Marking IO-01 complete here would be a false claim — the parser doesn't exist yet. Plans 02-02…02-05 will mark IO-01 complete when the structural walk + region parsers + orchestrator ship."

patterns-established:
  - "FieldTable is the SC-4 offset boundary — offsets live ONLY in src/field-table.ts (FieldEntry.offset / FieldCandidate.offset); the ViewModel (src/view-model.ts) is offset-free by type construction; assertNoOffsets is the runtime guard that catches a leak."
  - "Discriminated union on `kind` for typed primitive values — the pattern Wave 2 parsers use to emit typed FieldEntry records (int32→number, int64→bigint, double→number, bool→boolean, string→string)."
  - "D-03 three-way contract: add() (resolved, unique keys) / addCandidates() (unresolved, intact list, no auto-pick) / getRequired() (throws RequiredFieldMissingError on zero-match). Wave 2 parsers pick the right branch per field."
  - "Typed error hierarchy: ParseError (base, Wave 2 reuse for parse-level fail-loud) → RequiredFieldMissingError (D-03 zero-match). RangeError (built-in) for bounds violations. Never silently corrupt."
  - "Shared test harness (test/helpers/) — loadFixtureBuffer + assertNoOffsets are imported by Wave 2/3 parser tests, establishing test/helpers/ as the home for cross-plan test utilities."

requirements-completed: []  # IO-01 (load + parse the documented layout, offsets fresh every load) is the parse requirement owned by plans 02-02…02-05 (structural walk + Wallet/Experience/Inventory parsers + parseSave orchestrator). Plan 02-01 only establishes the type contracts (FieldTable + ViewModel) + test harness those parsers consume. Marking IO-01 complete here would be a false claim — no parser exists yet. Plans 02-02…02-05 will mark IO-01 complete when the actual parser ships and IO-01's success criteria (parse the fixture → version/summary/bank/skills with fresh offsets) are met.

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "FieldTable model (src/field-table.ts): FieldEntry discriminated union (int32/int64→bigint/double/bool/string, value typed per kind) + FieldTable container (add/get/getRequired + addCandidates/getCandidates, unique resolved keys) + FieldCandidate (offset+evidence) + ParseError base + RequiredFieldMissingError (D-03 zero-match fail-loud)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/field-table.test.ts#FieldEntry discriminated union — value typed per kind (int32/int64/double/bool/string)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#FieldEntry flags round-trip (readOnly/authoritative/mirrors/candidates)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#FieldTable add + get (unique resolved keys)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#FieldTable candidates (D-03 — surface ambiguity, never auto-pick)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#FieldTable getRequired (D-03 zero-match rule — fail loud)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#typed error hierarchy (ParseError base, reused by Wave 2)"
        status: pass
      - kind: other
        ref: "npx c8 --100 --include 'src/field-table.ts' --exclude 'test/**' tsx --test test/field-table.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes; int64 value: bigint enforced by the discriminated union, T-02-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Offset-free ViewModel type (src/view-model.ts): ViewModel + Summary (int64 gp/slayerCoins as string) + BankItem (raw itemId D-02, isPlaceholder/isLocked D-01) + Skill (raw id D-02, xp/level/levelCap) + entityIds (D-01) + UnresolvedField/ViewCandidate (offset-free D-03) — NO offset property at any depth (SC-4 type-level)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/field-table.test.ts#assertNoOffsets passes on a clean ViewModel-shaped object (SC-4 type-level) — constructs a full ViewModel with summary/bankItems/skills/entityIds/unresolvedFields and asserts no offset leak"
        status: pass
      - kind: other
        ref: "grep for 'offset' as a property declaration in src/view-model.ts → CLEAN (no `offset?:` or `offset:` property; 'offset' appears only in comments explaining the type is offset-free) — SC-4 type-level by construction"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (ViewModel + member types compile under strict + exactOptionalPropertyTypes; int64 as string is JSON/IPC-safe)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SC-4 runtime guard (test/helpers/no-offset-scan.ts): assertNoOffsets(value) recursively walks objects/arrays and throws an Error naming the path if any 'offset' key is present at any depth — catches a byte-offset leak even if the type system is bypassed (as any)"
    verification:
      - kind: unit
        ref: "test/field-table.test.ts#assertNoOffsets throws on an offset-bearing object (SC-4 runtime guard) — catches offset at bankItems[0].offset"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#assertNoOffsets catches a nested offset at arbitrary depth (level1.level2.level3.offset)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#assertNoOffsets catches an offset on a root-level key (root.offset)"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#assertNoOffsets ignores primitives, null, undefined, and empty containers (base case)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Shared test harness (test/helpers/fixture.ts): loadFixtureBuffer() returns the 2,284,747-byte decompressed committed fixture (D-10/D-11), cached at module load via Phase 1 decompress — reused by every Wave 2/3 parser test"
    verification:
      - kind: unit
        ref: "test/field-table.test.ts#returns the decompressed committed fixture buffer (2,284,747 bytes, D-10/D-11) — pins the decompressed length"
        status: pass
      - kind: unit
        ref: "test/field-table.test.ts#loadFixtureBuffer returns a stable reference (cached at module load) — same Buffer on every call"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 01: FieldTable Model + Offset-free ViewModel Contract Summary

**FieldEntry discriminated union (int64 → bigint, T-02-06) + FieldTable container with D-03 candidate model (resolve-one / candidates-when-many / fail-loud-when-zero) + offset-free ViewModel type (SC-4 by construction) + assertNoOffsets runtime guard + shared fixture harness — 100% line+branch coverage under strict TS, zero new deps.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-04T00:56:27Z
- **Completed:** 2026-07-04T01:08:23Z
- **Tasks:** 2 (both TDD: RED→GREEN, no REFACTOR needed)
- **Files modified:** 5 (all created — src/field-table.ts, src/view-model.ts, test/field-table.test.ts, test/helpers/fixture.ts, test/helpers/no-offset-scan.ts)

## Accomplishments

- **src/field-table.ts** — the sole home of byte offsets (SC-4 boundary). Exports: `FieldKind` union (`int32|int64|double|bool|string`); `FieldEntry` discriminated union with `value` typed per `kind` (int64 → `bigint`, NEVER `number` — CLAUDE.md precision, T-02-06, enforced by the union at compile time); `FieldCandidate` (`offset` + `evidence` string — D-03 ambiguous surfacing); `FieldTable` class with `add(entry)` (unique resolved keys, throws on duplicate), `get(key)` (returns `undefined` if absent), `getRequired(key)` (throws `RequiredFieldMissingError` — D-03 zero-match fail-loud), `addCandidates(key, candidates)` (intact list, no auto-pick, throws on duplicate), `getCandidates(key)`; `ParseError` base class (Wave 2 reuse for parse-level fail-loud); `RequiredFieldMissingError` (extends `ParseError`, carries `fieldKey`).
- **src/view-model.ts** — the offset-free ViewModel type (SC-4 by construction). Exports: `ViewModel` (`version`, `unknownVersion`, `summary`, `bankItems`, `skills`, `entityIds`, `unresolvedFields?`); `Summary` (name, gamemode, totalLevel, `gp`/`slayerCoins` as `string` — int64 JSON/IPC-safe); `BankItem` (raw `itemId` D-02, `quantity`, `isPlaceholder`/`isLocked` D-01 free metadata); `Skill` (raw `id` D-02, `xp`, `level`, `levelCap`); `UnresolvedField` + `ViewCandidate` (offset-free — evidence only; the FieldTable holds the offset-bearing `FieldCandidate`, the ViewModel surfaces the offset-free `ViewCandidate` so SC-4 holds at any depth). NO `offset` property anywhere in the type.
- **test/helpers/fixture.ts** — `loadFixtureBuffer()` returns the 2,284,747-byte decompressed committed fixture (D-10/D-11), decompressed once at module load via Phase 1 `decompress` and cached (same `Buffer` reference on every call). Reused by every Wave 2/3 parser test.
- **test/helpers/no-offset-scan.ts** — `assertNoOffsets(value, path='root')` recursively walks objects/arrays and throws `Error` naming the path if any `offset` key is present at any depth. The SC-4 runtime guard — catches a byte-offset leak in an actual view-model object even if the type system is bypassed (`as any`).
- **D-04 coverage gate satisfied** (wave-merge, this is the sole Wave 1 plan): `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` → 100% lines/statements/functions/branches on all 4 src files (binary-reader, binary-writer, codec, field-table). `view-model.ts` is types-only (no runtime code) so it correctly doesn't appear in the c8 report.
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` unchanged).
- **Threat model mitigated**: T-02-04 (ViewModel leaking offsets — type offset-free + runtime scanner); T-02-06 (int64 as Number — typed bigint via discriminated union); T-02-SC (no packages installed — zero supply-chain surface).

## Task Commits

Both tasks were TDD (RED → GREEN, no REFACTOR needed — implementations were minimal and clean on first GREEN).

1. **Task 1 RED: add failing FieldTable model test suite** — `2fb1368` (test) — test/field-table.test.ts (20 tests; src/field-table.ts absent → MODULE_NOT_FOUND, the expected RED state)
2. **Task 1 GREEN: implement FieldTable model** — `296d123` (feat) — src/field-table.ts (FieldEntry union + FieldTable + FieldCandidate + ParseError + RequiredFieldMissingError); 20/20 tests green; tsc clean; c8 100/100/100/100
3. **Task 2 RED: add failing ViewModel + no-offset scanner + fixture tests** — `e98fcab` (test) — extended test/field-table.test.ts (+7 tests; src/view-model.ts + test/helpers/* absent → MODULE_NOT_FOUND)
4. **Task 2 GREEN: implement offset-free ViewModel + fixture + no-offset scanner** — `df44f00` (feat) — src/view-model.ts + test/helpers/fixture.ts + test/helpers/no-offset-scan.ts; 27/27 tests green; tsc clean; wave-merge c8 gate 100% on all src/**

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `src/field-table.ts` (created) — FieldEntry discriminated union (int64 → bigint) + FieldTable container (add/get/getRequired + addCandidates/getCandidates) + FieldCandidate + ParseError + RequiredFieldMissingError. The sole home of byte offsets (SC-4 boundary).
- `src/view-model.ts` (created) — offset-free ViewModel type + member types (Summary/BankItem/Skill/UnresolvedField/ViewCandidate). SC-4 by construction (no `offset` property at any depth); int64 as string; raw IDs (D-02); free metadata (D-01).
- `test/field-table.test.ts` (created) — 27 node:test cases: FieldEntry per-kind shape (5), flag round-trips (3), FieldTable add/get (3), FieldTable candidates/D-03 (4), getRequired/D-03 (2), typed error hierarchy (3), assertNoOffsets/SC-4 (5), loadFixtureBuffer (2).
- `test/helpers/fixture.ts` (created) — loadFixtureBuffer() returns the 2,284,747-byte decompressed fixture, cached at module load.
- `test/helpers/no-offset-scan.ts` (created) — assertNoOffsets(value) SC-4 runtime guard (recursive scan for any `offset` key at any depth).

## Decisions Made

- **ViewCandidate (offset-free) in the ViewModel vs FieldCandidate (offset-bearing) in the FieldTable** — the plan's behavior block specifies `unresolvedFields?: {field, candidates}[]` AND "the type contains NO `offset` key at any depth (SC-4 by construction)." These are only simultaneously satisfiable if the ViewModel's `candidates` are offset-free. So `UnresolvedField.candidates` is `ViewCandidate[]` (evidence only, no offset), NOT `FieldCandidate[]` (which carries `offset` and lives in the FieldTable). The FieldTable holds the offset-bearing candidates for Phase 3's patcher; the ViewModel surfaces the offset-free evidence for Phase 5's UI disambiguation. This is the only type-correct interpretation of the plan's two constraints — documented as a decision, not a deviation.
- **int64 precision enforced at the type level only (no runtime guard in add())** — the discriminated union (`Int64FieldEntry.value: bigint`) makes tsc reject `value: number` for `kind: 'int64'` (T-02-06). The plan's done criteria ("int64 entries hold bigint") is proven by `typeof entry.value === 'bigint'` at runtime + `npx tsc --noEmit` at compile time. No runtime guard was added in `FieldTable.add()` — type-level enforcement is sufficient for v1, and a guard would add branches needing coverage without being requested by the plan. A future plan can add a runtime guard if TS-bypass (`as any`) defense is needed.
- **Carried the esbuild-interop `/* c8 ignore */` pattern from 01-02/01-03** — `export class FieldTable` triggers esbuild's `__export`/`__toCommonJS`/`__copyProps` interop helper, whose defensive "key already on target" arm never fires for a real require'd module (NOT FieldTable logic). Targeted `/* c8 ignore start/end */` around the file header + `/* c8 ignore next */` before the class's closing brace suppress only that injected artifact (source-mapped there). 100% coverage on all metrics achieved WITHOUT lowering the `--100` threshold. (Proven via a pure-CJS control in 01-02 that the suppressed branches are esbuild interop, not logic.)
- **FIXTURE_BUFFER cached at module load** — `test/helpers/fixture.ts` decompresses the fixture once (152KB→2.3MB) at module load and returns the same `Buffer` reference on every `loadFixtureBuffer()` call. Matches the module-level `const FIXTURE_DECOMPRESSED` pattern in `primitives.test.ts`. The "stable reference" test pins this. Callers must NOT mutate the returned buffer (parser tests consume it read-only via `BinaryReader`, which doesn't mutate).
- **Did NOT mark IO-01 complete** — IO-01 (load + parse the documented layout, offsets fresh every load) is the parse requirement owned by plans 02-02…02-05 (the actual parser). Plan 02-01 only establishes the type contracts + test harness those parsers consume. Marking IO-01 complete here would be a false claim — no parser exists yet. `requirements-completed: []`.

## Deviations from Plan

None - plan executed exactly as written. All design decisions (ViewCandidate offset-free type, esbuild-interop c8-ignore pattern, FIXTURE_BUFFER caching, no runtime int64 guard) are consistent with the plan's behavior blocks, the established Phase 1 patterns, and the plan's two constraints (unresolvedFields has candidates + no offset at any depth) — they are the plan's intent, not deviations.

## Issues Encountered

None — both TDD cycles (RED → GREEN) passed on the first GREEN attempt. No pre-commit hook failures, no test failures during GREEN, no typecheck issues.

## User Setup Required

None - no external service configuration required. All files use Node built-ins (node:fs, node:assert/strict, node:test) + the in-repo Phase 1 core (src/codec.ts decompress). The fixture is committed at test/fixtures/test-fixture.sav (D-10). Zero new dependencies.

## Next Phase Readiness

- **Wave 2 parsers (02-02…02-05) can now build against the locked contracts:**
  - 02-02 (structural walk spine): emit `FieldEntry` for version/SaveHeader/entity-walk; use `ParseError`/`RangeError` for SC-5 bounds; consume `loadFixtureBuffer()`.
  - 02-03 (Wallet + Experience parsers): emit `FieldEntry` (int64 currency `authoritative: true`; double/int32 XP/Level/LevelCap); mark header mirrors `readOnly: true, mirrors: 'wallet.GoldPieces'`; consume `loadFixtureBuffer()`.
  - 02-04 (Bank Inventory marker-search): emit `FieldEntry` per stack (int32 qty + bool placeholder/locked + string itemId); surface D-03 candidates via `addCandidates()` for ambiguous matches; consume `loadFixtureBuffer()`.
  - 02-05 (parseSave orchestrator): wire spine + region parsers → `FieldTable` + derive the offset-free `ViewModel`; assert `assertNoOffsets(viewModel)` passes (SC-4 runtime).
- **Phase 3 (patcher)** will read `FieldTable` entries `{offset, kind, width, value}` for same-width in-place writes — the `int64 → bigint` typing means the patcher writes via `writeBigInt64LE(value, offset)`, never `Number`.
- **Phase 5 (renderer)** will render the `ViewModel` — int64 currencies as `string` (JSON/IPC-safe), raw IDs (D-02, no name table yet), free metadata (D-01).
- **No blockers.** The contracts are locked; the esbuild c8-ignore pattern is stable; the fixture harness is cached and ready. The only carried concern (unchanged from STATE.md) is the varied-fixture corpus (D-04) — the parser tests are structured to drop in more fixtures, but the user is the sole source of real saves.

---
*Phase: 02-format-parser-fieldtable-model*
*Completed: 2026-07-04*

## Self-Check: PASSED

- src/field-table.ts — FOUND
- src/view-model.ts — FOUND
- test/field-table.test.ts — FOUND
- test/helpers/fixture.ts — FOUND
- test/helpers/no-offset-scan.ts — FOUND
- .planning/phases/02-format-parser-fieldtable-model/02-01-SUMMARY.md — FOUND
- Commit 2fb1368 (Task 1 RED) — FOUND in git log
- Commit 296d123 (Task 1 GREEN) — FOUND in git log
- Commit e98fcab (Task 2 RED) — FOUND in git log
- Commit df44f00 (Task 2 GREEN) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- SC-4 type-level: grep for `offset` as a property declaration (`offset?:` or `offset:`) in src/view-model.ts → CLEAN (no offset property; 'offset' appears only in comments explaining the type is offset-free)
- Gates re-verified green: `npx tsx --test test/field-table.test.ts` (27 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (100% lines/statements/functions/branches on all 4 src files, exit 0)
