# Roadmap: MV2 Save Editor

## Overview

This roadmap builds the save editor inside-out, so the corruption risk is proven away before any UI exists. First a pure-TS format core is stood up and byte-exactly tested: primitives + Brotli round-trip (Phase 1), the layout parser + fresh-offset FieldTable (Phase 2), then the same-width patch engine, validation, and XP table (Phase 3) — all headless, all golden-file tested against a real `.sav` corpus. Only then does the trusted Electron main process wrap the core with secure IPC and a non-destructive new-file write (Phase 4), and finally the renderer surfaces the user loop: browse, search, edit with validation, preview, confirm (Phase 5). Phases 1-3 carry all the correctness risk and are the crown jewels; 4-5 are comparatively standard Electron plumbing. The ultimate acceptance for any edit is a mandatory manual in-game load.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Binary Primitives + Brotli Codec** - Pure-core LE primitives + game-compatible Brotli round-trip, proven byte-exact (completed 2026-07-03)
- [x] **Phase 2: Format Parser + FieldTable Model** - Walk the documented layout into a fresh-offset FieldTable + JSON view model (completed 2026-07-04)
- [x] **Phase 3: Patcher + Validation + XP Table** - Same-width patch engine, range/type validation, and XP-table-consistent skill edits (completed 2026-07-04)
- [x] **Phase 4: Electron Shell + Secure IPC + Non-Destructive Write** - Trusted main process owns bytes/fs/Brotli; narrow IPC; writes a new file (completed 2026-07-04)
- [ ] **Phase 5: Renderer UI — Browse, Search, Edit, Preview** - User-facing loop: summary, searchable lists, validated edits, preview/confirm

## Phase Details

### Phase 1: Binary Primitives + Brotli Codec

**Goal**: A pure-TS format core can losslessly Brotli round-trip a real save and read/write every little-endian primitive with correct width — proven headless before any Electron exists.
**Depends on**: Nothing (first phase)
**Requirements**: IO-03
**Success Criteria** (what must be TRUE):

  1. `compress(decompress(original))` decompresses back to a byte-identical decompressed buffer for every fixture in the real-save corpus, using standard-parameter Brotli (no large-window) that .NET can read.
  2. A no-op load→save (decompress → zero edits → recompress) yields a decompressed buffer byte-identical to the input, and the codec asserts `output.length === input.length`, failing loudly if the invariant is ever violated.
  3. BinaryReader/Writer round-trips int32, int64 (BigInt), double, bool, and 7-bit-length UTF-8 strings against known .NET-produced bytes — including a ≥128-byte length prefix and a multi-byte UTF-8 string.
  4. All fixed-width numeric reads/writes are little-endian, and a wrong-width or wrong-endian write is caught by unit tests rather than silently corrupting adjacent bytes.

**Plans**: 3/3 plans executed
Plans:

- [x] 01-01-PLAN.md — Toolchain + fixture scaffolding + devDep install (blocking human-verify checkpoint for SUS packages)
- [x] 01-02-PLAN.md — Brotli codec (src/codec.ts) + IO-03 round-trip + length invariant + bomb cap + large-window rejection
- [x] 01-03-PLAN.md — LE BinaryReader/Writer primitives + D-14 edge matrix + wrong-width/endian negatives + D-12 fixture slices

**Cross-cutting constraints:**

- tsc --noEmit passes with strict + noUncheckedIndexedAccess (D-07/D-08)

### Phase 2: Format Parser + FieldTable Model

**Goal**: The core parses a real decompressed save — version → SaveHeader → entity list → Bank (wallet + item stacks) and skill ExperienceComponents — into a fresh-offset FieldTable and a JSON view model, with offsets re-derived on every load and never persisted.
**Depends on**: Phase 1
**Requirements**: IO-01
**Success Criteria** (what must be TRUE):

  1. Parsing a real fixture yields the correct save version, character summary (name, gamemode, GP, Slayer Coins, total level), the full bank item list with quantities, and every skill's XP + Level + LevelCap.
  2. The Bank wallet int64 is located and marked authoritative for currency, while the SaveHeader GP/Slayer Coins are marked read-only mirrors that are never the write target.
  3. Item-stack and skill matches are region-scoped and context-validated (7-bit length prefix equals the ID byte length; quantity/level in sane ranges); an ambiguous "unique" match is surfaced, never auto-picked.
  4. Re-parsing the same buffer produces identical offsets, and offsets exist only in the FieldTable — the JSON view model contains no byte offsets.
  5. Malformed or oversized length prefixes and entity counts are bounds-checked (no out-of-bounds read or giant allocation), and an unknown save version warns-but-parses rather than hard-failing.

**Plans**: 5/5 plans complete
Plans:

- [x] 02-01-PLAN.md — FieldTable model + offset-free ViewModel contract + test harness (fixture + no-offset scanner)
- [x] 02-02-PLAN.md — Structural component-walk spine: version → SaveHeader → entity/component walk + SC-5 bounds + version tolerance + delta-0 integrity
- [x] 02-03-PLAN.md — Wallet parser (currency-by-ID, authoritative) + Experience parser (XP/Cap/Level, context-validated)
- [x] 02-04-PLAN.md — Bank Inventory bounded marker-search (689 stacks) + SC-3 context-validation + D-03 ambiguity surfacing
- [x] 02-05-PLAN.md — parseSave orchestrator: wire spine + region parsers → FieldTable + derived offset-free ViewModel + SC-4 determinism

### Phase 3: Patcher + Validation + XP Table

**Goal**: A same-width patch engine applies GP, item-quantity, and skill edits onto a buffer copy, validates every value against type/range before writing, keeps skill XP and Level consistent via a verified StandardExperienceTable, and re-parses to prove nothing else moved.
**Depends on**: Phase 2
**Requirements**: SAFE-01, EDIT-04
**Success Criteria** (what must be TRUE):

  1. The patcher writes each field at its declared width (int64 GP = 8B, int32 quantity = 4B, double XP = 8B, int32 Level = 4B); a width-changing or out-of-range write is rejected, and `output.length === input.length` holds after every patch.
  2. Value validation rejects out-of-range edits before writing — int32 ≤ 2,147,483,647 and ≥ 0, int64 currency within range, Level 1..LevelCap, finite non-negative XP. [SAFE-01]
  3. Given a target Level, the engine computes XP from the StandardExperienceTable (scaling=0.25, exponent_scaling=300.0, base=2^(1/7)) matching spec milestones (L50=101,331; L99=13,034,427; L120=104,273,162) and writes XP and Level consistently with LevelCap unchanged. [EDIT-04]
  4. After applying an edit, a re-parse of the patched buffer confirms only the intended byte ranges changed — a decompressed diff shows exactly the edited fields and nothing else.

**Plans**: 2/2 plans complete
Plans:

- [x] 03-01-PLAN.md — StandardExperienceTable (Level↔XP, verified milestones L50/L99/L120) [EDIT-04]
- [x] 03-02-PLAN.md — patchSave engine: resolve→validate(collect-all)→same-width write→self-verify diff/re-parse [SAFE-01, EDIT-04]

### Phase 4: Electron Shell + Secure IPC + Non-Destructive Write

**Goal**: A secure Electron main process hosts the core and owns all fs/Brotli/offsets, exposing a narrow IPC bridge that loads a save and writes edits to a NEW file — raw bytes and offsets never crossing to the renderer, the original never overwritten.
**Depends on**: Phase 3
**Requirements**: IO-02
**Success Criteria** (what must be TRUE):

  1. The renderer runs with `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, and has no `fs`/Brotli access; all file I/O and binary parsing happen in the main process.
  2. The preload exposes only narrow, purpose-specific IPC methods (load / getModel / preview / write); raw buffers and offsets never cross the bridge, and int64 values are serialized as strings.
  3. Writing edits produces a new Brotli-recompressed `.sav` at a distinct output path while the source file stays byte-unchanged, and the write path re-parses and asserts the length invariant before recompressing. [IO-02]
  4. main re-resolves edit intents against its own freshly-parsed FieldTable and re-validates before patching; malformed or unexpected IPC arguments are rejected rather than trusted.

**Plans**: 5/5 plans complete
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Dependency install (electron@43 + esbuild) behind a blocking least-privilege supply-chain checkpoint
- [x] 04-02-PLAN.md — IPC boundary guards: IpcArgError shape guard + int64 string↔bigint bridge + offset-stripping wire report (SC-4)
- [x] 04-03-PLAN.md — Session store (single active session, D-02) + non-destructive write-service (length gate + source-path guard) [IO-02]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-04-PLAN.md — Renderer-side shell: narrow contextBridge preload + CSP-locked smoke-test renderer + tsconfig include

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-05-PLAN.md — Main-process wiring (hardened window + 4 handlers + error mapping) + esbuild build + manual UAT [IO-02]

### Phase 5: Renderer UI — Browse, Search, Edit, Preview

**Goal**: The user-facing loop — load a save, read the summary, browse and search bank items and skills, edit values with inline validation and XP-table-aware level input, then preview and confirm pending changes before a non-destructive write.
**Depends on**: Phase 4
**Requirements**: BROWSE-01, BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05, EDIT-01, EDIT-02, EDIT-03, SAFE-02
**Success Criteria** (what must be TRUE):

  1. The user opens a `.sav` and sees a read-only summary: character name, gamemode, GP, Slayer Coins, and total level. [BROWSE-01]
  2. The user browses a virtualized list of all bank items with quantities and a list of all skills with XP + Level, each filterable as-you-type by ID. [BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05]
  3. The user edits GP/Slayer Coins (written to the Bank wallet, not the cosmetic header snapshot), a bank item's quantity, and a skill's XP or a target Level, with invalid values flagged inline before any write. [EDIT-01, EDIT-02, EDIT-03]
  4. The user reviews a pending-changes preview (field, old → new) and must explicitly confirm before any write occurs. [SAFE-02]
  5. Confirming writes a new `.sav`, shows the output path, and the edited save loads in-game with the new values persisting after an in-game re-save (mandatory manual in-game acceptance).

**Plans**: 6/8 plans executed
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Offset-free bank item addressing (fieldKey) so the renderer can edit duplicate-itemId quantities [EDIT-02]
- [x] 05-02-PLAN.md — esbuild React deltas (jsx/iife/NODE_ENV) + type-only IPC results contract + preload/index.html/ui tsconfig [BROWSE-01, SAFE-02]
- [x] 05-03-PLAN.md — Pure client lib + Wave 0 tests: validation mirror, filter predicate, level→XP/int64 format [EDIT-01/02/03, BROWSE-04/05]
- [x] 05-04-PLAN.md — Pure state + Wave 0 tests: reducer accumulator (D-02) + selectors + Pitfall 5 mutual exclusion [SAFE-02, EDIT-03]

**Wave 2** *(depends on Wave 1)*

- [x] 05-05-PLAN.md — Shared primitives: token stylesheet + VirtualList (32px) + EditableCell [BROWSE-02/03, EDIT-02]

**Wave 3** *(depends on Wave 2)*

- [x] 05-06-PLAN.md — SummaryBar (BROWSE-01, click-to-edit int64 D-06) + BankPanel (BROWSE-02/04, EDIT-02)
- [ ] 05-07-PLAN.md — SkillPanel (BROWSE-03/05, EDIT-03, D-03) + PreviewModal (SAFE-02) + Banner

**Wave 4** *(depends on Wave 3)*

- [ ] 05-08-PLAN.md — App orchestrator + renderer.tsx mount + full build + manual in-game acceptance (criterion 5)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Binary Primitives + Brotli Codec | 3/3 | Complete    | 2026-07-03 |
| 2. Format Parser + FieldTable Model | 5/5 | Complete    | 2026-07-04 |
| 3. Patcher + Validation + XP Table | 2/2 | Complete    | 2026-07-04 |
| 4. Electron Shell + Secure IPC + Non-Destructive Write | 5/5 | Complete    | 2026-07-04 |
| 5. Renderer UI — Browse, Search, Edit, Preview | 6/8 | In Progress|  |
