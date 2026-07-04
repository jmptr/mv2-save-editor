---
phase: 05
slug: renderer-ui-browse-search-edit-preview
status: filled
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Corruption/logic-relevant renderer behavior is extracted into pure DOM-free modules and unit-tested under the existing `tsx --test` runner (no new test deps — no jsdom/testing-library). React component visuals/interaction and the in-game load are manual UAT.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` via `tsx --test` (already in use; no new deps) |
| **Config file** | none — `package.json` `"test": "tsx --test 'test/**/*.test.ts'"` (glob already covers `test/ui/`) |
| **Quick run command** | `npx tsx --test 'test/ui/*.test.ts'` (pure UI modules under edit) |
| **Full suite command** | `npm test` (whole suite — includes Phases 1–4 golden/round-trip tests) |
| **`.tsx` typecheck** | `npm run typecheck:ui` (`tsc --noEmit -p electron/ui/tsconfig.json`, added by 05-02) |
| **Estimated runtime** | ~3–6 seconds (unit) · full suite a few seconds more |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched pure module (`npx tsx --test 'test/ui/<touched>.test.ts'`); for `.tsx` component tasks run `npm run typecheck:ui`.
- **After every plan wave:** Run `npm test` (full suite) — Wave 1 also gates the core bank rekey (05-01) against the 689-stack + no-offset scan.
- **Before `/gsd-verify-work`:** Full suite must be green (`npm test`) plus `npm run typecheck` and `npm run typecheck:ui`.
- **Max feedback latency:** < 10 seconds for the unit path.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | EDIT-02 | T-05-03 / T-05-01 | Offset-free `#<n>` bank key; ViewModel carries no offset | unit | `npm run typecheck` | ✅ (src) | ⬜ pending |
| 05-01-02 | 01 | 1 | EDIT-02 | T-05-01 | fieldKey↔FieldTable round-trip; 689-stack + no-offset scan stay green | unit/integration | `npm test` | ✅ (existing) | ⬜ pending |
| 05-02-01 | 02 | 1 | BROWSE-01 | T-05-SC / T-05-04 | React deps vetted; iife+NODE_ENV+jsx; CSP unchanged | build/config | `node --check scripts/build.mjs` + grep deltas + `npm ls --depth=0` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 1 | SAFE-02 | T-05-05 | Type-only results contract; no src/* runtime in preload | unit | `npm run typecheck` | ✅ | ⬜ pending |
| 05-03-01 | 03 | 1 | EDIT-01/02/03 | T-05-07 | Client mirror at exact patcher bounds; int64 stays string | unit | `npx tsx --test 'test/ui/validation.test.ts'` | ❌ W0 (this task) | ⬜ pending |
| 05-03-02 | 03 | 1 | BROWSE-04/05, EDIT-04/D-03 | T-05-06 | Substring filter (no RegExp); level→XP echo; reversible int64 grouping | unit | `npx tsx --test 'test/ui/filter.test.ts' 'test/ui/format.test.ts'` | ❌ W0 (this task) | ⬜ pending |
| 05-04-01 | 04 | 1 | SAFE-02, EDIT-03 | T-05-08 | D-02 accumulator; Pitfall 5 sibling-clear | unit | `npm run typecheck` | ✅ | ⬜ pending |
| 05-04-02 | 04 | 1 | SAFE-02 | T-05-08 / T-05-02 | Dirty-derived payload; int64 as string; dirtyCount | unit | `npx tsx --test 'test/ui/reducer.test.ts'` | ❌ W0 (this task) | ⬜ pending |
| 05-05-01 | 05 | 2 | BROWSE-02/03 | T-05-04 | Token stylesheet; fixed 32px virtualization; stable-id keys | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-05-02 | 05 | 2 | EDIT-02 | T-05-09 | Inline validation; invalid contributes no edit; no innerHTML | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-06-01 | 06 | 3 | BROWSE-01, EDIT-01 | T-05-07 / T-05-09 | Read-only summary; click-to-edit int64 string | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-06-02 | 06 | 3 | BROWSE-02/04, EDIT-02 | T-05-09 / T-05-06 | Filter+virtualize; edit by offset-free fieldKey | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-07-01 | 07 | 3 | BROWSE-03/05, EDIT-03 | T-05-08 | Set-by-level XOR Set-XP; live XP echo | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-07-02 | 07 | 3 | SAFE-02 | T-05-09 / T-05-10 | Modal old→new from main; kind→copy (no raw kind) | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-08-01 | 08 | 4 | BROWSE-01..05, EDIT-01..03, SAFE-02 | T-05-03 / T-05-10 | Full load→edit→preview→confirm→write orchestration | compile | `npm run typecheck:ui` | ✅ | ⬜ pending |
| 05-08-02 | 08 | 4 | BROWSE-01..05, EDIT-01..03, SAFE-02 | T-05-03 / T-05-04 | Clean browser bundle (no node builtins); full suite green | build/integration | `npm run build:electron && npm run typecheck && npm run typecheck:ui && npm test` | ✅ | ⬜ pending |
| 05-08-03 | 08 | 4 | (criterion 5) | T-05-10 | Edited save loads in-game; values persist after re-save | manual UAT | — (blocking human-verify) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The four pure-module test files are created as part of Wave 1 (Plans 05-03 and 05-04) — they do not exist at plan-creation time, hence `wave_0_complete: false`. No framework install is needed (`tsx --test` already present).

- [ ] `test/ui/validation.test.ts` — EDIT-01/02/03 bounds (mirror of `src/patcher.ts`; int64 stays string) — created by 05-03 Task 1
- [ ] `test/ui/filter.test.ts` — BROWSE-04/05 substring predicate — created by 05-03 Task 2
- [ ] `test/ui/format.test.ts` — EDIT-04/D-03 level→XP echo + reversible int64 grouping — created by 05-03 Task 2
- [ ] `test/ui/reducer.test.ts` — D-02 accumulator + Pitfall 5 mutual exclusion + dirtyCount/editsToPayload — created by 05-04 Task 2
- [x] No framework install needed (`tsx --test` already present; `package.json` glob covers `test/ui/`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Edited save loads in-game and the new GP/quantity/skill values persist after an in-game re-save | ROADMAP §Phase 5 criterion 5 | The game runtime is external; no automated harness can load a `.sav` into Melvor Idle 2 | 05-08 Task 3 blocking `checkpoint:human-verify`: `npm start`, load a real `.sav`, edit GP + a bank quantity + a skill (Set-by-level and Set-XP), preview old→new, `Write New Save File`, then load the written file in-game and re-save/reload to confirm persistence |
| Visual/interaction states (summary anchor, virtualized scrolling, filter narrowing, inline-error, preview modal, native Save-As) | BROWSE-01/02/03, D-05/06/07/08 | React DOM rendering + native OS dialog; no jsdom in the lean stack | Exercised during the 05-08 Task 3 human-verify walkthrough (steps 2–5) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the three consecutive `.tsx` compile tasks each carry `npm run typecheck:ui`; the manual-only in-game load is recorded above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has typecheck/unit/build; only the final task is manual, backed by the preceding build gate)
- [x] Wave 0 covers all MISSING references (four `test/ui/*.test.ts` created in Wave 1 Plans 03/04)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter (`wave_0_complete: false` — the Wave 0 tests are Wave 1 deliverables, flipped to true once 05-03/05-04 land)

**Approval:** approved 2026-07-04
