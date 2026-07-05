---
phase: 05-renderer-ui-browse-search-edit-preview
verified: 2026-07-05T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Renderer UI — Browse, Search, Edit, Preview Verification Report

**Phase Goal:** The user-facing loop — load a save, read the summary, browse and search bank items and skills, edit values with inline validation and XP-table-aware level input, then preview and confirm pending changes before a non-destructive write.
**Verified:** 2026-07-05
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | User opens a `.sav` and sees a read-only summary: name, gamemode, GP, Slayer Coins, total level [BROWSE-01] | ✓ VERIFIED | `SummaryBar.tsx` renders all five; name/gamemode/totalLevel are read-only text children (L99-110), GP/SC are int64 decimal strings never coerced through Number (L54, D-06). Wired in `App.tsx` L131. |
| 2 | User browses virtualized bank items (qty) + skills (XP+Level), each filterable as-you-type by ID [BROWSE-02/03/04/05] | ✓ VERIFIED | `BankPanel`+`SkillPanel` both render `VirtualList` (`useVirtualizer`, fixed 32px, stable-id keys). Filter via `matches()` case-insensitive substring (no user-built RegExp). Local `useState` filter, memoised slice, remount-on-query. |
| 3 | User edits GP/SC (to Bank wallet, not header snapshot), bank qty, skill XP or target Level, invalid flagged inline before write [EDIT-01/02/03] | ✓ VERIFIED | `EditableCell` runs client validators (`validateInt32/Int64/Level/Xp`); invalid contributes no edit (D-04). Wallet writes target `wallet.GoldPieces/SlayerCoins`; header GP/SC are readOnly mirrors written in lock-step by `patchSave` (`mirrorsOf`), never the user target — covered by regression tests `patcher.test.ts` L297-323. Skill level XOR xp enforced in `reducer.ts` L127-136 and `SkillPanel` `switchTo`. |
| 4 | User reviews pending-changes preview (field, old→new) and must explicitly confirm before any write [SAFE-02] | ✓ VERIFIED | `PreviewModal` renders main's authoritative `WireChangeRow[]` (not a local diff, D-07); confirm CTA disabled when no rows or any violation; write fires ONLY from modal confirm (`App.tsx` handleWrite L75). Preview gated on `dirtyCount > 0`. |
| 5 | Confirming writes a new `.sav`, shows output path, and the edited save loads in-game with values persisting (mandatory manual in-game acceptance) | ✓ VERIFIED | Write path emits new file + `outputPath` shown via Banner successPath. Manual in-game acceptance PERFORMED and PASSED by user ("approved") — recorded in 05-08-SUMMARY human-verify checkpoint. Acceptance surfaced a real core bug (game reads header GP/SC snapshot on load); fixed in `4573e70` (header-mirror coupling + 3 regression tests) and re-confirmed in-game. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

Behavior-dependent invariants were checked against real tests, not presence alone: the header-mirror lock-step coupling (SC-3/EDIT-01) has dedicated passing tests in `test/patcher.test.ts`, and the skill level↔xp mutual exclusion is enforced in the pure reducer covered by the Wave-0 UI test suite (part of the 264 passing tests).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `electron/ui/App.tsx` | useReducer orchestrator | ✓ VERIFIED | Single `useReducer`; maps all 4 bridge results to dispatch; Preview gated on dirtyCount; write only from modal confirm. |
| `electron/renderer.tsx` | createRoot mount + styles import | ✓ VERIFIED | React 19 `createRoot`, guarded `#root`, imports `./ui/styles.css` so esbuild emits `dist/renderer.css`. |
| `electron/ui/components/SummaryBar.tsx` | BROWSE-01 + int64 click-to-edit | ✓ VERIFIED | Five fields; int64 as string end-to-end. |
| `electron/ui/components/BankPanel.tsx` | BROWSE-02/04, EDIT-02 | ✓ VERIFIED | Virtualized, filter, fieldKey-addressed qty edits. |
| `electron/ui/components/SkillPanel.tsx` | BROWSE-03/05, EDIT-03 | ✓ VERIFIED | Virtualized, filter, level XOR xp with live XP echo. |
| `electron/ui/components/PreviewModal.tsx` | SAFE-02 | ✓ VERIFIED | Authoritative old→new rows + violations; confirm gate. |
| `electron/ui/components/EditableCell.tsx` | inline validation mirror | ✓ VERIFIED | Local text state, invalid → no edit, inline error. |
| `electron/ui/components/VirtualList.tsx` | @tanstack/react-virtual, 32px, stable keys | ✓ VERIFIED | `useVirtualizer`, inline CSSOM transform (CSP-safe). |
| `electron/ui/components/Banner.tsx` | error-kind→copy + warnings | ✓ VERIFIED | Exhaustive ErrorKind switch, never raw kind, unknownVersion notice. |
| `electron/ui/state/reducer.ts` | pure accumulator + Pitfall 5 | ✓ VERIFIED | Pure; SET_EDIT of skill key clears sibling. |
| `electron/ui/state/selectors.ts` | editsToPayload/dirtyCount (derived) | ✓ VERIFIED | Emits only valid entries differing from loaded value; int64 string preserved. |
| `dist/renderer.js` + `dist/renderer.css` + `dist/main.js` + `dist/preload.js` | build outputs | ✓ VERIFIED | All four present after `npm run build:electron`. |

### Key Link Verification

| From | To | Via | Status |
| ---- | --- | --- | ------ |
| SummaryBar GP/SC edit | reducer | SET_EDIT `wallet.GoldPieces`/`wallet.SlayerCoins` (int64 string) | ✓ WIRED |
| BankPanel qty edit | reducer | SET_EDIT offset-free `BankItem.fieldKey` | ✓ WIRED |
| SkillPanel mode toggle | reducer | SET_EDIT one of `skill.<id>.level`/`.xp`; sibling cleared | ✓ WIRED |
| App preview | PreviewModal | `preview()` changeReport → modal rows (D-07 authoritative) | ✓ WIRED |
| Modal confirm | write | `onConfirm` → `write()` → native Save-As (main-owned) | ✓ WIRED |
| patchSave wallet write | header snapshot | `mirrorsOf()` lock-step mirror write | ✓ WIRED + TESTED |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| BROWSE-01 | Read-only save summary | ✓ SATISFIED | SummaryBar |
| BROWSE-02 | Browse bank items + quantities | ✓ SATISFIED | BankPanel + VirtualList |
| BROWSE-03 | Browse skills + XP/level | ✓ SATISFIED | SkillPanel + VirtualList |
| BROWSE-04 | Filter bank items as-you-type | ✓ SATISFIED | `matches()` + local filter |
| BROWSE-05 | Filter skills as-you-type | ✓ SATISFIED | `matches()` + local filter |
| EDIT-01 | Edit GP/SC (int64, Bank wallet, in-place) | ✓ SATISFIED | Wallet-targeted; header written as coupled mirror (see nit below) |
| EDIT-02 | Edit bank item quantity (int32) | ✓ SATISFIED | EditableCell + validateInt32 + fieldKey |
| EDIT-03 | Edit skill XP/Level consistently | ✓ SATISFIED | Level XOR xp, XP-table echo, reducer enforcement |
| SAFE-02 | Pending-changes preview + explicit confirm | ✓ SATISFIED | PreviewModal confirm gate |

### Behavioral Spot-Checks / Gates

| Check | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Core typecheck | `npm run typecheck` | clean (tsc --noEmit) | ✓ PASS |
| UI typecheck | `npm run typecheck:ui` | clean | ✓ PASS |
| Full test suite | `npm test` | 264 pass / 0 fail | ✓ PASS |
| Electron build | `npm run build:electron` | emits main.js + preload.js + renderer.js + renderer.css | ✓ PASS |
| Header-mirror coupling | `patcher.test.ts` currency↔mirror suite | mirror written to same value; non-currency edit → no mirror | ✓ PASS |

### Anti-Patterns Found

None. Scan of `electron/ui/**` and modified `src/patcher.ts`/`src/wallet-parser.ts` found no unreferenced TBD/FIXME/XXX/PLACEHOLDER debt markers or stub returns. (`placeholder` matches are the legitimate `BankItem.isPlaceholder` game flag, not stubs.)

### Notable (Info — non-blocking)

- **EDIT-01 wording nit:** REQUIREMENTS.md EDIT-01 still reads "not the cosmetic SaveHeader snapshot." The in-game acceptance proved the game reads the header GP/SC snapshot on load, so the header mirror MUST be written in lock-step with the authoritative wallet value (fix `4573e70`). The requirement's *intent* (wallet is authoritative, never the user's write target) is fully satisfied; only the parenthetical wording is now outdated. Recommend a doc-only wording refresh in a future pass — not a phase gap.

### Human Verification Required

None outstanding. The one inherently-human criterion (in-game load, criterion 5) was already performed and passed by the user ("approved"), including re-confirmation after the header-mirror fix.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and all 9 phase requirements (BROWSE-01..05, EDIT-01..03, SAFE-02) are satisfied in the delivered code, wired end-to-end (load → getModel → browse/filter → validated inline edit → authoritative preview → confirm → non-destructive write), and proven by green gates plus a passed mandatory manual in-game acceptance. The acceptance even hardened the core by surfacing and fixing the header-mirror coupling bug with regression coverage.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
