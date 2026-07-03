# MV2 Save Editor

## What This Is

A local desktop application for browsing and editing Melvor Idle 2 (MV2) save files (`.sav`).
It replaces the current workflow of hand-editing save files through the Claude web interface with
a purpose-built UI: load a save, browse its current contents, edit values with validation, preview
the changes, and write out a valid save file. Built for a solo early-access tester who edits saves
frequently to exercise game functionality.

## Core Value

Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the
editor must always produce a `.sav` the game can load without corruption.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Load a `.sav` file: decompress (Brotli) and parse the documented binary layout
- [ ] Display a character/save summary (name, gamemode, GP, Slayer Coins, total level)
- [ ] Browse a searchable list of bank items with their current quantities
- [ ] Browse a searchable list of skills with their current XP and level
- [ ] Edit GP and Slayer Coins (int64, in-place)
- [ ] Edit bank item quantities (int32, in-place)
- [ ] Edit skill XP and Level (double / int32, in-place, consistent with the XP table)
- [ ] Validate edited values against type/range limits before writing
- [ ] Preview/confirm a summary of pending changes before writing
- [ ] Write a valid `.sav` (Brotli-recompressed) to a new output file, leaving the original untouched

### Out of Scope

- Adding brand-new items/entities not already present in the save — requires byte insertion and
  region-size-prefix rewrites; deferred, not core to v1
- Editing header/character info (name, gamemode, total level) — deferred to a later milestone;
  not forbidden, just not v1
- Encryption/anti-cheat handling — the save format is Brotli-compressed but not encrypted
- Multi-user, cloud sync, or distribution/packaging for other users — personal tool for one tester

## Context

- The complete save format is already reverse-engineered and documented in
  `docs/current-skill.md`: Brotli-compressed .NET `BinaryReader`/`BinaryWriter` little-endian binary,
  no encryption. That doc is the authoritative spec for parsing/writing.
- Known primitives: int32/int64/double LE, 1-byte bool, 7-bit length-prefixed UTF-8 strings.
- File layout: `[int32 version][SaveHeader][entity list][ActionManager][RNG][favourites][EventLog]`.
- GP is int64 in the Bank entity's Wallet (the SaveHeader GP/SlayerCoins are cosmetic snapshots that
  refresh on next in-game save — only patch the wallet).
- Bank item stack format: `[int32 qty][bool placeholder][bool locked][string itemID]`.
- Skill `ExperienceComponent`: `[double XP][int32 LevelCap][int32 Level]`; XP and Level both stored
  and must be set consistently. XP table: `scaling=0.25, exponent_scaling=300.0, base=2^(1/7)`.
- Save version 17 = Alpha 0.9.1; version checks should be tolerant of format bumps.
- Lessons already learned: always re-parse offsets fresh from the uploaded file (never reuse offsets
  across sessions); in-place same-width edits don't require region-size updates.
- Node has native Brotli (`zlib.brotliDecompressSync`/`brotliCompressSync`), so no external
  decompression dependency is required. Existing repo is a Node/CommonJS `package.json` scaffold.

## Constraints

- **Platform**: Local desktop app — Why: user wants a native file open/save feel; runs entirely
  on their machine, no server, no upload.
- **Tech stack**: Lean toward Electron + TypeScript (Node backend for Brotli + binary parsing) —
  Why: Node's built-in Brotli and the existing Node scaffold minimize dependencies; research to
  confirm framework (Electron vs Tauri) before committing.
- **Editing model**: In-place, same-byte-width edits only for v1 — Why: avoids region-size-prefix
  rewrites and byte insertion, which are the main corruption risk.
- **Safety**: Validate ranges + re-parse offsets fresh on each load; preview changes before write;
  write to a new file rather than overwriting the original — Why: a corrupted save is the worst
  outcome; non-destructive writes make mistakes recoverable.
- **Correctness**: Output `.sav` must round-trip and load in-game — Why: this is the core value.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desktop app (not browser/CLI) | Native file open/save feel for a personal tool | — Pending |
| In-place edits only for v1 | Avoids byte insertion + region-size rewrites (corruption risk) | — Pending |
| Browse loaded save (searchable lists) over targeted-only editor | Much easier to find and edit values; worth the extra build | — Pending |
| Non-destructive write to new file + validate + preview | Corrupted saves are the worst failure; keep mistakes recoverable | — Pending |
| Lean Electron + TypeScript (research to confirm) | Native Brotli in Node + existing Node scaffold | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-03 after initialization*
