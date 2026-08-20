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

## Latest Milestone: v1.1 Packaging & Distribution — ✅ SHIPPED 2026-08-20

**Goal (achieved):** Produce a downloadable, self-updating Windows installer for the MV2 Save Editor, published
automatically to GitHub Releases.

**Delivered:**
- electron-builder packaging → Windows NSIS installer (`.exe`), consuming the existing esbuild output
- electron-updater wired into the main process → app checks GitHub Releases on launch and self-updates
- GitHub Actions workflow → builds on `v*` tag push and publishes the installer + `latest.yml` + `.blockmap` to a draft GitHub Release
- Distribution metadata (appId, product name, icon, publish config pointing at `jmptr/mv2-save-editor`)
- Shipped **unsigned** for v1.1 (SmartScreen "unknown publisher" prompts accepted)
- Proven end-to-end: live v1.1.0 → v1.1.1 two-release self-update (SC4)

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

### Validated (v1.1)

- ✓ Package the app into a Windows NSIS installer via electron-builder — per-user `.exe` produced (`MV2 Save Editor Setup 1.1.0.exe`), installed app runs the full editor loop — Phase 6 (PKG-01..04)
- ✓ Self-update from GitHub Releases via electron-updater — packaged app runs one guarded launch check (inert in dev via `app.isPackaged`); electron-updater ships unpruned inside `app.asar`, kept esbuild-`external` — Phase 7 (UPD-01..03)
- ✓ Build and publish the installer automatically from GitHub Actions on a `v*` tag push (windows-latest, build-before-package, draft → manual publish), proven end-to-end by a live v1.1.0 → v1.1.1 two-release self-update (SC4) — Phase 8 (CI-01..03)

### Active

- None — v1.1 shipped. Next milestone not yet defined (`/gsd-new-milestone`).

Candidate directions still deferred from the v1 requirements' v2 list: human-readable item/skill names (NAME-01), bulk edits (BULK-01/02), timestamped output + round-trip self-check on load (OUT-01/02), header/character editing (HEADER-01). Distribution v2 items: macOS/Linux packaging (DIST-01/02), code signing (DIST-03), in-app update UX (UPDUX-01..04).

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
| Updater seam kept dev-inert via lazy `require` behind `app.isPackaged` | A top-level import would load electron-updater in dev; the module must be unloadable when unpackaged (UPD-03) | ✓ Proven — Phase 7; `main.ts` lazy-requires `./updater` only inside the guard, `updater.ts` lazy-requires electron/electron-updater inside `initAutoUpdater()`; static-asserted + Windows runtime-confirmed |
| electron-updater as a runtime `dependency` + esbuild `external` | devDeps are pruned from `app.asar`; bundling breaks its dynamic requires / `app-update.yml` path resolution | ✓ Proven — Phase 7; `npx asar list` confirmed it unpruned in the packaged asar, `dist/main.js` keeps one literal `require("electron-updater")` |
| Release CI: `v*` tag → windows-latest, build-before-package, `--publish onTagOrDraft` (default draft), `contents: write` + `GH_TOKEN` | Mirror the proven local package chain; least-privilege token; human publishes the draft (CI-03 gate) | ✓ Proven — Phase 8; two real tag pushes ran green and published draft Releases with `.exe`+`latest.yml`+`.blockmap` |
| Pre-create the draft Release (`gh release create --draft`) before electron-builder | electron-builder races into DUPLICATE drafts on a first publish (no release exists yet), splitting assets | ✓ Good — Phase 8; surfaced live at v1.1.0, fixed, v1.1.1 produced one clean draft |
| Repository made **public** for auto-update | electron-updater reads `releases.atom` unauthenticated → 404 on a private repo (the observed HttpError) | ⚠️ Revisit — required for GitHub-Releases auto-update; if the repo ever returns to private, auto-update breaks (or embed a token, a leak risk) |
| Version=Tag invariant via lockstep bump | electron-builder derives the release from `package.json.version`, not the git ref; a lone bump breaks the coupled test literal | ✓ Proven — Phase 8; 1.1.0→1.1.1 bump across package.json + lockfile + both test sites, suite green |

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

**Shipped:** v1.1 Packaging & Distribution (2026-08-20) — 3 phases, 8 plans, all 10 v1.1 requirements validated. The MV2 Save Editor is now a downloadable, self-updating Windows app: `npm run package` (and CI on a `v*` tag) produces a per-user NSIS installer via electron-builder wrapping the existing `dist/`; the installed app runs the full editor loop; and it self-updates from GitHub Releases. Proven **end-to-end** by SC4 — an installed v1.1.0 client detected, downloaded, applied, and relaunched as a published v1.1.1. The release pipeline is a `v*` tag → windows-latest build → draft GitHub Release (`.exe`+`latest.yml`+`.blockmap`) → manual publish. Two real-world issues were caught only by the live two-release gate and fixed: electron-builder's duplicate-draft race (pre-create-draft step) and the private-repo auto-update blocker (repo made public — electron-updater reads `releases.atom` unauthenticated). Suite 300/300 green, typecheck clean. Shipped unsigned (SmartScreen click-through accepted).

## Next Milestone Goals

**No milestone active — v1.1 shipped.** Define the next with `/gsd-new-milestone`. Candidate directions:

- **Editing features (v2 from the v1 list):** human-readable item/skill names (NAME-01), bulk edits (BULK-01/02), timestamped output + load-time round-trip self-check (OUT-01/02), header/character editing (HEADER-01).
- **Distribution (v2):** macOS/Linux packaging (DIST-01/02), code signing to defeat SmartScreen/Gatekeeper (DIST-03).
- **Update UX (v1.x):** in-app progress + release notes, a manual "check for updates" item, restart-now prompt (UPDUX-01..04).

Carried-forward tech debt from v1.1 (see v1.1-MILESTONE-AUDIT.md): re-add a v1.1.0 `.blockmap`; the spaced-vs-hyphenated installer-name test cosmetic; a clean draft-invisibility micro-proof; and the standing constraint that auto-update needs the repo to stay public.

---
*Last updated: 2026-08-20 — after v1.1 milestone (Packaging & Distribution) shipped*
