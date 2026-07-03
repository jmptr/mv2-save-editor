# Phase 2: Format Parser + FieldTable Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 2-Format Parser + FieldTable Model
**Areas discussed:** View-model scope, Item identity, Ambiguous match, Fixture corpus

> ⚠️ **The user stepped away during discussion (60s timeout, no response).** All four
> selections below are **provisional defaults chosen by Claude**, not user selections. They
> were picked to be low-risk against the locked constraints (fail-loud, no scope creep, no new
> dependencies, don't foreclose Phase 5) so planning is not blocked. The user should confirm or
> override each at the start of `/gsd-plan-phase 2`.

---

## View-model scope

| Option | Description | Selected (provisional) |
|--------|-------------|----------|
| Lean editable surface | Only editable fields + required summary | |
| Add read-only context | Also placeholder/locked flags, version, entity IDs, timestamp | ✓ (narrowed) |
| You decide | Leave shape to planner | |

**Provisional choice:** Lean editable surface **+ free-to-parse metadata** (per-stack
placeholder/locked flags, save version, entity-IDs-present) — but exclude anything needing an
external game-data source (display names/icons). Captured as D-01.
**Notes:** The flags/version/entity-list are read anyway while walking the structure, so they
cost nothing and help Phase 5. Richer metadata deferred to Phase 5.

---

## Item identity

| Option | Description | Selected (provisional) |
|--------|-------------|----------|
| Raw namespaced IDs | `MelvorBase:AgilityMark` etc.; no new dep | ✓ |
| Also map friendly names | ID → display name; needs game-data table | |
| You decide | Default to raw IDs | |

**Provisional choice:** Raw namespaced IDs. Captured as D-02.
**Notes:** Friendly names need a new data dependency and are really a Phase 5 browse/search
concern; view model shaped so a `name` field can be added later without rework.

---

## Ambiguous match

| Option | Description | Selected (provisional) |
|--------|-------------|----------|
| Return all candidates | Surface candidates; caller/user disambiguates | ✓ (combined) |
| Hard-fail the parse | Throw if a required field isn't unique | ✓ (for zero-match required fields) |
| You decide | Planner decides within "never auto-pick" | |

**Provisional choice:** Resolve when exactly one context-validated match; surface all candidates
when more than one (never auto-pick); fail loudly when zero matches for a **required** field.
Captured as D-03.
**Notes:** Keeps saves editable where possible while honoring fail-loud for genuinely
unlocatable required fields. Aligns with locked SC-3 ("surfaced, never auto-picked").

---

## Fixture corpus

| Option | Description | Selected (provisional) |
|--------|-------------|----------|
| Proceed on single fixture now | Use the one v20 save; defer variety | |
| I'll assemble varied saves first | User provides several saves before planning | |
| You decide | Plan on single fixture, design for drop-in more | ✓ |

**Provisional choice:** Design-for-corpus — build against the single committed fixture but
structure tests as a fixture-parameterized suite so more saves drop in without rework; recommend
the user assemble varied saves (gamemodes, name lengths incl. non-ASCII, bank sizes) before/
during planning. Captured as D-04.
**Notes:** Honors the flagged Phase-2 dependency (STATE.md) without blocking. Parser must not
hard-code offsets that assume the single fixture's field sizes.

## Claude's Discretion

- Parsing strategy (structural walk vs marker-search + context-validation) and specific
  `Walleta`/entity-boundary/`Experience`-component heuristics — researcher/planner, grounded on
  the fixture.
- FieldTable ⇄ view-model code API shape.
- GP vs Slayer Coins distinction within the wallet.
- Handling of entities Phase 2 doesn't model (must stay byte-intact for Phase 4).

## Deferred Ideas

- Friendly item/skill names + icons → Phase 5 (needs game-data source).
- Richer read-only context beyond Bank/skills → Phase 5.
- Varied real-save fixture corpus → user to assemble before/during planning.
