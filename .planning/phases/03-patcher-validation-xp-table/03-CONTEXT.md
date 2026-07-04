# Phase 3: Patcher + Validation + XP Table - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

> **⚠️ PROVISIONAL — pending user confirmation.** The four gray areas below were presented
> during discuss-phase but the user chose to proceed straight to planning without answering
> ("you decide"). Claude chose low-risk defaults consistent with the locked constraints
> (fail-loud, non-destructive writes, in-place same-width edits, corruption is the worst
> outcome). Each is safe to plan against; the user can confirm or override at the start of
> planning or execution. Mirrors the Phase 2 provisional-defaults precedent.

<domain>
## Phase Boundary

A same-width, in-place **patch engine** that applies GP / item-quantity / skill (XP+Level)
edits onto a **copy** of the parsed save buffer, **validates every value against its
type/range before writing**, keeps skill XP and Level consistent via a verified
**StandardExperienceTable**, and **re-parses** the patched buffer to prove only the intended
byte ranges changed.

**In scope:** int64 currency edits (GP, Slayer Coins — wallet-authoritative only), int32 bank
item-quantity edits, skill edits (double XP + int32 Level), pre-write value validation, the
StandardExperienceTable (Level→XP), and re-parse/diff verification.

**Out of scope (deferred):** any UI (Phase 5), byte-width-changing edits / region-size-prefix
rewrites / byte insertion (explicit v1 CLAUDE.md constraint), editing LevelCap (readOnly),
friendly item/skill names (Phase 5), multi-save batch tooling.

</domain>

<decisions>
## Implementation Decisions

### Validation failure mode
- **D-01 (provisional → "collect-all-then-write, atomic"):** A patch request carries a batch
  of edits. The engine validates **every** edit first and, if any fail, returns/throws a typed
  error enumerating **all** violations (fieldKey + reason) and writes **nothing** — the input
  buffer is never partially patched. Rationale: the Phase 5 preview UI needs to show the user
  every problem at once, and an all-or-nothing write keeps the "corruption is the worst outcome"
  guarantee (no half-applied batch). Consistent with Phase 1/2 typed-error, fail-loud pattern.

### XP↔Level coupling (EDIT-04)
- **D-02 (provisional → "Level is the primary knob; snap XP to table minimum; direct XP allowed"):**
  - Setting **Level = L** writes Level=L and writes XP = `StandardExperienceTable[L]` (the exact
    minimum XP for that level) — no leftover/partial-level XP preserved. Simplest, always
    self-consistent, matches the EDIT-04 story ("type a target Level, app computes correct XP").
  - Direct **XP edits are also allowed**: writing a raw XP value recomputes Level as the highest
    L where `table[L] <= XP` (clamped to LevelCap), so XP and Level never disagree on disk.
  - **LevelCap is readOnly** — never patched (ROADMAP: "LevelCap unchanged"; FieldTable already
    flags it). Level is clamped to `1..LevelCap`; XP clamped to `table[LevelCap]` max.

### Self-verifying write (SC-4)
- **D-03 (provisional → "engine self-verifies by default"):** After writing, the patch engine
  **re-parses the patched buffer and diffs** it against the pre-patch parse, asserting that only
  the intended FieldTable offset ranges changed and `output.length === input.length`. If the diff
  shows any unintended change, the engine throws (returns the error, not the buffer). Rationale:
  the whole phase exists to guarantee a loadable save; making the safety check intrinsic to the
  write — not just a test — is the strongest expression of the core value. Re-parse cost is
  negligible for a single-user local tool. The same assertion is ALSO exercised at test level
  (SC-4), but production correctness does not depend on tests running.

### Edit API shape
- **D-04 (provisional → "batch of {fieldKey, newValue} → {buffer, changeReport}"):** The engine
  takes the parsed FieldTable + a list of edits keyed by the FieldTable's resolved field keys
  (e.g. `wallet.GoldPieces`, `skill.<id>.level`, `bank.<offsetKey>.quantity`) with new values in
  the field's native runtime type (bigint for int64, number for int32/double). It returns a
  **new Buffer** (never mutates the input) plus a **change report** (per-edit: fieldKey, old→new,
  offset, width) for the Phase 5 preview/diff view. Rationale: keys not offsets keeps the API
  offset-free at the boundary (Phase 2 SC-4 spirit), the change report feeds the preview-before-
  write safety requirement, and returning a fresh buffer preserves non-destructive writes.

### Claude's Discretion (explicitly left to research/planning)
- **StandardExperienceTable implementation** — precompute a 1..120 array at module load vs.
  compute-on-demand; exact float handling to hit the spec milestones (L50=101,331; L99=13,034,427;
  L120=104,273,162). Researcher pins the formula against `docs/current-skill.md` §XP Table.
- **Where the patcher reads field metadata** — reuse the Phase 2 `FieldTable` `{offset, kind,
  width, value, readOnly, authoritative, mirrors}` directly; how edits map to entries by key.
- **BinaryWriter reuse** — `src/binary-writer.ts` already exists; planner decides how the patch
  engine drives it for same-width LE writes (int32/int64/double).
- **Diff mechanism for SC-4** — whole-buffer byte diff vs. asserting only declared offset ranges;
  either satisfies "only intended ranges changed."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Save format & XP table
- `docs/current-skill.md` §"XP Table (StandardExperienceTable)" (lines ~183–210) — authoritative
  formula + parameters (`scaling=0.25, exponent_scaling=300.0, base=2^(1/7)`) and milestone values.
- `docs/current-skill.md` §"ExperienceComponent format" (lines ~173–182) — XP (double) / LevelCap
  (int32) / Level (int32) layout the patcher writes into.

### Phase 2 artifacts the patcher builds on
- `src/field-table.ts` — `FieldEntry {offset, kind, width, value}` + `readOnly`/`authoritative`/
  `mirrors` flags; the patcher reads entries by key and writes same-width in place.
- `src/binary-writer.ts` — existing `BinaryWriter` for LE primitive writes.
- `src/save-parser.ts` — `parseSave(buffer)` used for the SC-4 re-parse/diff verification.
- `src/codec.ts` — Brotli decompress/recompress for the round-trip to a loadable `.sav`.

### Requirements
- `.planning/REQUIREMENTS.md` — **SAFE-01** (validate every value against type/range before
  writing) and **EDIT-04** (set skill by target Level; auto-compute XP; keep XP/Level consistent).

### Project constraints
- `.claude/CLAUDE.md` — in-place same-byte-width edits only (v1); validate ranges; write to a new
  file, never overwrite the original; output must round-trip and load in-game.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BinaryWriter` (src/binary-writer.ts): the same-width LE write primitive the patcher drives.
- `FieldTable`/`FieldEntry` (src/field-table.ts): already carries `{offset, kind, width, value}`
  plus `readOnly`/`authoritative`/`mirrors` — the patcher's input metadata, no new model needed.
- `parseSave` (src/save-parser.ts): reused verbatim for the SC-4 self-verifying re-parse.
- `codec.ts` decompress/recompress: closes the loop from patched buffer → loadable `.sav`.

### Established Patterns
- Fail-loud with typed errors (`ParseError`/`RequiredFieldMissingError` hierarchy from Phase 1/2)
  — patch validation errors should extend the same hierarchy for a consistent surface.
- Offset-free at the boundary (Phase 2 SC-4): the edit API keys by field, not raw offset.
- int64 as `bigint` everywhere (never `Number`) — currency edits take/return bigint.

### Integration Points
- Patch engine consumes the FieldTable produced by `parseSave` and emits a new Buffer + change
  report; a later phase feeds that buffer back through `codec` to write the `.sav`.

</code_context>

<specifics>
## Specific Ideas

- Spec milestones the XP table MUST reproduce exactly: L50 = 101,331; L99 = 13,034,427;
  L120 = 104,273,162 (from ROADMAP SC-3 and `docs/current-skill.md`).
- `output.length === input.length` invariant must hold after every patch (SC-1).

</specifics>

<deferred>
## Deferred Ideas

- Byte-width-changing edits / region-size-prefix recomputation / byte insertion — explicitly a
  future (v2) concern per CLAUDE.md; not this phase.
- Any editing UI, preview rendering, or item/skill name resolution — Phase 5.
- Editing LevelCap or adding new skills/items — out of the v1 edit surface.

</deferred>

---

*Phase: 03-patcher-validation-xp-table*
*Context gathered: 2026-07-04 (provisional defaults — user chose "you decide")*
