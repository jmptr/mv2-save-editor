---
phase: 02-format-parser-fieldtable-model
plan: 03
subsystem: parser
tags: [wallet-parser, experience-parser, currency-by-id, bigint, context-validation, readonly-cap, fail-loud, required-field, sc-1, sc-2, sc-3, d-03, d-04, tdd, node-test, strict-ts, c8]

# Dependency graph
requires:
  - phase: 01-03 (LE BinaryReader/Writer primitives)
    provides: "BinaryReader readInt32/readInt64(BigInt)/readDouble/readString + seek/offset — the stateful LE cursor the parsers consume; throws on OOB (T-1-04) + malformed 7-bit prefix (T-1-02) which the parsers let propagate as the natural sub-region bound"
  - phase: 02-01 (FieldTable + ViewModel contracts + test harness)
    provides: "FieldEntry discriminated union (int64 → bigint, T-02-06) + ParseError base class (the typed error parseExperience throws on context-validation failure) + RequiredFieldMissingError (the typed error parseWallet throws on missing GoldPieces — D-03 fail-loud) + test/helpers/fixture.ts loadFixtureBuffer() (the cached 2,284,747-byte decompressed fixture)"
  - phase: 02-02 (structural walk spine)
    provides: "walkComponents locates the Wallet component dataStart (20507) inside the Bank entity and each skill's Experience component dataStart (Woodcutting 47405) — the boundaries parseWallet/parseExperience attach at. The component regions [dataStart, dataStart+size) are already validated to fit their entity regions."
provides:
  - "parseWallet(reader, dataStart) (src/wallet-parser.ts): reads [int32 count][ (int64 amount + string currencyId) × count ], emits int64 FieldEntries keyed wallet.<shortName>, matched by currency-ID STRING (MelvorBase:GoldPieces / MelvorBase:SlayerCoins) never by position (fixture order GoldPieces, PrayerPoints, SlayerCoins). GP + SlayerCoins marked authoritative:true (SC-2 write targets); PrayerPoints emitted without authoritative. int64 amounts held as bigint (readInt64 — T-02-06). D-03 fail-loud: missing GoldPieces throws RequiredFieldMissingError(fieldKey='wallet.GoldPieces'); SlayerCoins is authoritative but NOT required."
  - "parseExperience(reader, dataStart, size) (src/experience-parser.ts): reads [double XP][int32 LevelCap][int32 Level], emits 3 FieldEntries at DISTINCT offsets (xp+0, levelCap+8, level+12) so Phase 3 never confuses cap/level (Pitfall 5). LevelCap marked readOnly:true (Phase 3 NEVER patches the cap); XP + Level writable (Phase 3 edit targets). SC-3 context-validation: rejects unless 1<=levelCap<=200, 1<=level<=levelCap, XP finite & >=0, and size>=16 — throws typed ParseError (fail-loud) before the triple enters the model."
  - "Currency-by-ID pattern (RESEARCH §Pattern 2) and distinct-offset Experience triple + readOnly cap (RESEARCH §Pitfall 5) — both proven against the verified fixture offsets and crafted buffers."
affects:
  - "02-04 (Bank Inventory bounded marker-search): sibling Wave 2 plan; shares the Bank entity's component boundaries 02-02 locates (Inventory dataStart 710) and the test/helpers/fixture.ts harness; does not consume 02-03's parsers directly"
  - "02-05 (parseSave orchestrator): wires readVersion → parseSaveHeader → walkEntities → (per entity) walkComponents → parseWallet (Bank) / parseExperience (each skill) / 02-04 Inventory → FieldTable + derived offset-free ViewModel. Re-keys the Experience component-relative keys (experience.xp/levelCap/level) per skill (skill.<skillId>.xp etc.) for FieldTable uniqueness. Asserts assertNoOffsets(viewModel) passes (SC-4 runtime). Will mark IO-01 complete when the full parser ships."
  - "Phase 3 (patcher): reads the wallet FieldEntries (authoritative int64 GP/SlayerCoins) for same-width in-place writes via writeBigInt64LE; reads the Experience FieldEntries (double XP writable, int32 Level writable) and NEVER writes LevelCap (readOnly flag). The header.GP/header.SlayerCoins mirrors (02-02) are never targeted (readOnly + mirrors)."

# Tech tracking
tech-stack:
  added: []  # zero new deps — pure TS over Phase 1 BinaryReader + Phase 2 FieldTable/ParseError (02-01)
  patterns:
    - "Currency-by-ID string matching (never by position) — the fixture wallet order [GoldPieces, PrayerPoints, SlayerCoins] has PrayerPoints BETWEEN GP and SC, so position-based matching would mis-identify SC as PrayerPoints (slot 1, offset 20541, value 987361n). String-keying (MelvorBase:GoldPieces / MelvorBase:SlayerCoins) is the decisive correctness fix (RESEARCH §Pattern 2)."
    - "int64 amounts as bigint via readInt64 (T-02-06) — GP=953063625 and SC could exceed 2^53; Number would corrupt the write target. The FieldEntry discriminated union types value: bigint for kind: 'int64' at compile time (tsc rejects value: number)."
    - "Distinct-offset Experience triple + readOnly cap (Pitfall 5) — [double XP][int32 LevelCap][int32 Level] records xp(+0), levelCap(+8, readOnly), level(+12) as separate FieldEntries so Phase 3's patcher never confuses the two adjacent int32s and never patches the cap."
    - "SC-3 context-validation fail-loud before model entry — parseExperience rejects any triple where 1<=levelCap<=200, 1<=level<=levelCap, XP finite & >=0, or size<16, throwing a typed ParseError (never emit a silently-wrong model)."
    - "Component-relative FieldEntry keys re-keyed by the orchestrator — parseExperience emits experience.xp/levelCap/level (component-relative); 02-05 re-keys per skill (skill.<skillId>.xp) for FieldTable uniqueness. parseWallet emits wallet.GoldPieces etc. (one wallet per save, so the wallet. prefix is already unique). The parser is a pure structural parser; the orchestrator owns entity-level namespacing."
    - "D-03 fail-loud on missing required GoldPieces — parseWallet throws RequiredFieldMissingError (the Plan 01 typed error) when GoldPieces is absent from the Wallet; SlayerCoins is authoritative but NOT required (a gamemode omitting SC still parses)."
    - "esbuild-interop /* c8 ignore start/end */ around the file header (carried from 01-02/01-03/02-01/02-02) — suppresses only the injected __export/__copyProps defensive arm source-mapped to the header; 100% coverage on all metrics without lowering the --100 threshold. No per-export c8 ignore needed (pure export function modules, like structural-walk.ts)."

key-files:
  created:
    - "src/wallet-parser.ts — parseWallet(reader, dataStart): currency-by-ID int64 FieldEntries (GP/SlayerCoins authoritative), D-03 fail-loud on missing GoldPieces (RequiredFieldMissingError)"
    - "src/experience-parser.ts — parseExperience(reader, dataStart, size): XP/Cap/Level FieldEntries at distinct offsets, levelCap readOnly (Pitfall 5), SC-3 context-validation (ParseError fail-loud)"
    - "test/wallet-parser.test.ts — 8 node:test cases: fixture wallet (GP/SC/PrayerPoints by ID, authoritative flags, order-not-assumed proof), D-03 fail-loud (missing GP, GP-only), bigint precision"
    - "test/experience-parser.test.ts — 15 node:test cases: Woodcutting XP/Cap/Level distinct offsets + readOnly cap, SC-3 context-validation negatives (level>cap, cap>200, cap<1, level<1, negative/NaN/Infinity XP, size<16), boundary-valid triples"
  modified: []

key-decisions:
  - "Currency-by-ID (not by order) is the decisive correctness fix — the fixture wallet has 3 currencies in order [GoldPieces, PrayerPoints, SlayerCoins]; PrayerPoints sits BETWEEN GP and SlayerCoins (offsets 20511 < 20541 < 20573). Position-based matching would assign SC to slot 1 (offset 20541, value 987361n — wrong); string-keying assigns SC to slot 2 (offset 20573, value 6511n — correct). The test asserts PrayerPoints.offset is strictly between GP and SC, proving currency-by-ID. (RESEARCH §Pattern 2.)"
  - "RequiredFieldMissingError for missing GP uses the Plan 01 class with fieldKey='wallet.GoldPieces' — the plan's behavior said 'throw RequiredFieldMissingError with an actionable message (no GoldPieces currency in Wallet)'. The Plan 01 RequiredFieldMissingError class (which 02-03 consumes as-is — cannot modify src/field-table.ts) builds its message from fieldKey: `required field \"wallet.GoldPieces\" was not added to the FieldTable (D-03 zero-match rule — fail loud, never emit a silently-wrong model)`. This message IS actionable (it names the exact missing field and the D-03 principle); the test asserts err instanceof RequiredFieldMissingError, err.fieldKey === 'wallet.GoldPieces', and err.message includes 'GoldPieces'. The research's literal 'no GoldPieces currency in Wallet' was a pre-Plan-01 recommendation; the actual Plan 01 class delivers equivalent actionable content via fieldKey. Documented as a decision (faithful to the plan's intent), not a deviation."
  - "SlayerCoins is authoritative but NOT required — the plan's behavior marks GP and SlayerCoins authoritative:true (both are write targets when present), but only GoldPieces is REQUIRED (D-03 fail-loud on absence). A crafted Wallet with only GP (no SC) parses successfully (test 'a Wallet with only GoldPieces parses — SC is authoritative but NOT required'). This honors the research's open-question-1 recommendation (treat GP as required; revisit if a real gamemode legitimately lacks GP) without over-constraining SC."
  - "Experience FieldEntry keys are component-relative (experience.xp/levelCap/level); the 02-05 orchestrator re-keys per skill — the plan's signature is parseExperience(reader, dataStart, size) (three args, no skillId). Since there are MULTIPLE skills each with an Experience component, static experience.* keys would collide in the FieldTable (add() throws on duplicate keys). The cleanest faithful resolution: the parser emits component-relative keys (matching the wallet. prefix pattern for the single-wallet case); the 02-05 orchestrator, which has the skill entity-ID context, re-keys them to skill.<skillId>.xp etc. when populating the FieldTable. The parser is a pure structural parser over the component bytes; the orchestrator owns entity-level namespacing. This matches the plan's signature exactly and 'emits FieldEntries' literally."
  - "LevelCap readOnly:true, XP + Level writable — Pitfall 5 (two adjacent int32s: confusing cap/level would corrupt the save). The parser records the triple at DISTINCT offsets (xp+0, levelCap+8, level+12) and marks levelCap readOnly so Phase 3's patcher NEVER patches the cap. XP (double) and Level (int32) are the writable edit targets (no readOnly flag). The test asserts the three offsets are distinct and levelCap.readOnly === true."
  - "SC-3 context-validation bounds: 1<=levelCap<=200, 1<=level<=levelCap, XP finite & >=0, size>=16 — the fixture caps are 120, so 200 is a conservative upper bound (RESEARCH A2: a future higher cap would need the bound raised; it only affects validation strictness, not offset derivation). The lower bounds (cap=1, level=1, xp=0) and upper bounds (cap=200, level=200) are boundary-tested and parse successfully. Every out-of-range/undersized triple throws a typed ParseError before entering the model (fail-loud)."
  - "Wallet count relies on the BinaryReader's OOB throws (no count pre-check) — the plan's signature is parseWallet(reader, dataStart) (no size param), and the plan's threat model scoped the giant-count threat (T-02-01) to the structural walk (02-02), NOT the wallet parser. 02-02's walkComponents already validated the Wallet component's [dataStart, dataStart+size) region fits the entity; the wallet parser operates within that already-bounded region and relies on the BinaryReader's native OOB / malformed-7-bit-prefix RangeErrors (T-1-02/T-1-04) to bound the count loop (it cannot read past the buffer end). This is the deliberate two-layer design: 02-02 bounds the structural counts; the region parsers rely on the BinaryReader for sub-region bounds. Consistent with the research code example (which loops `for (let i = 0; i < n; i++)` without a pre-check). The experience parser DOES take `size` and checks `size < 16` (its triple has a fixed width, so the size check is a clean pre-read guard)."
  - "Did NOT mark IO-01 complete — mirrors 02-01/02-02's stance. 02-03 delivers the currency (Wallet) and skill-XP/Level/LevelCap (Experience) halves of SC-1, the wallet-authoritative half of SC-2, and the Experience context-validation half of SC-3. But the full IO-01 success criteria ('parse the fixture → version/summary/bank/skills with fresh offsets', VALIDATION SC-1) also requires the bank item list (689 stacks, 02-04) and the parseSave orchestrator (02-05). Marking IO-01 complete now would over-claim — the bank item list doesn't exist yet. IO-01 will be marked complete by 02-05 when the full parser ships. requirements-completed: []."
  - "esbuild-interop c8 ignore limited to the file-header block (both parsers) — V8 reports the validation `if (...) throw` arms and the `if (authoritative) ...` arm as single-arm branches (count array length 1) via esbuild's compilation, so they're all 'covered' for what V8 measures WITHOUT needing per-export `/* c8 ignore next */` comments (same as 02-02's structural-walk.ts; unlike 02-01's `export class FieldTable` which triggered a 2-arm `__copyProps` defensive arm). The negative-test buffers exercise every throw path for the plan's SC-3 correctness requirement. 100% coverage on all metrics achieved without lowering the --100 threshold."

patterns-established:
  - "Currency-by-ID string matching inside a structurally-located Wallet component — the pattern that makes GP a REQUIRED field (fail-loud if absent) and SlayerCoins authoritative-but-optional, robust to the fixture's [GoldPieces, PrayerPoints, SlayerCoins] order (PrayerPoints between GP and SC)."
  - "Distinct-offset triple + readOnly cap for Experience — [double XP][int32 LevelCap][int32 Level] recorded as 3 FieldEntries at xp+0/levelCap+8/level+12, with levelCap readOnly so Phase 3 never patches the cap (Pitfall 5)."
  - "SC-3 context-validation fail-loud before model entry — the parser validates cap/level/XP ranges and size, throwing a typed ParseError on any failure so a malformed/crafted Experience never enters the model."
  - "Component-relative FieldEntry keys re-keyed by the orchestrator — when a region parser runs across multiple entities (Experience per skill), it emits component-relative keys and the orchestrator (which has the entity-ID context) namespaces them for FieldTable uniqueness. The parser stays a pure structural parser; the orchestrator owns namespacing."
  - "D-03 fail-loud on missing required field — parseWallet throws RequiredFieldMissingError when the required GoldPieces is absent (the Plan 01 typed error, fieldKey naming the missing field); non-required authoritative fields (SlayerCoins) are absent without throwing."

requirements-completed: []  # IO-01 is NOT marked complete here — see key-decisions. 02-03 delivers the currency (Wallet) + skill (Experience) halves of SC-1, the wallet-authoritative half of SC-2, and the Experience context-validation half of SC-3. But the full IO-01 (bank items 02-04 + orchestrator 02-05) ships across the rest of Phase 2. Marking IO-01 complete now would over-claim (no bank item list exists yet). IO-01 marked complete by 02-05 when the full parser ships.

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "parseWallet (src/wallet-parser.ts): currency-by-ID over the fixture Wallet (dataStart 20507, count 3) — GP matched by ID at offset 20511 = 953063625n (authoritative, bigint); SlayerCoins by ID at offset 20573 = 6511n (authoritative, bigint); PrayerPoints present at offset 20541 = 987361n (NOT authoritative, sits strictly BETWEEN GP and SC — proves currency-by-ID not order). int64 held as bigint (T-02-06). D-03 fail-loud: a crafted Wallet lacking GoldPieces throws RequiredFieldMissingError(fieldKey='wallet.GoldPieces', message names GoldPieces); a Wallet with only GP parses (SC not required)."
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/wallet-parser.test.ts#GoldPieces is matched by ID string at offset 20511, authoritative (SC-2)"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#SlayerCoins is matched by ID string at offset 20573, authoritative (SC-2)"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#PrayerPoints is present between GP and SlayerCoins — order NOT assumed (SC-1 / RESEARCH §Pattern 2)"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#int64 amounts are bigint (never Number — T-02-06 precision)"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#a Wallet buffer lacking GoldPieces throws RequiredFieldMissingError"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#the missing-GP error carries the actionable fieldKey naming GoldPieces"
        status: pass
      - kind: unit
        ref: "test/wallet-parser.test.ts#a Wallet with only GoldPieces (no SlayerCoins) parses — SC is authoritative but NOT required"
        status: pass
      - kind: other
        ref: "npx c8 --100 --include 'src/wallet-parser.ts' --exclude 'test/**' tsx --test test/wallet-parser.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes; int64 value: bigint enforced by the discriminated union, T-02-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseExperience (src/experience-parser.ts): Woodcutting Experience (dataStart 47405, size 16) parses to XP 7439645.20000645 @ +0 (double, writable), LevelCap 120 @ +8 (int32, readOnly — Pitfall 5), Level 93 @ +12 (int32, writable) — 3 DISTINCT offsets. SC-3 context-validation: rejects level>cap, cap>200, cap<1, level<1, negative XP, NaN XP, Infinity XP, size<16 — each throws typed ParseError (fail-loud). Boundary-valid triples (cap=1/lvl=1/xp=0 and cap=200/lvl=200) parse at the edges."
    requirement: IO-01
    verification:
      - kind: unit
        ref: "test/experience-parser.test.ts#XP is a double at offset +0 (47405), writable — Phase 3 target (SC-1)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#LevelCap is an int32 at offset +8 (47413), readOnly — Phase 3 never patches (Pitfall 5)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#Level is an int32 at offset +12 (47417), writable — Phase 3 target (SC-1)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#the three offsets are DISTINCT (xp < levelCap < level) — Pitfall 5"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#level > cap throws ParseError"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#cap > 200 throws ParseError"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#cap < 1 throws ParseError"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#level < 1 throws ParseError"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#negative XP throws ParseError"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#NaN XP throws ParseError (finite required)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#Infinity XP throws ParseError (finite required)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#size < 16 throws ParseError (undersized component)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#a boundary-valid triple at the edges parses (cap=1, level=1, xp=0)"
        status: pass
      - kind: unit
        ref: "test/experience-parser.test.ts#a boundary-valid triple at the upper edge parses (cap=200, level=200, xp finite)"
        status: pass
      - kind: other
        ref: "npx c8 --100 --include 'src/experience-parser.ts' --exclude 'test/**' tsx --test test/experience-parser.test.ts → 100% lines/statements/functions/branches (D-04 gate)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit → exit 0 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 03: Wallet + Experience Parsers Summary

**Wallet parser (currency-by-ID bigint, GP/SlayerCoins authoritative, D-03 fail-loud on missing GoldPieces) + Experience parser (XP/Cap/Level distinct offsets, readOnly cap per Pitfall 5, SC-3 context-validated fail-loud) — both pure functions over the BinaryReader at the component dataStart boundaries 02-02 locates, 100% coverage on all metrics, zero new deps.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-04T01:35:54Z
- **Completed:** 2026-07-04T01:47:59Z
- **Tasks:** 2 (both TDD: RED → GREEN, no REFACTOR needed — implementations minimal and clean on first GREEN)
- **Files created:** 4 (src/wallet-parser.ts, src/experience-parser.ts, test/wallet-parser.test.ts, test/experience-parser.test.ts)

## Accomplishments

- **src/wallet-parser.ts** — `parseWallet(reader, dataStart)` reads the Bank entity's Wallet component `[int32 count][ (int64 amount + string currencyId) × count ]` and emits int64 FieldEntries keyed `wallet.<shortName>` (the short name after the last `:`). Currencies are matched by their ID STRING (`MelvorBase:GoldPieces` → GP, `MelvorBase:SlayerCoins` → SC), NEVER by position — the fixture wallet order is [GoldPieces, PrayerPoints, SlayerCoins] and PrayerPoints sits BETWEEN GP and SC, so position-based matching would mis-identify SC as PrayerPoints (slot 1, offset 20541, value 987361n). GP and SlayerCoins are marked `authoritative: true` (SC-2 write targets — the keys the 02-02 header mirrors point at); PrayerPoints is emitted without authoritative (not a v1 edit target). int64 amounts are held as `bigint` via `readInt64` (T-02-06 — GP exceeds 2^53, Number would corrupt the write target). D-03 fail-loud: GoldPieces is REQUIRED — a Wallet lacking GoldPieces throws `RequiredFieldMissingError` (fieldKey `wallet.GoldPieces`, actionable message naming the missing field); SlayerCoins is authoritative but NOT required (a gamemode omitting SC still parses). Fixture verified: GP=953063625n @ 20511, SlayerCoins=6511n @ 20573, PrayerPoints=987361n @ 20541.
- **src/experience-parser.ts** — `parseExperience(reader, dataStart, size)` reads a skill entity's Experience component `[double XP][int32 LevelCap][int32 Level]` (16 bytes) and emits 3 FieldEntries at DISTINCT offsets: xp at dataStart+0 (double, writable), levelCap at dataStart+8 (int32, `readOnly: true` — Pitfall 5: Phase 3 NEVER patches the cap), level at dataStart+12 (int32, writable). The distinct offsets ensure Phase 3's patcher never confuses the two adjacent int32s (cap vs level). SC-3 context-validation: rejects unless `1 <= levelCap <= 200`, `1 <= level <= levelCap`, XP finite & >= 0, and `size >= 16` — throwing a typed `ParseError` (fail-loud) so a malformed/crafted Experience never enters the model. Keys are component-relative (`experience.xp/levelCap/level`); the 02-05 orchestrator re-keys them per skill (`skill.<skillId>.xp` etc.) for FieldTable uniqueness (the parser is a pure structural parser; the orchestrator owns entity-level namespacing). Fixture verified: Woodcutting XP=7439645.20000645 @ 47405, cap=120 @ 47413, level=93 @ 47417.
- **D-04 coverage gate satisfied** (both parsers + wave-merge): `npx c8 --100 --include 'src/wallet-parser.ts' --exclude 'test/**' tsx --test test/wallet-parser.test.ts` and the experience equivalent → 100% lines/statements/functions/branches on each. Wave-merge `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` → 100% on all 7 src files (binary-reader, binary-writer, codec, experience-parser, field-table, structural-walk, wallet-parser); 128 tests pass.
- **D-07/D-08 typecheck gate satisfied**: `npx tsc --noEmit` → exit 0 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` unchanged; int64 value: bigint enforced by the FieldEntry discriminated union, T-02-06).
- **Threat model mitigated**: T-02-06 (int64 as Number → bigint via readInt64 + currency-by-ID not order), T-02-05 (wrong int / invalid Experience triple → distinct offsets + context-validation throws before model entry; cap readOnly), T-02-07 (missing GoldPieces → RequiredFieldMissingError fail-loud, never a silently-wrong model), T-02-SC (no packages installed — zero supply-chain surface).

## Task Commits

Both tasks were TDD (RED → GREEN, no REFACTOR needed — implementations were minimal and clean on first GREEN).

1. **Task 1 RED: add failing wallet-parser test suite** — `302e794` (test) — test/wallet-parser.test.ts (8 tests; src/wallet-parser.ts absent → MODULE_NOT_FOUND, the expected RED state)
2. **Task 1 GREEN: implement wallet parser** — `a15a747` (feat) — src/wallet-parser.ts (parseWallet: currency-by-ID, authoritative GP/SC, D-03 fail-loud on missing GoldPieces); 8/8 tests green; tsc clean; c8 100/100/100/100 on wallet-parser.ts
3. **Task 2 RED: add failing experience-parser test suite** — `6b2307c` (test) — test/experience-parser.test.ts (15 tests; src/experience-parser.ts absent → MODULE_NOT_FOUND)
4. **Task 2 GREEN: implement experience parser** — `748173c` (feat) — src/experience-parser.ts (parseExperience: XP/Cap/Level distinct offsets, readOnly cap, SC-3 context-validation); 15/15 tests green; tsc clean; c8 100/100/100/100 on experience-parser.ts; wave-merge gate 100% on all 7 src files

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `src/wallet-parser.ts` (created) — parseWallet(reader, dataStart): currency-by-ID int64 FieldEntries (GP/SlayerCoins authoritative), D-03 fail-loud on missing GoldPieces (RequiredFieldMissingError). The wallet write target Phase 3's patcher edits.
- `src/experience-parser.ts` (created) — parseExperience(reader, dataStart, size): XP/Cap/Level FieldEntries at distinct offsets (xp+0, cap+8 readOnly, level+12), SC-3 context-validation (ParseError fail-loud on out-of-range/undersized triple). The skill XP/Level write targets Phase 3's patcher edits.
- `test/wallet-parser.test.ts` (created) — 8 node:test cases: fixture wallet (GP/SC/PrayerPoints by ID, authoritative flags, order-not-assumed proof), D-03 fail-loud (missing GP throws RequiredFieldMissingError, GP-only parses), bigint precision. Includes buildWalletBuffer() helper for crafted negative-test buffers.
- `test/experience-parser.test.ts` (created) — 15 node:test cases: Woodcutting XP/Cap/Level at distinct offsets + readOnly cap, SC-3 context-validation negatives (level>cap, cap>200, cap<1, level<1, negative/NaN/Infinity XP, size<16 — each throws ParseError), boundary-valid triples (cap=1/lvl=1/xp=0 and cap=200/lvl=200). Includes buildExperienceBuffer() helper.

## Decisions Made

- **Currency-by-ID (not by order) is the decisive correctness fix** — the fixture wallet has 3 currencies in order [GoldPieces, PrayerPoints, SlayerCoins]; PrayerPoints sits BETWEEN GP and SlayerCoins (offsets 20511 < 20541 < 20573). Position-based matching would assign SC to slot 1 (offset 20541, value 987361n — wrong); string-keying assigns SC to slot 2 (offset 20573, value 6511n — correct). The test asserts PrayerPoints.offset is strictly between GP and SC, proving currency-by-ID (RESEARCH §Pattern 2).
- **RequiredFieldMissingError for missing GP uses the Plan 01 class with fieldKey='wallet.GoldPieces'** — the plan's behavior said 'throw RequiredFieldMissingError with an actionable message (no GoldPieces currency in Wallet)'. The Plan 01 RequiredFieldMissingError class (which 02-03 consumes as-is — cannot modify src/field-table.ts) builds its message from fieldKey: `required field "wallet.GoldPieces" was not added to the FieldTable (D-03 zero-match rule — fail loud, never emit a silently-wrong model)`. This message IS actionable (it names the exact missing field and the D-03 principle); the test asserts `err instanceof RequiredFieldMissingError`, `err.fieldKey === 'wallet.GoldPieces'`, and `err.message.includes('GoldPieces')`. The research's literal 'no GoldPieces currency in Wallet' was a pre-Plan-01 recommendation; the actual Plan 01 class delivers equivalent actionable content via fieldKey.
- **SlayerCoins is authoritative but NOT required** — the plan marks GP and SlayerCoins authoritative:true (both write targets when present), but only GoldPieces is REQUIRED (D-03 fail-loud on absence). A crafted Wallet with only GP (no SC) parses successfully. This honors the research's open-question-1 recommendation (treat GP as required; revisit if a real gamemode legitimately lacks GP) without over-constraining SC.
- **Experience FieldEntry keys are component-relative; the 02-05 orchestrator re-keys per skill** — the plan's signature is `parseExperience(reader, dataStart, size)` (three args, no skillId). Since there are MULTIPLE skills each with an Experience component, static `experience.*` keys would collide in the FieldTable (`add()` throws on duplicate keys). The cleanest faithful resolution: the parser emits component-relative keys (matching the `wallet.` prefix pattern for the single-wallet case); the 02-05 orchestrator, which has the skill entity-ID context, re-keys them to `skill.<skillId>.xp` etc. when populating the FieldTable. The parser is a pure structural parser over the component bytes; the orchestrator owns entity-level namespacing. This matches the plan's signature exactly and 'emits FieldEntries' literally.
- **LevelCap readOnly:true, XP + Level writable (Pitfall 5)** — two adjacent int32s (cap, level): confusing them would corrupt the save. The parser records the triple at DISTINCT offsets (xp+0, levelCap+8, level+12) and marks levelCap `readOnly: true` so Phase 3's patcher NEVER patches the cap. XP (double) and Level (int32) are the writable edit targets (no readOnly flag). The test asserts the three offsets are distinct and `levelCap.readOnly === true`.
- **SC-3 context-validation bounds: 1<=levelCap<=200, 1<=level<=levelCap, XP finite & >=0, size>=16** — the fixture caps are 120, so 200 is a conservative upper bound (RESEARCH A2: a future higher cap would need the bound raised; it only affects validation strictness, not offset derivation). The lower bounds (cap=1, level=1, xp=0) and upper bounds (cap=200, level=200) are boundary-tested and parse successfully. Every out-of-range/undersized triple throws a typed ParseError before entering the model (fail-loud).
- **Wallet count relies on the BinaryReader's OOB throws (no count pre-check)** — the plan's signature is `parseWallet(reader, dataStart)` (no size param), and the plan's threat model scoped the giant-count threat (T-02-01) to the structural walk (02-02), NOT the wallet parser. 02-02's walkComponents already validated the Wallet component's [dataStart, dataStart+size) region fits the entity; the wallet parser operates within that already-bounded region and relies on the BinaryReader's native OOB / malformed-7-bit-prefix RangeErrors (T-1-02/T-1-04) to bound the count loop (it cannot read past the buffer end). This is the deliberate two-layer design: 02-02 bounds the structural counts; the region parsers rely on the BinaryReader for sub-region bounds. The experience parser DOES take `size` and checks `size < 16` (its triple has a fixed width, so the size check is a clean pre-read guard).
- **Did NOT mark IO-01 complete** — mirrors 02-01/02-02's stance. 02-03 delivers the currency (Wallet) and skill-XP/Level/LevelCap (Experience) halves of SC-1, the wallet-authoritative half of SC-2, and the Experience context-validation half of SC-3. But the full IO-01 success criteria ('parse the fixture → version/summary/bank/skills with fresh offsets', VALIDATION SC-1) also requires the bank item list (689 stacks, 02-04) and the parseSave orchestrator (02-05). Marking IO-01 complete now would over-claim — the bank item list doesn't exist yet. IO-01 will be marked complete by 02-05 when the full parser ships. `requirements-completed: []`.
- **esbuild-interop c8 ignore limited to the file-header block (both parsers)** — V8 reports the validation `if (...) throw` arms and the `if (authoritative) ...` arm as single-arm branches (count array length 1) via esbuild's compilation, so they're all 'covered' for what V8 measures WITHOUT needing per-export `/* c8 ignore next */` comments (same as 02-02's structural-walk.ts; unlike 02-01's `export class FieldTable` which triggered a 2-arm `__copyProps` defensive arm). 100% coverage on all metrics achieved without lowering the --100 threshold.

## Deviations from Plan

None - plan executed exactly as written. All design decisions (currency-by-ID, RequiredFieldMissingError via Plan 01 class with fieldKey, SlayerCoins authoritative-but-not-required, component-relative Experience keys re-keyed by orchestrator, LevelCap readOnly, SC-3 bounds, wallet count relying on BinaryReader OOB, not marking IO-01 complete, header-only c8 ignore) are consistent with the plan's behavior blocks, the research's verified reference values, the 02-01/02-02 precedents, and the PROJECT.md editing-scope constraint — they are the plan's intent, not deviations.

## Issues Encountered

None — both TDD cycles (RED → GREEN) passed on the first GREEN attempt. No pre-commit hook failures, no test failures during GREEN, no typecheck issues. The c8 gate passed at 100% on the first GREEN of both tasks (the esbuild interop was limited to the file-header block; the validation `if (...) throw` arms and the `if (authoritative) ...` arm compiled to single-arm V8 branches, all covered). The XP double's shortest round-tripping decimal (7439645.20000645) was confirmed via a pre-execution probe and the literal round-trips bit-faithfully, so `assert.equal(xp, 7439645.20000645)` is exact (no tolerance needed). `assert.approxEqual` is NOT available on this Node 24 build, so the exact-literal approach was used instead.

## User Setup Required

None - no external service configuration required. All files use Node built-ins (node:buffer, node:test, node:assert/strict) + the in-repo Phase 1/Phase 2 core (BinaryReader, FieldTable/ParseError/RequiredFieldMissingError, fixture harness via codec). The fixture is committed at test/fixtures/test-fixture.sav (D-10). Zero new dependencies.

## Next Phase Readiness

- **02-04 (Bank Inventory bounded marker-search) can now attach at the Inventory component boundary** 02-02's walkComponents locates inside the Bank entity (fixture: Inventory dataStart 710, region [710, 20496)). It recovers all 689 stacks across tabs via the bounded marker-search + "6-bytes-before-the-length-prefix" + context-validation (RESEARCH §Pattern 3), emitting FieldEntry per stack (int32 qty + bool placeholder/locked + string itemId) and surfacing D-03 candidates for ambiguous matches. It shares the test/helpers/fixture.ts harness and the Bank entity's component boundaries 02-02 locates.
- **02-05 (parseSave orchestrator) can now wire the spine + all region parsers:**
  - `readVersion → parseSaveHeader → walkEntities → (per entity) walkComponents`
  - Bank entity: `parseWallet` (this plan) at the Wallet dataStart + 02-04 at the Inventory dataStart
  - Each skill entity: `parseExperience` (this plan) at the Experience dataStart, re-keying component-relative keys to `skill.<skillId>.xp/levelCap/level`
  - → FieldTable + derived offset-free ViewModel; assert `assertNoOffsets(viewModel)` passes (SC-4 runtime). 02-05 will mark IO-01 complete when the full parser ships.
- **Phase 3 (patcher)** will read the wallet FieldEntries (authoritative int64 GP/SlayerCoins `{offset, kind:'int64', width:8, value:bigint}`) for same-width in-place writes via `writeBigInt64LE`; read the Experience FieldEntries (double XP writable, int32 Level writable) and NEVER write LevelCap (readOnly flag); read the header.GP/header.SlayerCoins mirrors' readOnly flag and NEVER target the header (SC-2).
- **No blockers.** The two structural sub-parsers are locked; the currency-by-ID pattern, the distinct-offset Experience triple + readOnly cap, the SC-3 context-validation, and the D-03 fail-loud on missing GP are stable. The component-relative Experience keys + orchestrator re-keying contract is documented for 02-05. The only carried concern (unchanged from STATE.md) is the varied-fixture corpus (D-04) — the parser tests are structured to drop in more fixtures, but the user is the sole source of real saves.

---
*Phase: 02-format-parser-fieldtable-model*
*Completed: 2026-07-04*

## Self-Check: PASSED

- src/wallet-parser.ts — FOUND
- src/experience-parser.ts — FOUND
- test/wallet-parser.test.ts — FOUND
- test/experience-parser.test.ts — FOUND
- .planning/phases/02-format-parser-fieldtable-model/02-03-SUMMARY.md — FOUND
- Commit 302e794 (Task 1 RED) — FOUND in git log
- Commit a15a747 (Task 1 GREEN) — FOUND in git log
- Commit 6b2307c (Task 2 RED) — FOUND in git log
- Commit 748173c (Task 2 GREEN) — FOUND in git log
- SUMMARY frontmatter status: complete — FOUND
- TDD gate: RED (302e794) → GREEN (a15a747) → RED (6b2307c) → GREEN (748173c) — both cycles present in order, no REFACTOR needed
- Gates re-verified green: `npx tsx --test test/wallet-parser.test.ts` (8 pass, 0 fail); `npx tsx --test test/experience-parser.test.ts` (15 pass, 0 fail); `npx tsc --noEmit` (exit 0); wave-merge `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (100% lines/statements/functions/branches on all 7 src files, 128 tests pass, exit 0)
- IO-01 NOT marked complete (deferred to 02-05) — documented in key-decisions; requirements-completed: []
