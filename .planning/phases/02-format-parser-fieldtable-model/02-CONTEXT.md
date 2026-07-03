# Phase 2: Format Parser + FieldTable Model - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning — ⚠️ **decisions D-01…D-04 are PROVISIONAL** (user stepped away during discussion; defaults chosen by Claude, pending user confirmation before/at planning)

<domain>
## Phase Boundary

The pure-core (no Electron) format parser. It walks a **real decompressed save** —
`int32 version` → `SaveHeader` → entity list → the **Bank** entity (wallet int64 + item
stacks) and each **skill** entity's `ExperienceComponent` — into two artifacts:

1. **FieldTable** — the authoritative offset map. Every editable field is `{ offset, kind,
   width, value, … }`, re-derived fresh on every load and **never persisted**. This is what
   Phase 3's patcher writes through.
2. **JSON view model** — a UI-facing projection that contains **no byte offsets**: save
   version, character summary, bank item list with quantities, and every skill's XP + Level +
   LevelCap.

**Delivers requirement:** IO-01 (load + parse the documented layout, offsets fresh every load).

**Not in this phase (locked out by ROADMAP):** the same-width patch engine + validation + XP
table (Phase 3), the Electron shell/IPC/non-destructive write (Phase 4), the renderer UI
(Phase 5). Phase 2 stops at *reading* the save into a model + offset table; it never writes.

**Left to researcher/planner (technical, not user-vision):** the exact parsing strategy —
structural byte-walk vs bounded marker-search-with-context-validation — and the precise
`Walleta`/entity-boundary/`Experience`-component heuristics. These must be grounded against
the real fixture(s). The success criteria constrain the *contract* (region-scoped,
context-validated, ambiguous matches surfaced); the *mechanism* is a research question.

</domain>

<decisions>
## Implementation Decisions

> **⚠️ PROVISIONAL — pending user confirmation.** The user was away when these four gray
> areas were presented. Claude chose low-risk defaults consistent with the locked constraints
> (fail-loud, no scope creep, no new deps, don't foreclose Phase 5). Each is safe to plan
> against, but the user should confirm or override at the start of planning. The four questions
> are recorded verbatim in `02-DISCUSSION-LOG.md`.

### View-model scope
- **D-01 (provisional → "lean + free metadata"):** The JSON view model exposes the required
  summary (name, gamemode, total level, GP, Slayer Coins, save version) + the editable surface
  (bank items with quantity; skills with XP/Level/LevelCap) **plus metadata that is already
  parsed for free** from the byte layout: each stack's `isPlaceholder`/`isLocked` flags and the
  list of entity IDs present. **Excluded** (deferred to Phase 5): item display names/icons and
  any data requiring an external game-data source. Rationale: the flags and entity list cost
  nothing extra (they're read while walking the stack/entity structure) and help the Phase 5
  browse UI, while display metadata would pull in a new dependency this phase doesn't need.

### Item / skill identity
- **D-02 (provisional → "raw namespaced IDs"):** Items and skills are identified by their raw
  stored IDs (`MelvorBase:AgilityMark`, `MelvorBase:Woodcutting`). **No friendly-name mapping
  in Phase 2** — that needs a game-data name table (new dependency) and is really a Phase 5
  browse/search concern. The view model should be shaped so an optional `name` field could be
  added later without rework. Rationale: zero new dependency, keeps the parser pure; Phase 5
  can layer names on top.

### Ambiguous-match contract
- **D-03 (provisional → "resolve-one / candidates-when-many / fail-loud-when-zero"):**
  - Exactly one context-validated match → resolve it (populate the FieldTable entry).
  - More than one context-validated candidate → **surface all candidates** (offset + validating
    evidence) on the field; do **not** auto-pick (success criterion 3). Parse still succeeds;
    the unresolved field is flagged for a higher layer / the user to disambiguate.
  - Zero matches for a **required** field (e.g. the GP wallet) → **fail loudly** (typed error),
    never emit a silently-wrong model.
  Rationale: keeps saves editable where possible (candidate list) while honoring fail-loud for
  genuinely unlocatable required fields. Aligns with the locked "surfaced, never auto-picked."

### Fixture corpus / test strategy
- **D-04 (provisional → "design-for-corpus, proceed on single fixture, user assembles more"):**
  Plan and build against the **single committed fixture** (`test/fixtures/test-fixture.sav`,
  version 20) so Phase 2 is not blocked, **but** structure the parser tests as a
  fixture-parameterized suite so additional real saves drop in with no rework. The user is the
  sole source of real saves; assembling a **varied corpus** (different gamemodes, character-name
  lengths incl. non-ASCII, bank sizes) materially strengthens validation of layout-variety paths
  (this is the flagged Phase-2 dependency in STATE.md). Recommend the user add saves before or
  during planning; the parser must not hard-code offsets that assume the single fixture's sizes.

### Claude's Discretion (explicitly left to research/planning)
- **Parsing strategy** — structural descent vs marker-search-with-validation, and the specific
  `Walleta` / entity-region-boundary / `Experience`-component location heuristics. Ground
  against the fixture(s). Must satisfy: region-scoped, context-validated (7-bit length prefix
  equals ID byte length; quantity/level/levelcap in sane ranges), bounds-checked (no OOB read,
  no giant allocation on a malformed length prefix or entity count), and unknown-version
  warns-but-parses.
- **FieldTable ⇄ view-model API shape** — how the two artifacts relate in code (one parse pass
  producing both, or view model derived from FieldTable). Planner decides; Phase 3's patcher
  ergonomics should inform it.
- **Currency distinction** — how GP vs Slayer Coins are told apart within the wallet (order,
  adjacent markers). Researcher pins this against the fixture; both are int64 and both are
  authoritative in the wallet (SaveHeader copies are read-only mirrors — locked).
- **Untouched-entity handling** — entities Phase 2 does not deeply model (everything except
  Bank + skills) must remain byte-intact for Phase 4's round-trip write; whether they are
  enumerated (IDs only) or held as opaque regions is a planning detail, but their bytes must
  never be mutated or reordered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Save format spec (authoritative)
- `docs/current-skill.md` — The authoritative reverse-engineered spec for the MV2 `.sav`
  format. For Phase 2 specifically: the **File Layout** section (`[int32 version][SaveHeader]
  [entity list][...]`), the **SaveHeader** field order (UUID → CharacterName → Gamemode →
  Timestamp → ActiveEntity/Action name+icon → TotalLevel → GP → SlayerCoins), **Known Entity
  IDs**, the **Bank** section (wallet int64 + `Walleta` marker; item stack format `[int32 qty]
  [bool placeholder][bool locked][string itemID]`; the "6 bytes before the length prefix"
  stack-finding recipe; `find_entity` region walk), and the **ExperienceComponent** format
  (`[double XP][int32 LevelCap][int32 Level]`). Note: examples are Python; implementation is TS
  and must consume the Phase 1 `BinaryReader`. Researcher + planner MUST read end-to-end.

### Phase 1 core the parser consumes
- `src/binary-reader.ts` — the stateful LE `BinaryReader` (readInt32/readInt64-BigInt/
  readDouble/readBool/readString + `seek`/`offset`) Phase 2 walks the save with. Sequential
  cursor mirrors the .NET `BinaryReader` mental model the spec is written in. Throws on OOB
  (T-1-04) and malformed 7-bit prefix (T-1-02) — the parser should let these propagate as its
  own bounds-check guarantees.
- `src/codec.ts` — `decompress` produces the buffer Phase 2 parses. (Phase 2 parses the
  *decompressed* buffer; it does not recompress — that's Phase 4.)
- `.planning/phases/01-binary-primitives-brotli-codec/01-CONTEXT.md` — Phase 1 decisions
  carried forward (native-Node, strict TS + `noUncheckedIndexedAccess`, `node:test` + `c8`
  100% gate, fail-loud, test/ layout, fixture committed).

### Project + requirement anchors
- `.planning/PROJECT.md` — constraints: in-place same-width edits only, offsets re-parsed fresh
  every load (never reused), Bank wallet is the real currency (header GP/SlayerCoins cosmetic).
- `.planning/REQUIREMENTS.md` — Phase 2 owns **IO-01**; IO-03 (Phase 1) is complete.
- `.planning/ROADMAP.md` §"Phase 2" — Goal + 5 success criteria (the contract this phase must
  satisfy, incl. fresh-offset re-derivation, wallet-authoritative currency, context-validated
  region-scoped matches, and bounds-checked malformed-input handling).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/binary-reader.ts` (`BinaryReader`) — the sequential LE cursor the parser is built on.
  `seek(off)` supports jumping to a computed region start; `offset` reports the cursor for
  building FieldTable entries. Consume it; do not re-implement primitive reads.
- `src/codec.ts` (`decompress`) — yields the decompressed buffer to parse.
- `test/fixtures/test-fixture.sav` — the committed real save (version 20). Phase 2's golden
  input; decompress at runtime (per Phase 1 D-11, no separate decompressed golden).
- `test/` layout + `node:test` + `c8` gate convention established in Phase 1 — Phase 2 mirrors it.

### Established Patterns
- **Fail-loud, never silently corrupt** (Phase 1) — extends to the parser: malformed length
  prefixes / entity counts throw or warn-and-bound, never OOB-read or over-allocate.
- **Offsets live only in the offset structure** (here, the FieldTable), never in the user-facing
  model — a Phase 2 success criterion and a PROJECT constraint.
- **Native-Node + strict TS + `noUncheckedIndexedAccess`** — no new runtime deps expected for
  parsing (raw IDs, no name table under D-02).

### Integration Points
- **Consumes Phase 1:** `decompress` → `BinaryReader` walk.
- **Feeds Phase 3:** the FieldTable is the patcher's write target (offset + width + kind per
  field). The view model feeds Phase 5's browse/search UI.
- **Constrains Phase 4:** entities Phase 2 doesn't model must stay byte-intact for the
  non-destructive round-trip write.

</code_context>

<specifics>
## Specific Ideas

- **The FieldTable is the offset boundary.** Offsets exist there and nowhere else; the JSON view
  model is offset-free by contract (success criterion 4). Re-parsing the same buffer must yield
  identical offsets (deterministic walk).
- **Currency: wallet is authoritative, header is a mirror.** Only the Bank wallet int64(s) are
  ever the write target; the SaveHeader GP/SlayerCoins are read-only cosmetic snapshots. Mark
  them as such in both the FieldTable and the view model so Phase 3 can never target the header.
- **Context-validation is the anti-false-match guard.** A candidate stack is only valid when the
  7-bit length prefix equals the item-ID byte length and quantity is in `[0, 2,147,483,647]`; a
  candidate ExperienceComponent is only valid when LevelCap/Level are in sane ranges (e.g.
  1..120) following the double. This is how "region-scoped and context-validated" (SC-3) is met.
- **Version tolerance:** the fixture is version 20 (not 17 as some older docs/comments say). An
  unknown/newer version must warn-but-parse, not hard-fail (SC-5).

</specifics>

<deferred>
## Deferred Ideas

- **Friendly item/skill display names + icons** — needs a game-data name/icon source (new
  dependency). Deferred to **Phase 5** (browse/search UI) where it belongs; the Phase 2 view
  model is shaped so a `name` field can be added later without rework. (D-02)
- **Richer read-only context** (full item metadata, per-entity detail beyond Bank/skills) —
  deferred; Phase 2 surfaces only what the success criteria + free-to-parse metadata cover.
  (D-01)
- **Varied real-save fixture corpus** (different gamemodes, name lengths incl. non-ASCII, bank
  sizes) — the user assembles this; recommended before/during planning to validate layout
  variety. Carried from Phase 1's deferred list and STATE.md blockers. (D-04)

</deferred>

---

*Phase: 2-Format Parser + FieldTable Model*
*Context gathered: 2026-07-03*
