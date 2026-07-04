---
phase: 02-format-parser-fieldtable-model
plan: 02
subsystem: parser
tags: [structural-walk, binary-reader, field-entry, sc-1, sc-2, sc-5, determinism, delta-0, bounds-guards, version-tolerance, bigint, parse-error, node-test, strict-ts, c8, tdd]

# Dependency graph
requires:
  - phase: 01-02 (Brotli codec)
    provides: "src/codec.ts decompress() — test/helpers/fixture.ts wraps it to load the decompressed fixture buffer the structural walk parses"
  - phase: 01-03 (LE BinaryReader/Writer primitives)
    provides: "BinaryReader readInt32/readInt64(BigInt)/readDouble/readBool/readString + seek/offset — the stateful LE cursor the structural walk consumes sequentially (matching the .NET BinaryReader mental model docs/current-skill.md is written in); throws on OOB (T-1-04) + malformed 7-bit prefix (T-1-02), which the walk lets propagate"
  - phase: 02-01 (FieldTable + ViewModel contracts + test harness)
    provides: "FieldEntry discriminated union (int64 → bigint, T-02-06) + ParseError base class (the typed error the walk throws on bounds/delta-0 violations) + test/helpers/fixture.ts loadFixtureBuffer() (the cached 2,284,747-byte decompressed fixture) + test/helpers/no-offset-scan.ts assertNoOffsets (SC-4 runtime guard, consumed by 02-05)"
provides:
  - "Structural walk spine (src/structural-walk.ts): readVersion (int32 at offset 0 + unknownVersion warn flag, SC-5) / parseSaveHeader (UUID→name→gamemode→ts→4 active strings→totalLevel→GP→SlayerCoins, offsets fresh from reader.offset, emits readOnly+mirrors FieldEntries for header GP/SlayerCoins per SC-2) / walkEntities (int32 count → N×[string id][int32 size][size bytes], opaque {id,start,size} spans for Phase 4 round-trip, generic walk recovers MelvorBase:Layout) / walkComponents (int32 count → N×[string name][int32 size][size bytes], {name,dataStart,size} locations, asserts dataStart+size<=regionEnd and cursor==regionEnd delta-0, typed ParseError on mismatch)"
  - "SC-5 bounds guards: count pre-check bounds the int32 count against the enclosing region BEFORE looping (T-02-01 — no unbounded loop/allocation on a giant count); negative size + region overrun throw typed ParseError (T-02-03); BinaryReader native OOB / malformed-7-bit-prefix RangeErrors propagate (T-02-02 — never swallowed); delta-0 integrity asserts fail loud (T-02-05)"
  - "Version tolerance: an unknown/newer version (e.g. 21) sets unknownVersion=true and the rest still parses (SC-5 warn-but-parse — the format is self-describing, the walk is version-agnostic)"
  - "Determinism proven: the framed walk lands delta-0 (declared count == walked count AND cursor == regionEnd) on all 33 fixture entities and on the top-level entity list (consumes exactly to byte 2,284,711)"
  - "Malformed-buffer test helpers (test/helpers/malformed.ts): oversized-count / size-overruns-region / negative-size / negative-count / oversized-7-bit-prefix / truncated-region / version-bump — small hand-built buffers (not the full fixture) each triggering a distinct bounds-violation path"
  - "test/structural-walk.test.ts: 24 node:test cases (11 happy-path/determinism + 13 SC-5 bounds + version tolerance)"
  - "100% line/statement/function/branch coverage on src/structural-walk.ts (D-04 gate)"
affects:
  - "02-03 (Wallet + Experience parsers): attach at the Wallet/Experience component dataStart boundaries walkComponents locates inside the Bank/skill entities; key currencies by ID string inside the Wallet component (GoldPieces/SlayerCoins); mark the wallet int64 currencies authoritative (the header mirrors this plan emits are their read-only counterparts)"
  - "02-04 (Bank Inventory bounded marker-search): scope the marker-search to the Inventory component's [dataStart, dataStart+size) region walkComponents locates inside the Bank entity"
  - "02-05 (parseSave orchestrator): wire readVersion → parseSaveHeader → walkEntities → (per entity) walkComponents → region parsers (02-03/02-04) → FieldTable + derived offset-free ViewModel; assert assertNoOffsets(viewModel) passes (SC-4 runtime); will mark IO-01 complete when the full parser (spine + region parsers + orchestrator) ships"
  - "Phase 3 (patcher): reads the header.GP / header.SlayerCoins FieldEntries' readOnly flag and NEVER targets them (SC-2); reads the wallet FieldEntries (02-03) for same-width in-place int64 writes via writeBigInt64LE"
  - "Phase 4 (Electron round-trip): uses the opaque entity {id,start,size} spans to round-trip untouched entities byte-intact (the walk skips unmodeled component payloads via seek(dataStart+size))"

# Tech tracking
tech-stack:
  added: []  # zero new deps — pure TS over Phase 1 BinaryReader + Phase 2 FieldTable/ParseError (02-01)
  patterns:
    - "Framed structural component walk (RESEARCH §Pattern 1): every entity is [int32 componentCount][component × count] and every component is [string name][int32 dataSize][dataSize bytes] — fully self-describing. Walk with BinaryReader; skip unmodeled components via seek(dataStart+size) (byte-intact for Phase 4). Assert count==walked AND cursor==regionEnd per region (delta-0, fail loud on mismatch — T-02-05)."
    - "Offsets fresh from reader.offset after every variable-length string (RESEARCH Pitfall 4) — NEVER hard-coded post-string offsets. parseSaveHeader derives GP/SlayerCoins offsets from the cursor after the 4 active strings; a longer/UTF-8 name shifts nothing wrong."
    - "SC-2 read-only mirror FieldEntries: header.GP / header.SlayerCoins emitted with readOnly:true + mirrors:'wallet.GoldPieces'/'wallet.SlayerCoins' so Phase 3's patcher can never target the header — only the Bank wallet (02-03) is authoritative."
    - "SC-5 count pre-check: bound the int32 count against the enclosing region (count * MIN_ITEM_FRAMING > remaining → ParseError) BEFORE looping, so a giant int32 count (2^31-1) throws before any iteration/allocation (T-02-01). MIN_ITEM_FRAMING = 5 (1-byte 7-bit string prefix for an empty id/name + 4-byte int32 size)."
    - "Typed-error split: explicit region-bound violations (negative size, size overruns region, count exceeds region, delta-0 mismatch) → ParseError; BinaryReader native OOB / malformed-7-bit-prefix → RangeError propagated (never swallowed). Tests distinguish via `err instanceof RangeError && !(err instanceof ParseError)`."
    - "Version-agnostic walk: the format is self-describing, so the structural walk works without version-specific offsets. readVersion sets unknownVersion=true for version != 20 (KNOWN_VERSION) — warn-but-parse, never hard-fail (SC-5)."
    - "Opaque entity spans {id, start, size} (no payload decode) — retained so Phase 4 round-trips untouched entities byte-intact; Wave 3 region parsers attach at the component dataStart boundaries walkComponents locates."
    - "esbuild-interop /* c8 ignore start/end */ around the file header (carried from 01-02/01-03/02-01) — suppresses only the injected __export/__copyProps defensive arm source-mapped to the header; 100% coverage on all metrics without lowering the --100 threshold. No export-level c8 ignore needed (V8 reports the `if (x) throw` bounds arms as single-arm branches via esbuild, all covered)."
    - "Malformed-buffer helpers as small hand-built buffers (NOT the full fixture) — each triggers exactly one bounds-violation path deterministically; the version-bump helper copies the cached fixture (Buffer.from) and never mutates the shared reference."

key-files:
  created:
    - "src/structural-walk.ts — readVersion / parseSaveHeader / walkEntities / walkComponents (pure functions over BinaryReader emitting FieldEntry[] + opaque EntitySpan[]/Component[]; SC-5 count pre-check + size/delta-0 bounds guards; SC-2 readOnly mirrors; SC-5 version tolerance)"
    - "test/structural-walk.test.ts — 24 node:test cases: readVersion (2), parseSaveHeader summary+SC-2 (3), walkEntities 33+delta-0+generic (3+1), walkComponents delta-0 all 33 + Bank Wallet/Inventory + delta-0 mismatch (3), SC-5 bounds guards (11), version tolerance (2)"
    - "test/helpers/malformed.ts — oversizedCountBuffer / sizeOverrunsRegionBuffer / negativeSizeBuffer / negativeCountBuffer / oversizedSevenBitPrefixBuffer / truncatedRegionBuffer / versionBumpedFixtureBuffer (SC-5 negative-test fixtures)"
  modified: []

key-decisions:
  - "Typed-error split: ParseError for explicit region-bound violations (count pre-check, negative size, size overruns region, delta-0 mismatch), RangeError (BinaryReader native) propagated for OOB / malformed-7-bit-prefix. The research code examples used RangeError throughout, but the plan explicitly says 'typed ParseError' for the bounds checks — ParseError is the field-table base class (02-01) and gives a single typed-error hierarchy for parse-level fail-loud. Tests distinguish the two via `err instanceof RangeError && !(err instanceof ParseError)` (ParseError extends Error, NOT RangeError)."
  - "Count pre-check uses MIN_ITEM_FRAMING = 5 (1-byte 7-bit string prefix for an empty id/name + 4-byte int32 size). `count * 5` cannot overflow a JS double for any int32 count (max ~1.07×10^10 < 2^53), so the bound is exact. The pre-check is a NECESSARY condition (count*5 > remaining → definitely too big) but not SUFFICIENT — per-iteration size + delta-0 checks catch the rest. It exists to reject a giant count before any iteration/allocation (T-02-01)."
  - "walkEntities / walkComponents take (reader, regionStart, regionEnd) — the CALLER determines regionEnd (the 02-05 orchestrator computes entity-list end = buffer.length − 36-byte tail; component regions come from the parent entity's size). This keeps the walks generic (no hard-coded tail size) and lets the orchestrator own the layout boundary. The test passes listEnd = FIXTURE.length − 36 and asserts it equals 2,284,711."
  - "parseSaveHeader returns { entries, summary, headerEnd } — entries contains ONLY header.GP + header.SlayerCoins (readOnly + mirrors, the SC-2 mirrors). TotalLevel / name / gamemode are summary-only (NOT FieldEntries) because PROJECT.md defers header editing to a later milestone (v1 edits only the wallet/bank/skills, never the header). headerEnd is exposed so the orchestrator knows where the entity list starts."
  - "Did NOT mark IO-01 complete — mirrors 02-01's stance. 02-02 delivers IO-01's structural skeleton (version → SaveHeader → entity list → component boundaries, offsets fresh from cursor) which IS the literal IO-01 definition ('parse the documented layout: version → SaveHeader → entity list'). But the full IO-01 success criteria ('parse the fixture → version/summary/bank/skills with fresh offsets', VALIDATION SC-1) also requires the bank item list (689 stacks, 02-04) and skill XP/Level/LevelCap values (02-03) + the parseSave orchestrator (02-05). Marking IO-01 complete now would over-claim — the bank/skills values don't exist yet. IO-01 will be marked complete by 02-05 when the full parser ships. requirements-completed: []."
  - "esbuild-interop c8 ignore limited to the file-header block — V8 reports the `if (size < 0) throw` / `if (start+size > regionEnd) throw` / `if (cursor !== regionEnd) throw` bounds arms as single-arm branches (count array length 1) via esbuild's compilation, so they're all 'covered' for what V8 measures without needing per-export `/* c8 ignore next */` comments. The malformed-buffer tests still exercise every throw path for the plan's SC-5 correctness requirement (not for the gate). Verified empirically via the raw V8 coverage JSON: 27 branches, all single-arm count [1], 0 uncovered."

patterns-established:
  - "Framed structural walk as the parser spine — every entity/component is [string name][int32 size][size bytes]; walk with BinaryReader, skip unmodeled components via seek(dataStart+size), assert delta-0 per region. Wave 3 region parsers (02-03/02-04) attach at the component dataStart boundaries this walk locates."
  - "Typed ParseError for parse-level fail-loud (count pre-check, size bounds, delta-0 mismatch) vs propagated BinaryReader RangeError for native OOB / 7-bit-prefix — the two-layer bounds discipline Wave 3 inherits."
  - "SC-2 readOnly+mirrors FieldEntries for header currency snapshots — the pattern 02-03 will mirror for the wallet's authoritative int64 currencies (header.GP.mirrors = 'wallet.GoldPieces')."
  - "Opaque entity spans {id, start, size} (no payload decode) for Phase 4 byte-intact round-trip — the walk never mutates the buffer; it only locates boundaries."
  - "Malformed-buffer helpers in test/helpers/ (small hand-built buffers, not the full fixture) — the SC-5 negative-test pattern; each helper triggers exactly one bounds path deterministically."

requirements-completed: []  # IO-01 is NOT marked complete here — see key-decisions. 02-02 delivers the structural skeleton (version → SaveHeader → entity list → component boundaries) but the full IO-01 (bank items 02-04 + skill values 02-03 + orchestrator 02-05) ships across the rest of Phase 2. Marking IO-01 complete now would over-claim (no bank/skills values exist yet).

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "readVersion (int32 at offset 0) + version tolerance: fixture yields version 20 with unknownVersion false (SC-1); a version-21 copy parses with unknownVersion=true (SC-5 warn-but-parse); the shared cached fixture is not mutated by the version-bump helper"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/structural-walk.test.ts#fixture yields version 20 with unknownVersion false (SC-1)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#readVersion advances the cursor past the 4-byte version int32"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#a version-21 copy of the fixture parses with unknownVersion=true"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#the shared cached fixture buffer is NOT mutated by the version-bump helper"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseSaveHeader: summary (name 'Bob', gamemode 'Test', totalLevel 1366, GP 953063625n, SlayerCoins 6511n) matches the research reference table (SC-1); header GP/SlayerCoins FieldEntries are readOnly + mirrors ('wallet.GoldPieces'/'wallet.SlayerCoins') per SC-2; cursor lands at headerEnd=150 (offsets fresh from reader.offset after every variable-length string — Pitfall 4)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/structural-walk.test.ts#summary matches the research reference table"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#GP and SlayerCoins FieldEntries are readOnly mirrors (SC-2)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#parseSaveHeader leaves the cursor at headerEnd (150)"
        status: pass
    human_judgment: false
  - id: D3
    description: "walkEntities: fixture declares 33 entities and the walk consumes exactly to byte 2,284,711 (delta-0 on the entity list — Determinism); spans are opaque {id, start, size} (no payload decode — Phase 4 round-trip); the walk is generic (recovers MelvorBase:Layout, not in the docs' Known Entity IDs)"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/structural-walk.test.ts#fixture declares 33 entities and the walk consumes exactly to ENTITY_LIST_END"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#entity spans are opaque {id, start, size} (no payload decode — Phase 4 round-trip)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#the fixture contains MelvorBase:Layout (not in the docs Known Entity IDs) — walk is generic"
        status: pass
    human_judgment: false
  - id: D4
    description: "walkComponents: every one of the 33 entity regions walks count==walked AND cursor==regionEnd (delta-0 — T-02-05 integrity spine); the Bank entity has a Wallet component and an Inventory component (the boundaries 02-03/02-04 attach at); delta-0 mismatch throws typed ParseError"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/structural-walk.test.ts#every entity region walks count==walked and cursor==regionEnd"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#the Bank entity has a Wallet component and an Inventory component (research §Pattern 2/3)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#walkComponents throws a typed ParseError when the region is not consumed exactly"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#walkEntities throws ParseError when the list region is not consumed exactly"
        status: pass
    human_judgment: false
  - id: D5
    description: "SC-5 bounds guards: oversized/negative entity + component counts throw typed ParseError before looping (T-02-01); entity/component size overruns region throws ParseError (T-02-03); negative size throws ParseError; malformed 7-bit prefix + truncated region propagate BinaryReader RangeError (T-02-02); crafted via test/helpers/malformed.ts small hand-built buffers"
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/structural-walk.test.ts#oversized ENTITY count throws ParseError before looping (T-02-01)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#oversized COMPONENT count throws ParseError before looping (T-02-01)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#negative ENTITY count throws ParseError (T-02-01)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#negative COMPONENT count throws ParseError (T-02-01)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#entity size overruns region throws ParseError (T-02-03)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#component size overruns entity region throws ParseError (T-02-03)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#negative entity size throws ParseError"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#negative component size throws ParseError"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#malformed 7-bit length prefix propagates BinaryReader RangeError (T-02-02)"
        status: pass
      - kind: unit
        ref: "test/structural-walk.test.ts#truncated region (declared string past buffer) propagates BinaryReader RangeError"
        status: pass
      - kind: other
        ref: "npx c8 --100 --include 'src/structural-walk.ts' --exclude 'test/**' tsx --test test/structural-walk.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 02: Structural Walk Spine Summary

**Deterministic framed walk (version → SaveHeader → 33-entity list → per-entity component list) over the Phase 1 BinaryReader, emitting SC-2 readOnly-mirror FieldEntries + opaque entity spans, with SC-5 count-pre-check bounds guards, BinaryReader RangeError propagation, and version tolerance — delta-0 on all 33 entities, 100% coverage under strict TS, zero new deps.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-04T01:16:27Z
- **Completed:** 2026-07-04T01:28:03Z
- **Tasks:** 2 (both TDD: RED → GREEN, no REFACTOR needed)
- **Files created:** 3 (src/structural-walk.ts, test/structural-walk.test.ts, test/helpers/malformed.ts)

## Accomplishments

- **src/structural-walk.ts** — the deterministic spine. `readVersion(reader)` reads int32 at offset 0 and returns `{version, unknownVersion}` (unknownVersion true for version ≠ 20 — SC-5 warn-but-parse, never throws on version alone). `parseSaveHeader(reader)` walks UUID(16B) → CharacterName → Gamemode → timestamp(int64) → 4 active-entity/action strings → TotalLevel(int32) → GP(int64) → SlayerCoins(int64), deriving every post-string offset from `reader.offset` (Pitfall 4 — never hard-coded), emitting `header.GP` and `header.SlayerCoins` FieldEntries as `readOnly:true` with `mirrors` pointing at `wallet.GoldPieces`/`wallet.SlayerCoins` (SC-2 — the header is a cosmetic snapshot; only the Bank wallet is a write target). Returns `{entries, summary, headerEnd}` (fixture: name 'Bob', gamemode 'Test', totalLevel 1366, GP 953063625n, SlayerCoins 6511n, headerEnd 150). `walkEntities(reader, listStart, listEnd)` reads int32 count then N × [string id][int32 size][size bytes], recording opaque `{id, start, size}` spans (no payload decode — Phase 4 round-trip), generically (recovers `MelvorBase:Layout`, not in the docs' Known Entity IDs). `walkComponents(reader, entityStart, entitySize)` reads int32 count then N × [string name][int32 size][size bytes], recording `{name, dataStart, size}` locations, asserting `dataStart + size <= end` and `cursor == end` (delta-0 — T-02-05) with a typed ParseError on mismatch.
- **SC-5 bounds guards** — both walks bound the int32 count against the enclosing region BEFORE looping: `count < 0 || count * MIN_ITEM_FRAMING(5) > remaining` throws a typed ParseError, so a giant count (2^31-1) never drives an unbounded loop/allocation (T-02-01). Negative sizes and region overruns throw ParseError (T-02-03). The BinaryReader's native OOB / malformed-7-bit-prefix RangeErrors (Phase 1 T-1-02/T-1-04) propagate — never swallowed (T-02-02). Delta-0 integrity asserts fail loud (T-02-05).
- **Version tolerance** — a COPY of the fixture with version bumped 20→21 parses with `unknownVersion=true`; the SaveHeader summary and the 33-entity walk are unchanged (the format is self-describing — the walk is version-agnostic). The shared cached fixture buffer is NOT mutated (the helper uses `Buffer.from(...)` to copy).
- **Determinism proven** — the framed walk lands delta-0 on all 33 fixture entities (declared count == walked count AND cursor == regionEnd for every entity) and on the top-level entity list (consumes exactly to byte 2,284,711 = buffer.length − 36-byte tail). The Bank entity has a Wallet component and an Inventory component — the boundaries 02-03 (Wallet/Experience) and 02-04 (Inventory) attach at.
- **test/helpers/malformed.ts** — 7 small hand-built buffer helpers (oversized-count, size-overruns-region, negative-size, negative-count, oversized-7-bit-prefix, truncated-region, version-bump) each triggering exactly one bounds-violation path deterministically; the version-bump helper copies the cached fixture (never mutates the shared reference).
- **D-04 coverage gate satisfied**: `npx c8 --100 --include 'src/structural-walk.ts' --exclude 'test/**' tsx --test test/structural-walk.test.ts` → 100% lines/statements/functions/branches. Wave-merge gate `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` → 100% on all 5 src files (binary-reader, binary-writer, codec, field-table, structural-walk).
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` unchanged).
- **Threat model mitigated**: T-02-01 (giant count → bounded pre-check), T-02-02 (malformed 7-bit prefix → propagated RangeError), T-02-03 (region overrun → typed ParseError), T-02-05 (silent under-parse → delta-0 integrity asserts, fail loud). T-02-SC (no packages installed — zero supply-chain surface).

## Task Commits

Both tasks were TDD (RED → GREEN, no REFACTOR needed — implementations were clean on first GREEN).

1. **Task 1 RED: add failing structural-walk test suite** — `d987665` (test) — test/structural-walk.test.ts (11 happy-path + determinism tests; src/structural-walk.ts absent → MODULE_NOT_FOUND, the expected RED state)
2. **Task 1 GREEN: implement structural walk spine** — `d8b60cb` (feat) — src/structural-walk.ts (readVersion + parseSaveHeader + walkEntities + walkComponents; SC-2 readOnly mirrors; delta-0 asserts; size/negative-size/overrun bounds); 11/11 tests green; tsc clean; c8 100/100/100/100
3. **Task 2 RED: add SC-5 bounds + version-tolerance failing tests** — `2dd6f0c` (test) — test/helpers/malformed.ts + test/structural-walk.test.ts (+13 tests; 4 count-pre-check tests fail — expect ParseError, get RangeError/none — the expected RED state)
4. **Task 2 GREEN: add SC-5 count pre-check bounds guards** — `98e492e` (feat) — src/structural-walk.ts (+count pre-check in walkEntities + walkComponents); 24/24 tests green; tsc clean; c8 100/100/100/100 on structural-walk.ts; wave-merge gate 100% on all 5 src files

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `src/structural-walk.ts` (created) — readVersion / parseSaveHeader / walkEntities / walkComponents (pure functions over BinaryReader; SC-2 readOnly+mirrors FieldEntries; SC-5 count pre-check + size/delta-0 bounds; version tolerance). The deterministic spine Wave 3 threads through.
- `test/structural-walk.test.ts` (created) — 24 node:test cases: readVersion (2), parseSaveHeader summary+SC-2 (3), walkEntities 33+delta-0+generic (3+1 mismatch), walkComponents delta-0 all 33 + Bank Wallet/Inventory + mismatch (3), SC-5 bounds guards (11), version tolerance (2).
- `test/helpers/malformed.ts` (created) — 7 small hand-built buffer helpers for SC-5 negative tests + version-bump (copies the cached fixture, never mutates the shared reference).

## Decisions Made

- **Typed-error split (ParseError vs propagated RangeError)** — the research code examples used `RangeError` throughout, but the plan explicitly says "typed ParseError" for the bounds checks. ParseError (the 02-01 field-table base class) gives a single typed-error hierarchy for parse-level fail-loud. So: explicit region-bound violations (count pre-check, negative size, size overruns region, delta-0 mismatch) → ParseError; BinaryReader native OOB / malformed-7-bit-prefix → RangeError propagated (never swallowed). Tests distinguish the two via `err instanceof RangeError && !(err instanceof ParseError)` (ParseError extends Error, NOT RangeError, so the check is exact).
- **Count pre-check uses MIN_ITEM_FRAMING = 5** — each item needs at least 1-byte 7-bit string prefix (empty id/name) + 4-byte int32 size = 5 bytes. `count * 5` cannot overflow a JS double for any int32 count (max ~1.07×10^10 < 2^53), so the bound is exact. The pre-check is NECESSARY (count*5 > remaining → definitely too big) but not SUFFICIENT — per-iteration size + delta-0 checks catch the rest. It exists to reject a giant count BEFORE any iteration/allocation (T-02-01).
- **walkEntities / walkComponents take (reader, regionStart, regionEnd)** — the CALLER determines regionEnd (the 02-05 orchestrator computes entity-list end = buffer.length − 36-byte tail; component regions come from the parent entity's size). This keeps the walks generic (no hard-coded tail size) and lets the orchestrator own the layout boundary. The test passes `listEnd = FIXTURE.length − 36` and asserts it equals 2,284,711.
- **parseSaveHeader emits ONLY header.GP + header.SlayerCoins as FieldEntries** — TotalLevel / name / gamemode are summary-only (NOT FieldEntries) because PROJECT.md defers header editing to a later milestone (v1 edits only the wallet/bank/skills, never the header). The two currency mirrors are emitted so Phase 3's patcher reads their `readOnly` flag and never targets the header (SC-2). `headerEnd` is exposed so the orchestrator knows where the entity list starts.
- **Did NOT mark IO-01 complete** — mirrors 02-01's stance. 02-02 delivers IO-01's structural skeleton (version → SaveHeader → entity list → component boundaries, offsets fresh from cursor) which IS the literal IO-01 definition. But the full IO-01 success criteria ('parse the fixture → version/summary/bank/skills with fresh offsets', VALIDATION SC-1) also requires the bank item list (689 stacks, 02-04) and skill XP/Level/LevelCap values (02-03) + the parseSave orchestrator (02-05). Marking IO-01 complete now would over-claim — the bank/skills values don't exist yet. IO-01 will be marked complete by 02-05 when the full parser ships. `requirements-completed: []`.
- **esbuild-interop c8 ignore limited to the file-header block** — V8 reports the `if (size < 0) throw` / `if (start+size > regionEnd) throw` / `if (cursor !== regionEnd) throw` bounds arms as single-arm branches (count array length 1) via esbuild's compilation, so they're all "covered" for what V8 measures WITHOUT needing per-export `/* c8 ignore next */` comments (unlike 02-01's `export class FieldTable` which triggered a 2-arm `__copyProps` defensive arm). The malformed-buffer tests still exercise every throw path for the plan's SC-5 correctness requirement (not for the gate). Verified empirically via the raw V8 coverage JSON: 27 branches, all single-arm count [1], 0 uncovered.

## Deviations from Plan

None - plan executed exactly as written. All design decisions (typed-error split, MIN_ITEM_FRAMING=5, caller-supplied regionEnd, summary-only TotalLevel/name/gamemode, not marking IO-01 complete, header-only c8 ignore) are consistent with the plan's behavior blocks, the research's verified reference values, the 02-01 precedent, and the PROJECT.md editing-scope constraint — they are the plan's intent, not deviations.

## Issues Encountered

None — both TDD cycles (RED → GREEN) passed on the first GREEN attempt. No pre-commit hook failures, no test failures during GREEN, no typecheck issues. The c8 gate passed at 100% on the first GREEN of both tasks (the esbuild interop was limited to the file-header block; the bounds `if (x) throw` arms compiled to single-arm V8 branches, all covered).

## User Setup Required

None - no external service configuration required. All files use Node built-ins (node:buffer, node:test, node:assert/strict) + the in-repo Phase 1/Phase 2 core (BinaryReader, FieldTable/ParseError, codec via the fixture helper). The fixture is committed at test/fixtures/test-fixture.sav (D-10). Zero new dependencies.

## Next Phase Readiness

- **Wave 3 region parsers (02-03/02-04) can now attach at the component boundaries this walk locates:**
  - 02-03 (Wallet + Experience parsers): inside the Bank entity's Wallet component (located by walkComponents), parse `[int32 n][ (int64 amount + string currencyID) × n ]` and key currencies by ID string (`MelvorBase:GoldPieces` → `wallet.GoldPieces` authoritative; `MelvorBase:SlayerCoins` → `wallet.SlayerCoins` authoritative). Mark the wallet int64 currencies `authoritative:true` — they are the write targets the header.GP/header.SlayerCoins mirrors (this plan) point at (SC-2). Inside each skill entity's Experience component, parse `[double XP][int32 LevelCap][int32 Level]` (LevelCap readOnly).
  - 02-04 (Bank Inventory bounded marker-search): scope the marker-search to the Inventory component's `[dataStart, dataStart + size)` region walkComponents locates inside the Bank entity (fixture: [710, 20496)). Recover all 689 stacks across tabs; emit FieldEntry per stack (int32 qty + bool placeholder/locked + string itemId); surface D-03 candidates for ambiguous matches.
  - 02-05 (parseSave orchestrator): wire readVersion → parseSaveHeader → walkEntities → (per entity) walkComponents → region parsers (02-03/02-04) → FieldTable + derived offset-free ViewModel; assert `assertNoOffsets(viewModel)` passes (SC-4 runtime). 02-05 will mark IO-01 complete when the full parser ships.
- **Phase 3 (patcher)** will read the `header.GP`/`header.SlayerCoins` FieldEntries' `readOnly` flag and NEVER target them (SC-2); it will read the wallet FieldEntries (02-03) `{offset, kind:'int64', width:8, value:bigint}` for same-width in-place writes via `writeBigInt64LE`.
- **Phase 4 (Electron round-trip)** will use the opaque entity `{id, start, size}` spans this walk retains to round-trip untouched entities byte-intact (the walk skips unmodeled component payloads via `seek(dataStart + size)`; it never mutates the buffer).
- **No blockers.** The structural spine is locked; the SC-2 mirror pattern + the typed-error split + the count pre-check are stable; the malformed-buffer helpers + version-bump helper are ready for 02-03/02-04/02-05 to reuse. The only carried concern (unchanged from STATE.md) is the varied-fixture corpus (D-04) — the parser tests are structured to drop in more fixtures, but the user is the sole source of real saves.

---
*Phase: 02-format-parser-fieldtable-model*
*Completed: 2026-07-04*

## Self-Check: PASSED

- src/structural-walk.ts — FOUND
- test/structural-walk.test.ts — FOUND
- test/helpers/malformed.ts — FOUND
- .planning/phases/02-format-parser-fieldtable-model/02-02-SUMMARY.md — FOUND
- Commit d987665 (Task 1 RED) — FOUND in git log
- Commit d8b60cb (Task 1 GREEN) — FOUND in git log
- Commit 2dd6f0c (Task 2 RED) — FOUND in git log
- Commit 98e492e (Task 2 GREEN) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- TDD gate: RED (d987665) → GREEN (d8b60cb) → RED (2dd6f0c) → GREEN (98e492e) — both cycles present in order, no REFACTOR needed
- Gates re-verified green: `npx tsx --test test/structural-walk.test.ts` (24 pass, 0 fail); `npx tsc --noEmit` (exit 0); `npx c8 --100 --include 'src/structural-walk.ts' --exclude 'test/**' tsx --test test/structural-walk.test.ts` (100% lines/statements/functions/branches, exit 0); wave-merge `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (100% on all 5 src files, 105 tests pass, exit 0)
- IO-01 NOT marked complete (deferred to 02-05) — documented in key-decisions; requirements-completed: []
