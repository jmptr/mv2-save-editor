---
phase: 3
slug: patcher-validation-xp-table
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test via `tsx` (existing — matches Phase 1/2) |
| **Config file** | none — `package.json` `test` script: `tsx --test test/**/*.test.ts` |
| **Quick run command** | `npx tsx --test test/experience-table.test.ts test/patcher.test.ts` |
| **Full suite command** | `npx tsx --test test/**/*.test.ts` |
| **Estimated runtime** | ~2 seconds (full suite ~164 tests today) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (phase-3 suites)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green + `tsc --noEmit` exit 0
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task | Requirement | SC | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|----|-----------------|-----------|-------------------|-------------|--------|
| StandardExperienceTable (Level→XP) | EDIT-04 | SC-3 | Reproduces L50/L99/L120 exactly; never L75 (doc typo) | unit | `npx tsx --test test/experience-table.test.ts` | ❌ W0 | ⬜ pending |
| Same-width in-place write (int32/int64/double) | — | SC-1 | `output.length === input.length` by construction; Buffer.from copy, never mutate input | unit | `npx tsx --test test/patcher.test.ts` | ❌ W0 | ⬜ pending |
| Pre-write value validation (collect-all) | SAFE-01 | SC-2 | Rejects out-of-range int32/int64/Level/XP before any write; typed errors; nothing written on any failure | unit | `npx tsx --test test/patcher.test.ts` | ❌ W0 | ⬜ pending |
| XP↔Level coupling (snap / derive / reject) | EDIT-04 | SC-3 | Level→XP snap to table min; XP→Level derive; out-of-range & dual level+xp edits REJECTED; LevelCap never written | unit | `npx tsx --test test/patcher.test.ts` | ❌ W0 | ⬜ pending |
| Self-verifying re-parse/diff | SAFE-01 | SC-4 | Re-parse patched buffer; only intended byte ranges changed; throw on unintended change | unit | `npx tsx --test test/patcher.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/experience-table.test.ts` — milestone fixtures (L1, L50=101,331; L99=13,034,427; L120=104,273,162), monotonicity, boundary levels
- [ ] `test/patcher.test.ts` — patch/validate/self-verify against the committed fixture (reuse `test/helpers/fixture.ts`)
- [ ] Framework: already present (node:test + tsx) — no install needed

*Existing infrastructure (Phase 1/2 fixture harness + node:test) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Patched `.sav` loads in-game without corruption | SAFE-01 (core value) | Requires the actual Melvor Idle 2 client; can't be automated in CI | Apply an edit, recompress via `codec`, load the resulting `.sav` in the game, confirm the edited value and that the save is not rejected |

*All in-repo behaviors have automated verification; the only manual gate is the real-game load, which is the project's core value and inherently out-of-process.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
