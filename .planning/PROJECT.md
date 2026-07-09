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

## Current Milestone: v1.1 Packaging & Distribution

**Goal:** Produce a downloadable, self-updating Windows installer for the MV2 Save Editor, published
automatically to GitHub Releases.

**Target features:**
- electron-builder packaging → Windows NSIS installer (`.exe`), consuming the existing esbuild output
- electron-updater wired into the main process → app checks GitHub Releases on launch and self-updates
- GitHub Actions workflow → builds on version-tag push and uploads the installer + `latest.yml` to the
  GitHub Release automatically
- Distribution metadata (appId, product name, icon, publish config pointing at `jmptr/mv2-save-editor`)
- Shipped **unsigned** for v1.1 (SmartScreen "unknown publisher" prompts accepted)

## Requirements

### Validated (v1.0)

- ✓ Load a `.sav` file: decompress (Brotli) and parse the documented binary layout, offsets fresh every load — v1.0 (IO-01)
- ✓ Write a valid `.sav` (Brotli-recompressed) to a new output file, leaving the original untouched — v1.0 (IO-02)
- ✓ No-op load→save is byte-identical (decompressed) and every write enforces `output.length === input.length` — v1.0 (IO-03)
- ✓ Display a character/save summary (name, gamemode, GP, Slayer Coins, total level) — v1.0 (BROWSE-01)
- ✓ Browse a searchable list of bank items with their current quantities — v1.0 (BROWSE-02, BROWSE-04)
- ✓ Browse a searchable list of skills with their current XP and level — v1.0 (BROWSE-03, BROWSE-05)
- ✓ Edit GP and Slayer Coins (int64, in the Bank wallet, in-place) — v1.0 (EDIT-01)
- ✓ Edit bank item quantities (int32, in-place) — v1.0 (EDIT-02)
- ✓ Edit skill XP and Level (double / int32, in-place, consistent with the XP table) — v1.0 (EDIT-03), engine from Phase 3 surfaced in the Phase 5 UI
- ✓ Set a skill by target Level; auto-compute XP from the StandardExperienceTable — v1.0 (EDIT-04)
- ✓ Validate edited values against type/range limits before writing (reject-never-clamp, all violations collected) — v1.0 (SAFE-01)
- ✓ Preview/confirm a summary of pending changes before writing — v1.0 (SAFE-02)

### Active (v1.1 Packaging & Distribution)

- Package the app into a Windows NSIS installer via electron-builder — see `.planning/REQUIREMENTS.md` (PKG-*)
- Self-update from GitHub Releases via electron-updater (UPD-*)
- Build and publish installers automatically from GitHub Actions on version-tag push (CI-*)

Candidate directions still deferred from the v1 requirements' v2 list (not in this milestone): human-readable item/skill names (NAME-01), bulk edits (BULK-01/02), timestamped output + round-trip self-check on load (OUT-01/02), header/character editing (HEADER-01).

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
| Desktop app (not browser/CLI) | Native file open/save feel for a personal tool | ✓ Good — Electron app ships native OS open/save dialogs; used daily |
| In-place edits only for v1 | Avoids byte insertion + region-size rewrites (corruption risk) | ✓ Proven — Phase 3 patcher does same-width writes (output.length === input.length) with a re-parse self-verify; held across v1.0 |
| Browse loaded save (searchable lists) over targeted-only editor | Much easier to find and edit values; worth the extra build | ✓ Good — Phase 5 virtualized, filter-as-you-type bank + skill lists |
| Non-destructive write to new file + validate + preview | Corrupted saves are the worst failure; keep mistakes recoverable | ✓ Proven end-to-end — Phase 3 reject-before-write + Phase 4 new-file write (source byte-unchanged) + Phase 5 SAFE-02 confirm gate |
| Lean Electron + TypeScript (research to confirm) | Native Brotli in Node + existing Node scaffold | ✓ Good — Electron 43 main process; `node:zlib` Brotli + `Buffer` LE, zero binary-format deps |
| Bank Inventory: explicit tab-walk over loose marker-search | Marker-search leaked phantom stacks from the trailing "Chests" registry → editing one reverted the whole bank in-game | ✓ Good — post-v1.0 fix (b4ac6c4); structural walk makes phantoms impossible, confirmed in-game |

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

## Current State

**Shipped:** v1.0 MVP (2026-07-05) — 5 phases, 23 plans, all 14 v1 requirements validated.

The complete load→browse/search→edit→preview→write loop works end-to-end: an app-written `.sav` loads in Melvor Idle 2 with edits persisting. Tech stack: Electron 43 + TypeScript (strict), React 19 renderer, `@tanstack/react-virtual` lists, `node:zlib` Brotli + `Buffer` LE primitives (int64 as BigInt), esbuild build, `tsx --test` + c8. ~4,500 LOC source (src/ + electron/), ~4,200 LOC tests; suite 272/272 green, format-core modules at 100% line+branch coverage.

**Known post-ship work:** the phantom-stack bank-corruption bug (surfaced at v1.0 in-game acceptance) is fixed and confirmed (b4ac6c4). Blind spot: the Inventory tab-walk is only proven against 2-tab saves — 3+ tab saves would fail-loud (throw) rather than misparse, which is safe.

## Next Milestone Goals

**Active:** v1.1 Packaging & Distribution — Windows NSIS installer via electron-builder, electron-updater
self-update from GitHub Releases, and a GitHub Actions publish-on-tag workflow (unsigned for v1.1).

Still deferred beyond v1.1 (from the v2 list): human-readable item/skill names (NAME-01), bulk edits
(BULK-01/02), timestamped output + load-time round-trip self-check (OUT-01/02), header/character
editing (HEADER-01). macOS/Linux packaging and code signing are also deferred.

---
*Last updated: 2026-07-09 — v1.1 Packaging & Distribution milestone started (Windows installer + auto-update + CI publish)*
