# Milestones

## v1.0 MVP (Shipped: 2026-07-06)

**Phases completed:** 5 phases, 23 plans, 44 tasks

**Key accomplishments:**

- Full-strict TypeScript toolchain (tsx + tsc + c8 + @types/node) stood up green, real .sav fixture committed to test/fixtures/, supply-chain gate T-1-SC pre-approved — Wave 1 can now write src/ + test/ against a working strict TS setup.
- Brotli codec (compress/decompress/roundTrip) with IO-03 byte-identical round-trip + length invariant on the real .sav, defensive large-window rejection (T-1-05), and 256 MiB decompression-bomb cap (T-1-03) — 100% line+branch coverage gated under strict TS.
- Little-endian BinaryReader + BinaryWriter mirroring .NET BinaryReader/BinaryWriter — int32/int64(BigInt)/double/bool/7-bit-length-prefixed UTF-8 strings — round-tripped across the full D-14 edge matrix and real D-12 fixture slices, with LE-only surface (SC-4), 7-bit-overflow (T-1-02) and OOB (T-1-04) guards, at 100% line+branch coverage under strict TS.
- FieldEntry discriminated union (int64 → bigint, T-02-06) + FieldTable container with D-03 candidate model (resolve-one / candidates-when-many / fail-loud-when-zero) + offset-free ViewModel type (SC-4 by construction) + assertNoOffsets runtime guard + shared fixture harness — 100% line+branch coverage under strict TS, zero new deps.
- Deterministic framed walk (version → SaveHeader → 33-entity list → per-entity component list) over the Phase 1 BinaryReader, emitting SC-2 readOnly-mirror FieldEntries + opaque entity spans, with SC-5 count-pre-check bounds guards, BinaryReader RangeError propagation, and version tolerance — delta-0 on all 33 entities, 100% coverage under strict TS, zero new deps.
- Wallet parser (currency-by-ID bigint, GP/SlayerCoins authoritative, D-03 fail-loud on missing GoldPieces) + Experience parser (XP/Cap/Level distinct offsets, readOnly cap per Pitfall 5, SC-3 context-validated fail-loud) — both pure functions over the BinaryReader at the component dataStart boundaries 02-02 locates, 100% coverage on all metrics, zero new deps.
- Bounded marker-search recovering ALL 689 Bank Inventory item stacks across every tab (not ~296 — a contiguous walk stops at the first tab boundary), with SC-3 context-validation (prefix/qty/boolean-range false-match guards), SC-5 region bounds, and D-03 ambiguity surfacing via resolveOne — 100% line+branch coverage gated under strict TS.
- parseSave(buffer) → { fieldTable, viewModel } — the single entry point wiring the structural spine + three region parsers into one FieldTable (IO-01 delivered end-to-end), with an offset-free derived ViewModel (SC-4), deterministic re-parse (SC-4/T-02-09), authoritative-vs-mirror currency flags (SC-2), and version tolerance (SC-5) — 100% line+branch coverage gated, 164 tests pass project-wide.
- Pure numeric Level↔XP module (`src/experience-table.ts`) porting the StandardExperienceTable 1:1 from the save-format spec — reproduces the SC-locked milestones L50/L99/L110/L120 exactly and provides a cap-clamped monotonic inverse for the patcher's EDIT-04 XP↔Level coupling.
- Same-width, in-place patch engine (`src/patcher.ts`) — `patchSave` resolves each edit to its FieldTable entry, validates the whole batch reject-never-clamp (SAFE-01), expands skill level/xp edits into their coupled pair via the StandardExperienceTable (EDIT-04), writes onto a Buffer copy at the declared width, and self-verifies by whole-buffer diff + verbatim re-parse so only intended byte ranges can change (SC-4).
- electron@43.0.0 and esbuild@0.28.1 added as devDependencies with the esbuild postinstall consciously approved (OPTION A), unblocking the Electron shell and Plan 05's esbuild build pipeline.
- A pure, electron-free `src/ipc/ipc-guards.ts` now sits between the untrusted renderer edits payload and the trusted core — SHAPE-rejecting malformed edits before `patchSave` runs (T-4-02), bridging int64 as strings↔bigint by resolved field kind (T-4-08), and stripping byte offsets from the change report that crosses the bridge (T-4-03).
- Two pure IPC service modules — a single in-memory active session (D-02) and the non-destructive new-file write path (IO-02) — proven headlessly under `tsx --test` with fs/dialog injected, no Electron runtime.
- Re-keyed bank stacks from `bank.inventory.<itemId>@<qtyOffset>` to the offset-free `bank.inventory.<itemId>#<occurrenceIndex>` and surfaced that exact key on `BankItem.fieldKey`, unblocking EDIT-02 renderer addressing while strengthening SC-4.
- Task 1 — React deps + esbuild renderer deltas + scoped UI tsconfig
- Three pure, DOM-free renderer modules — a patcher-mirrored validation layer that keeps int64 a decimal string, a ReDoS-safe substring filter, and a level→XP/int64-grouping formatter reusing the golden experience-table — all TDD-proven under the existing tsx runner with zero new deps.
- Pure top-level `useReducer` store (D-02 fieldKey-keyed edit accumulator) with derived dirtiness, int64-as-string payload projection, and Pitfall 5 skill xp/level mutual exclusion — all proven under `tsx --test`.
- UI-SPEC design-token stylesheet, a generic `@tanstack/react-virtual` fixed-32px list wrapper keyed by stable id, and an inline `EditableCell` running the client validation mirror — the reusable building blocks the Wave 3 panels consume.
- Read-only summary bar with click-to-edit int64 GP/Slayer Coins (string end-to-end) and a filterable, virtualized bank panel with inline int32 quantity edits addressed by offset-free BankItem.fieldKey.
- Skill edit surfaces (Set-by-level XOR Set-XP with live level→XP echo), the SAFE-02 preview/confirm modal rendering main's authoritative old→new rows, and a Banner that maps every ErrorKind to safe copy plus non-blocking version warnings.
- Wired the whole renderer into a single-useReducer App over the four-channel bridge, mounted it with React 19 createRoot, shipped a clean CSP browser bundle, and closed the phase with the mandatory manual in-game acceptance — an app-written .sav loads in Melvor Idle 2 with edits persisting.

**Delivered:** The complete load → browse/search → edit → preview → confirm → non-destructive write loop for Melvor Idle 2 saves, byte-exact and validated by an in-game load.

**Stats:**
- Timeline: 2026-07-03 → 2026-07-05 (3 days)
- Requirements: 14/14 v1 validated
- Source: ~4,467 LOC (src/ + electron/); tests: ~4,189 LOC; suite 272/272 green; format core 100% line+branch
- Tech: Electron 43 + TypeScript (strict), React 19, @tanstack/react-virtual, node:zlib Brotli, esbuild, tsx --test + c8

**Closeout:** verified_closeout — milestone audit PASSED (`milestones/v1.0-MILESTONE-AUDIT.md`); one stale test assertion surfaced and fixed during audit (`b351899`). Post-ship: bank phantom-stack corruption bug fixed (`b4ac6c4`) + confirmed in-game.
_Artifact-audit note: the pre-close scan flags `.planning/debug/knowledge-base.md` as an "open session" — a heuristic false positive (it is the debugger's permanent knowledge base, not a session; the only real session, `bank-phantom-stacks`, is resolved). No genuine deferred items._

---
