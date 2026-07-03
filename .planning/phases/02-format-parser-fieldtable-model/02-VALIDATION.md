---
phase: 02
slug: format-parser-fieldtable-model
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` §Validation Architecture + §Security Domain (all layout
> claims empirically verified against the real v20 fixture).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` via `tsx` (Phase 1 convention D-01) |
| **Config file** | none — `package.json` script `tsx --test test/**/*.test.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (adds the D-04 100% coverage gate) |
| **Estimated runtime** | ~12s (current suite ~11.6s; parser adds a handful of fixture parses) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npx c8 --100 --include 'src/**' --exclude 'test/**' npm test` (100% gate on the parser core, per D-04)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~12 seconds

---

## Per-Task Verification Map

Requirement column maps to IO-01 + the 5 ROADMAP success criteria (SC-1..SC-5). Threat refs map
to `02-RESEARCH.md` §Security Domain (V5 Input Validation, ASVS L1). Task IDs are indicative —
the planner assigns final plan/wave numbers; every row must land on some task with an automated
`npm test` verify.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | IO-01 / SC-1 | — | N/A | unit | `npm test` (save-parser: version=20, name/gamemode/GP/SC/totalLevel) | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | SC-1 | — | N/A | unit | `npm test` (bank: 689 stacks; spot-check qty) | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | SC-1 | — | N/A | unit | `npm test` (skills: XP+Level+LevelCap; Woodcutting 7439645.2/120/93) | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | SC-2 | — | Header GP/SC never a write target | unit | `npm test` (FieldTable: wallet authoritative, header mirrors read-only) | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | SC-3 | T-02-05 | Ambiguous match surfaced, never auto-picked | unit | `npm test` (crafted: 7-bit prefix==ID len; qty∈[0,2^31-1]; level/cap sane) | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | SC-4 | — | N/A | unit | `npm test` (re-parse → identical offsets; view model has no offset keys) | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | SC-5 | T-02-01/02/03 | Bounded count/length; no OOB, no giant alloc; unknown version warns-but-parses | unit | `npm test` (crafted malformed buffers + version bump) | ❌ W0 | ⬜ pending |
| 02-01-08 | 01 | 1 | Determinism | T-02-05 | count==walked & cursor==regionEnd for all 33 entities | unit | `npm test` (structural-walk integrity asserts) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/save-parser.test.ts` — fixture-parameterized suite (D-04) covering IO-01 + SC-1..SC-5 + determinism
- [ ] Test helpers for **crafted malformed buffers** (oversized 7-bit prefix, giant entity/component/currency count, region size overrunning the buffer, truncated region) — SC-5 negative tests
- [ ] A **"view model has no offsets"** assertion helper (recursively scan the JSON view model for numeric `offset` keys) — SC-4
- [ ] (Optional, D-04) A second real fixture (different gamemode / name length / bank size) before locking the suite shape — upgrades assumption A1 from LOW-risk to VERIFIED

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-gamemode wallet variety (a save legitimately lacking GoldPieces) | SC-2 / D-03 | Needs a real save from another gamemode; not in the single committed fixture | Load a hardcore/other-mode save; confirm GP-required fail-loud vs. legitimately-absent behavior matches the chosen D-03 contract |

*All other phase behaviors have automated verification against the committed fixture.*

---

## Validation Sign-Off

- [ ] All tasks have `npm test` automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (save-parser.test.ts + malformed-buffer helpers + no-offset scanner)
- [ ] No watch-mode flags (`npm test` is single-run `tsx --test`)
- [ ] Feedback latency < ~12s
- [ ] `nyquist_compliant: true` set in frontmatter (set by planner once every SC maps to a task)

**Approval:** pending
