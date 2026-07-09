---
phase: 6
slug: packaging-local-windows-nsis-installer
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `06-RESEARCH.md` § "Validation Architecture" + the three PLAN.md task maps.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict`, run via `tsx --test` (NOT Vitest — CLAUDE.md's stack note is stale; the repo's actual `test` script is `tsx --test 'test/**/*.test.ts'`) |
| **Config file** | none — glob-driven (`test/**/*.test.ts`); `c8` for coverage |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` + `npm run typecheck` (dist-layout test also needs `npm run build:electron` first) |
| **Estimated runtime** | ~30 seconds (config/asset/layout assertions; no Wine, no electron-builder binaries) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run build:electron && npm test && npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds
- **Phase gate:** all automated assertions green **plus** the manual Windows install-and-run acceptance (PKG-01/02/03 runtime, Plan 06-03) recorded as a verification note. The Windows manual gate is the equivalent of v1.0's mandatory in-game load and is **not** blockable on the Linux host (electron-builder needs absent Wine).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PKG-04 | T-06-01 | N/A | unit (TDD RED) | `npm test 2>&1 \| grep -q "packaging.icon"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | PKG-04 | T-06-01 / T-06-03 | Zero-dep in-repo ICO writer (no `png-to-ico`/`sharp`) | unit | `node scripts/make-icon.mjs && npm test` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | PKG-01/02/03/04 | T-06-SC / T-06-01 | Blocking-human electron-builder legitimacy gate before install | manual (checkpoint) | `<human-check>` (not auto-approvable) | N/A | ⬜ pending |
| 06-02-02 | 02 | 1 | PKG-01/03/04 | T-06-01 / T-06-03 / T-06-04 | Pinned `electron-builder@^26`; lockfile committed; lean `files` | unit | `node -e "…assert appId/productName/output/nsis/version/script/devDep…"` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | PKG-01/02/03/04 | — | Config drift pinned by test | unit | `npm run build:electron && npm test && npm run typecheck` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | PKG-01/02/03 | T-06-02 / T-06-05 | Unsigned/SmartScreen accepted & documented; asar sibling-resolution launch check | manual (Windows) | `<human-check>` — build+install+full-loop+uninstall on Windows | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/packaging.icon.test.ts` — parses `build/icon.ico` ICONDIR/ICONDIRENTRY, asserts a ≥256×256 entry (PKG-04). Created in Plan 06-01.
- [ ] `test/packaging.config.test.ts` — `require()`s `electron-builder.json` + `package.json`; asserts appId/productName/`directories.output=release`/nsis flags/version `1.1.0`/`electron-builder` devDep, and derives `MV2 Save Editor Setup 1.1.0.exe` (PKG-01/03/04). Created in Plan 06-02.
- [ ] `test/packaging.dist-layout.test.ts` — after `build:electron`, asserts `dist/{main,preload,renderer}.js` + `index.html` co-exist as siblings and `files` includes `dist/**` (asar sibling-layout proxy; PKG-01/02 automatable slice). Created in Plan 06-02.

*Config chosen as `electron-builder.json` (not `.yml`) specifically so tests `require()` it with zero extra deps — closing the RESEARCH "Wave 0 Gaps" YAML-parser gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run package` produces `release/MV2 Save Editor Setup 1.1.0.exe` | PKG-01 | electron-builder needs Wine (absent on Linux host) to run rcedit + makensis | On Windows: `npm ci` then `npm run package`; confirm the artifact in `release/` and that esbuild's `dist/` is untouched |
| Installed app runs the full load→browse/search→edit→preview→write loop identically to dev; written `.sav` is not corrupt | PKG-02 | Runtime behavior of the packaged asar; analogue of v1.0's mandatory in-game load | Install the `.exe`, exercise the full loop, write to a NEW file, re-load it to confirm no corruption. A blank window / "index.html not found" = broken asar sibling resolution (RESEARCH Pitfall 2) |
| Per-user install (no UAC), Start Menu shortcut, working uninstaller | PKG-03 | Windows installer runtime behavior | Double-click the `.exe`; confirm no admin prompt, shortcut created, then uninstall cleanly |
| Installed app shows its own `build/icon.ico` | PKG-04 (runtime) | Only observable on an installed Windows app | Launch installed app; confirm window/taskbar icon is the MV2 mark, not default Electron |
| SmartScreen "unknown publisher" on first launch | — | Accepted unsigned-build behavior (REQUIREMENTS Out-of-Scope) | Documented, not a defect — click through (T-06-02) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit manual/checkpoint gate (Wave 0 dependencies noted)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (the two manual gates are the documented Windows/legitimacy checkpoints, not silent gaps)
- [x] Wave 0 covers all MISSING references (three `test/packaging.*.test.ts` files)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09
