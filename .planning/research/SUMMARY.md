# Project Research Summary

**Project:** MV2 Save Editor
**Domain:** Local desktop binary save-file editor (Brotli-compressed .NET `BinaryReader`/`BinaryWriter`, Melvor Idle 2 `.sav`)
**Researched:** 2026-07-03
**Confidence:** HIGH

## Executive Summary

This is a single-user desktop tool that browses and edits a Brotli-compressed, .NET-binary game save. Experts build this class of tool as a **binary/offline editor** (the No Man's Sky / ETS2 family, not the JSON-tree family): the value of the product is *not corrupting the file* and *helping the user find the right bytes*. Because the save format is already fully reverse-engineered in `docs/current-skill.md` (exact offsets, primitives, and XP table), the build is far less about discovery and far more about disciplined, testable execution against a known spec.

The research converges hard on one stack and one architecture. **Electron + TypeScript + React + Vite (electron-vite)** wins decisively because the entire hot path — Brotli (via Node's built-in `zlib`) and .NET binary read/write (via Node `Buffer` LE methods, with `BigInt` for int64) — runs in Electron's Node main process with **zero external dependencies**. Tauri's advantages (small bundle, sandbox) all target distribution and untrusted input, which are explicitly out of scope here; its one cost (no Node Brotli/`Buffer` on the critical path) is exactly what this app does all day. The recommended design is a **three-layer split**: a *pure TS format core* (no Electron/fs/DOM, unit-tested with golden-file round-trips), a *trusted main process* that owns bytes/Brotli/fs, and an *untrusted renderer* that only sees a JSON view model and emits `{fieldId, newValue}` intents. The governing rule — **raw bytes and offsets never leave the main process** — simultaneously enforces Electron security and the project's hard-won "never reuse stale offsets" lesson (the renderer physically cannot cache an offset it never receives).

The risk profile is unusually well-mapped, and every top risk is a *silent-corruption* risk. The five that must shape the roadmap: (1) editing the **cosmetic SaveHeader GP** instead of the authoritative **Bank wallet** int64 (a silent no-op); (2) **wrong-width writes** (int32 vs int64 vs double); (3) **false-positive offset matches** from unscoped byte-search; (4) **XP/Level inconsistency** against the XP table; and (5) **byte-length desync** breaking the "in-place same-width" invariant. Mitigation is a layered verification ladder — length invariant -> decompressed-diff round-trip -> field read-back -> **mandatory manual in-game load** — anchored by a committed corpus of real `.sav` fixtures. The single highest-leverage move is to build and byte-exactly test the pure core *before* any Electron shell exists.

## Key Findings

### Recommended Stack

Electron is the confident choice (see STACK.md for the full Electron-vs-Tauri decision matrix). The core parse/patch/recompress pipeline needs no npm dependencies — Brotli and binary I/O are Node built-ins. The editing engine should be **hand-rolled**, not a schema library: v1's model is "parse to find offsets, then patch same-width bytes in place," not "deserialize-to-object then re-serialize" (which would risk byte-exact reproduction of untouched .NET regions). Beyond the framework, v1 realistically needs only `@tanstack/react-virtual` for list virtualization; Zod is optional for declarative field validation.

**Core technologies:**
- **Electron 43.x** — desktop shell; main process is real Node.js -> native Brotli + `Buffer` binary ops with zero deps.
- **TypeScript 5.9.x** — model each binary field as `{offset, kind, value, min, max}` so the compiler catches width/type mistakes before they corrupt a save.
- **electron-vite 5.x / Vite 7.x** — one config for main/preload/renderer; fast HMR (developer velocity is the stated goal).
- **React 19.x** — best virtualization + controlled-form ecosystem for searchable lists and validated inputs.
- **Node `zlib` (Brotli) + `Buffer`/`BigInt`** — built-in; `readBigInt64LE`/`writeBigInt64LE` for GP/Slayer Coins to avoid 2^53 precision loss.
- **Vitest 4.1.x** — Vite-native; runs byte-level round-trip fixture tests headless.

### Expected Features

This is a mature, well-understood tool category (FEATURES.md). "Safety is the product": non-destructive writes, validation, and a visible preview/diff are universal. The dominant user frustration is *finding the value to edit* among hundreds of items — which is why search/filter is effectively table stakes rather than a nicety for v1.

**Must have (table stakes):**
- Load `.sav` (Brotli decompress + parse layout) — the entry point for everything.
- Read-only save summary (name, gamemode, GP, SC, total level) — orientation/confirmation.
- Browse bank items (qty) and skills (XP + Level), each **searchable** — can't edit what you can't find.
- Edit GP/SC (int64), item qty (int32), skill XP+Level (double/int32), all **in-place, same-width**.
- Range/type validation, pending-changes preview/confirm, non-destructive write to a **new** `.sav`, round-trip correctness.

**Should have (competitive):**
- XP-table-aware level setting (type a level -> auto-compute consistent XP) — *prevents* the classic skill-edit corruption.
- Human-readable item names via bundled catalog (with prettified-ID fallback).
- Bulk edits on the filtered set (each still validated); auto-named/backup outputs; round-trip self-check warning on load.

**Defer (v2+):**
- Adding brand-new items/entities (byte insertion + region-size rewrites — the single largest corruption risk).
- Editing header/character info (name, gamemode) — interacts with in-game validation.
- Editing other entities (Shop, Farming, Quests); full hex/tree editor; live memory patching.

### Architecture Approach

A **three-layer split** with a strict boundary: `core/` (pure TS format engine, zero Electron deps, golden-file tested) -> `main/` (the *only* place bytes and offsets exist: fs, Brotli, the authoritative FieldTable) -> `renderer/` (UI only, sees a JSON view model, sends `{fieldId, newValue}` intents through a narrow `contextBridge`). Parsing produces a flat `FieldTable: Map<FieldId, FieldDescriptor>`; edits are id+value intents that the main process re-resolves, re-validates, and applies same-width onto a *copy* of the buffer, then re-parses and asserts length invariance before recompressing to a new file.

**Major components:**
1. **BinaryReader/Writer** — LE primitives + 7-bit-length UTF-8 string; cursor tracking over `Buffer`.
2. **Parser + FieldTable/Model** — walk `[version][SaveHeader][entities]`, extract fresh-offset field descriptors, derive the JSON view model.
3. **Patcher + Validation** — same-width writes by construction; value rules (range/XP-table) + structural (length-invariant re-parse).
4. **Main/IPC host + Preload bridge** — Brotli/fs, session cache, ~4 narrow IPC methods.
5. **Renderer** — Summary / Bank / Skills browsers + Preview/Confirm; holds no bytes or offsets.

### Critical Pitfalls

1. **Cosmetic header GP vs. authoritative Bank wallet** — treat header GP/SC as read-only display; write currency only to the Bank wallet int64. Verify with an in-game load that persists after re-save.
2. **Wrong-width writes (int32/int64/double)** — width is a property of the *field*, not the value; assert `bytesWritten === field.width`. Foundational, in the binary-primitives layer.
3. **False-positive offset matches from raw byte-search** — scope every search to the correct entity region; validate the 7-bit length prefix and surrounding-field ranges; refuse to auto-pick on ambiguity.
4. **XP/Level inconsistency** — always set both, derived from the same XP table; unit-test the table against spec milestones (L50/L99/L120).
5. **Byte-length desync ("in-place" that isn't)** — enforce `output.length === input.length` as a hard gate before recompression; never splice or re-serialize a region in v1.

Cross-cutting: **only-self-parse verification is not enough** — a manual in-game load is mandatory acceptance for any edit phase; and **Electron security baseline** (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, no renderer `fs`) must be set before feature work.

## Implications for Roadmap

Based on research, the suggested phase structure follows the architecture's inside-out build order: the risk-bearing correctness work (pure core) is fully testable headless and must be proven byte-exact *before* any Electron plumbing. Steps 1-4 below map to the ARCHITECTURE.md "Suggested Build Order"; the pitfalls dictate the acceptance gates.

### Phase 1: Binary Primitives + Brotli Codec (pure core)
**Rationale:** Everything downstream depends on correct LE primitives, the 7-bit varint string reader, and a game-compatible Brotli round-trip. This is the foundational risk layer and is fully unit-testable with no Electron.
**Delivers:** `core/binary` reader/writer (int32/int64-BigInt/double/bool/7-bit string) + `codec` wrappers; `compress(decompress(x))` round-trip proven against real-save fixtures.
**Addresses:** Load & decode foundation (FEATURES table stakes).
**Avoids:** Pitfalls 2 (wrong-width), 7 (varint/endianness), 8 (Brotli round-trip). Establishes the golden no-op decompressed round-trip test.

### Phase 2: Format Parser + FieldTable Model
**Rationale:** With primitives proven, walk the documented layout and extract fresh-offset field descriptors. Depends only on Phase 1.
**Delivers:** `core/format` (header, entities, bank, skills, wallet) -> `FieldTable` + JSON view-model builder; golden-file parse->patch->re-parse fixtures.
**Uses:** Hand-rolled `Buffer` reader (STACK.md); FieldDescriptor pattern (ARCHITECTURE.md).
**Implements:** Parser + Model components.
**Avoids:** Pitfalls 1 (encode wallet-as-authoritative / header-as-mirror), 3 (region-scoped, context-validated matching), 6 (fresh offsets, never persisted).

### Phase 3: Patcher + Validation + XP Table
**Rationale:** The safe write engine — same-width patcher plus value and structural validators — sits on top of the model and is the last purely-headless correctness milestone.
**Delivers:** `core/model/patcher`, `core/validation` (value rules + length-invariant structural check), verified `xp-table`.
**Implements:** Patcher + Validation components.
**Avoids:** Pitfalls 2, 4 (XP/Level consistency, table tested against milestones), 5 (`output.length === input.length` gate).

### Phase 4: Electron Shell + Secure IPC (main/preload)
**Rationale:** Only after a byte-exact core exists do we add the trusted host. Security posture must be set here, before any UI, per PITFALLS.
**Delivers:** `main/` (codec/fs-io/session/ipc-handlers), `preload/` narrow `contextBridge`, `shared/ipc-contract`; load/preview/write handlers with sender+arg validation; non-destructive new-file write.
**Uses:** Electron 43 + electron-vite; Node `zlib`/`fs` in main.
**Avoids:** Pitfalls 10 (destructive write), 11 (renderer fs / broad bridge).

### Phase 5: Renderer UI — Browse, Search, Edit, Preview
**Rationale:** Standard Electron/React plumbing over a de-risked backend. Delivers the user-facing v1 loop.
**Delivers:** Summary (read-only), Bank + Skill browsers with virtualized searchable lists, inline validation, XP-table-aware level input, Preview/Confirm dialog, write trigger.
**Uses:** React 19 + `@tanstack/react-virtual`.
**Addresses:** All remaining v1 table-stakes + search/filter differentiators (FEATURES.md).
**Avoids:** UX pitfalls (silent no-op "success", no preview, ambiguous auto-pick).

### Phase 6 (v1.x, optional): QoL — Catalog Names, Bulk Edits, Backups
**Rationale:** Add after the core loop is validated in-game; each is triggered by observed friction, not required for launch.
**Delivers:** Bundled ID->name catalog (prettified-ID fallback), bulk edits on filtered set, timestamped/backup outputs, round-trip self-check warning on load.

### Phase Ordering Rationale

- **Inside-out build order:** the format core carries all the corruption risk and is testable in milliseconds without Electron; proving a byte-exact round-trip is the milestone that de-risks everything else. Phases 1-3 are the crown jewels; 4-5 are comparatively standard plumbing.
- **Dependency-driven:** primitives -> parser/model -> patcher/validation -> host -> UI is a strict chain from FEATURES and ARCHITECTURE dependency graphs. Search/filter and XP-table-aware editing sit naturally in the UI phase but depend on model + xp-table already existing.
- **Pitfall-gated acceptance:** the layered verification ladder (length invariant -> decompressed diff -> field read-back -> manual in-game load) is distributed across phases, with the in-game load as mandatory acceptance for any phase that writes bytes.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Parser/FieldTable):** the *only* area with real open questions — the exact Bank-wallet location (`Walleta` marker), robust entity-region boundary detection, and context-validation heuristics for item-stack matching need to be pinned against real fixtures. `docs/current-skill.md` is authoritative but the offset-walk edge cases (>=128-byte prefixes, tolerant version handling) warrant a focused pass.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Primitives/Codec):** Node `zlib`/`Buffer` APIs are stable and fully specified.
- **Phase 3 (Patcher/Validation/XP):** XP table formula is documented with test milestones; patcher is mechanical.
- **Phase 4 (Electron/IPC):** Electron security + contextBridge patterns are extensively documented (HIGH-confidence sources in ARCHITECTURE/PITFALLS).
- **Phase 5 (Renderer):** React + virtualization + controlled forms are well-trodden.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Electron-vs-Tauri grounded in this project's exact hot path; versions from current ecosystem signals (pin exact minors at install). |
| Features | HIGH | Mature tool category with stable conventions; scope directly grounded in the documented save format and PROJECT.md. |
| Architecture | HIGH | Three-layer split backed by official Electron security docs and the authoritative format spec; build order de-risks correctness first. |
| Pitfalls | HIGH | Format spec is internally authoritative and verified against real saves; generic .NET/Brotli/Electron facts cross-checked against docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact Bank-wallet offset & entity-region boundaries:** confirm against a real decompressed save during Phase 2; the `Walleta` marker and region-size prefixes must be located empirically, not assumed. Handle by building Phase 2 test-first against a committed fixture corpus.
- **Save-version tolerance:** version 17 = Alpha 0.9.1, but checks must be tolerant of bumps. Decide the "warn-but-parse" vs "refuse" policy during Phase 2 planning; pair with the round-trip self-check warning (Phase 6).
- **Item-name catalog source:** whether a bundled game-data ID->name map is available/complete is unknown; the prettified-ID fallback must ship regardless. Resolve when Phase 6 is scheduled.
- **Fixture corpus breadth:** need real `.sav` files across gamemodes, character-name lengths, and bank sizes to exercise the varint and region-walk edge cases. Assemble early (before Phase 2) so every core phase can test against them.
- **Exact dependency minors** (React 19 / Vite 7 / TS 5.9 / electron-vite 5): pin from `npm` at install time; low risk.

## Sources

### Primary (HIGH confidence)
- `docs/current-skill.md` (in-repo) — authoritative reverse-engineered MV2 save format: layout, primitives, offset math, XP table, lessons learned.
- `.planning/PROJECT.md` — v1 scope, constraints, safety requirements, key decisions.
- [Electron Security / Context Isolation / Sandbox / contextBridge docs](https://www.electronjs.org/docs/latest/tutorial/security) — secure webPreferences baseline, narrow IPC.
- Node.js `zlib` (Brotli) + `Buffer` LE read/write APIs — built-in; Brotli defaults (quality 6, window 20) are RFC-7932-compliant and .NET-readable.
- [electron-vite](https://electron-vite.org/), [Electron releases](https://releases.electronjs.org/) (43.x), [Vitest](https://vitest.dev/) (4.1.x), [@tanstack/react-virtual](https://www.npmjs.com/package/@tanstack/react-virtual) (3.14.x).

### Secondary (MEDIUM confidence)
- [No Man's Sky Save Editor](https://github.com/goatfungus/nmssaveeditor), [ETS2 Save-Edit-Tool](https://github.com/xLieferant/Save-Edit-Tool), [readzoner save-editor guide](https://readzoner.com/game-save-editor/) — binary-editor conventions (non-destructive, show-only-changed, bundled name catalogs).
- [Melvor Idle wiki / community editors](https://wiki.melvoridle.com/w/In-game_Functions) — the in-game workflows this tool replaces.
- [brotli-wasm / RFC 7932 interop notes](https://github.com/httptoolkit/brotli-wasm) — standard-compliant Brotli is cross-decompressible; large-window is non-standard.

### Tertiary (LOW confidence)
- Exact npm minor versions for React 19 / Vite 7 / TS 5.9 — inferred from ecosystem compatibility signals; validate at install time.

---
*Research completed: 2026-07-03*
*Ready for roadmap: yes*
