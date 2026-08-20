---
phase: 06-packaging-local-windows-nsis-installer
verified: 2026-07-18T11:42:57Z
status: passed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 6: Packaging — Local Windows NSIS Installer Verification Report

**Phase Goal:** A developer can turn the already-built esbuild output into an installable Windows `.exe`, and the installed app runs the full editor identically to the dev build.
**Verified:** 2026-07-18T11:42:57Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

This is a cross-platform-constrained packaging phase. The AUTOMATABLE slice (icon source asset, electron-builder config, package script, config/dist-layout/icon tests) was verified directly on this Linux host. The RUNTIME truths (the actual Windows `.exe`, per-user install, installed-app full loop, uninstall, icon-on-app) are Windows-only and were verified by a completed human manual gate (Plan 06-03) whose coverage entries carry `human_judgment: true, status: pass`. Per the phase's stated verification contract, those are treated as human-verified evidence, not as automatable checks to re-run and not as new human-verification items.

### Observable Truths

Merged from ROADMAP Success Criteria (4) and the three PLAN `must_haves.truths` blocks (deduplicated).

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Committed icon source is a valid image whose largest dimension is >=256 (clears electron-builder's icon floor) | ✓ VERIFIED (deviation) | `build/icon.png` (512x512 RGBA) committed; `test/packaging.icon.test.ts` passes (2/2), parses PNG signature + IHDR, asserts >=256x256. Deviation: source is `.png` not `.ico` — electron-builder 26.15 rejects `.ico` as icon-tool input; it generates the Windows `.ico` from the PNG at package time (commit ec7f5ab). Intent (valid source clearing the floor) holds. |
| 2 | `scripts/make-icon.mjs` regenerates the icon deterministically with zero npm deps | ✓ VERIFIED | Imports only `node:fs` + `node:zlib` (both builtins); `writeFileSync('build/icon.png', png)`; no npm dependency. |
| 3 | The icon asset is committed (not gitignored) so packaging on any machine finds it | ✓ VERIFIED | `git ls-files build/` → `build/icon.png`; `git check-ignore build/icon.png` → not ignored (exit 1). |
| 4 | `electron-builder.json` sets appId `com.jmptr.mv2-save-editor` and productName `MV2 Save Editor` | ✓ VERIFIED | Config keys present; `test/packaging.config.test.ts` asserts both. |
| 5 | `directories.output` is `release` (electron-builder never writes into esbuild's `dist/`) | ✓ VERIFIED | `electron-builder.json` `directories.output: "release"`; config test asserts; `.gitignore` line 87 ignores `release/`. |
| 6 | nsis block sets oneClick true, perMachine false, createStartMenuShortcut true (PKG-03) | ✓ VERIFIED | Config block present; config test asserts all three flags. |
| 7 | `files` includes `dist/**` and `package.json` so preload.js + index.html stay siblings of main.js in app.asar | ✓ VERIFIED | `files: ["dist/**", "package.json"]`; `test/packaging.dist-layout.test.ts` proves 4 dist siblings exist + config includes `dist/**`. |
| 8 | package.json version is 1.1.0 and lists electron-builder ^26 as a devDependency | ✓ VERIFIED | `version: "1.1.0"`, `devDependencies["electron-builder"]: "^26.15.3"`; config test asserts. |
| 9 | `npm run package` chains `build:electron && electron-builder` | ✓ VERIFIED | `"package": "npm run build:electron && electron-builder --win --config electron-builder.json"`; test asserts `build:electron`, `electron-builder`, and `--win`. `--win` added (commit 8aaa260) so it builds the Windows NSIS target regardless of host OS. |
| 10 | Default artifactName resolves to `MV2 Save Editor Setup 1.1.0.exe` (no custom template) | ✓ VERIFIED | No custom `artifactName`; config test derives `${productName} Setup ${version}.exe` === `MV2 Save Editor Setup 1.1.0.exe`. |
| 11 | `npm run package` on Windows produces `release/MV2 Save Editor Setup 1.1.0.exe` (PKG-01 runtime) | ✓ VERIFIED (human gate) | 06-03 coverage D1 `human_judgment: true, status: pass` — native-Windows build log `building target=nsis file=release\MV2 Save Editor Setup 1.1.0.exe oneClick=true perMachine=false`. |
| 12 | The installed app runs the full load → browse/search → edit → preview → write loop; output `.sav` not corrupt (PKG-02 runtime) | ✓ VERIFIED (human gate) | 06-03 coverage D2 pass — developer exercised the full loop; asar sibling resolution (preload.js/index.html) confirmed working; written `.sav` round-trips. |
| 13 | Install is per-user (no UAC), Start Menu shortcut, working uninstaller (PKG-03 runtime) | ✓ VERIFIED (human gate) | 06-03 coverage D3 pass — per-user install confirmed, Start Menu shortcut, clean uninstall. |
| 14 | The installed app shows its own application icon (PKG-04 runtime) | ✓ VERIFIED (human gate) | 06-03 coverage D3/summary — icon step (`icons-bundle.tar.gz`) passed on the real Windows build; installed app shows its icon. |

**Score:** 14/14 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/make-icon.mjs` | Zero-dep icon generator | ✓ VERIFIED | Emits `build/icon.png` from `node:fs`+`node:zlib` only. |
| `build/icon.png` | Committed >=256 icon source | ✓ VERIFIED | 512x512 RGBA, committed, not gitignored. (Was `build/icon.ico`; changed to `.png` per ec7f5ab.) |
| `build/icon.ico` | (superseded) | n/a | Intentionally removed — electron-builder generates `.ico` from the PNG at package time. |
| `electron-builder.json` | NSIS config encoding D-01..D-05 | ✓ VERIFIED | appId/productName/output=release/files/win.icon=build/icon.png/nsis flags all present. |
| `package.json` | v1.1.0 + package script + devDep | ✓ VERIFIED | version 1.1.0, `package`/`package:dir` scripts with `--win`, electron-builder ^26 devDep. |
| `.gitignore` | ignores `release/` | ✓ VERIFIED | Line 87 `release/`. |
| `test/packaging.config.test.ts` | pins config values | ✓ VERIFIED | Passes; asserts win.icon===build/icon.png and `--win` in package script. |
| `test/packaging.dist-layout.test.ts` | pins dist sibling layout | ✓ VERIFIED | Passes; 4 siblings exist + files ships `dist/**`. |
| `test/packaging.icon.test.ts` | pins icon >=256 floor | ✓ VERIFIED | Passes (2/2); parses PNG IHDR, asserts >=256x256 RGBA. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `electron-builder.json` win.icon | `build/icon.png` | asset path must match the committed icon | ✓ WIRED | `win.icon: "build/icon.png"` matches the committed asset; config test asserts equality. |
| `files: [dist/**, package.json]` | app.asar sibling layout | glob preserves path.join(__dirname,...) resolution | ✓ WIRED | dist-layout test proves siblings; manual gate confirmed installed app resolves preload.js/index.html. |
| `directories.output: release` | esbuild-owned `dist/` | separate output dir prevents collision | ✓ WIRED | output=release; `.gitignore` covers `release/`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Electron build produces dist/ | `npm run build:electron` | completes clean | ✓ PASS |
| Full test suite passes | `npm test` | 281 pass / 0 fail (281 total) | ✓ PASS |
| Typecheck clean | `npm run typecheck` | exit 0, no errors | ✓ PASS |
| Icon source clears 256 floor | `npx tsx --test test/packaging.icon.test.ts` | 2 pass / 0 fail | ✓ PASS |
| Defect-fix commits exist | `git log ec7f5ab 8aaa260 86441e9` | all three resolve | ✓ PASS |

### Probe Execution

No probes declared or present (`find scripts -path '*/tests/probe-*.sh'` → none). Step 7c: SKIPPED (no probes in project).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PKG-01 | 06-02, 06-03 | Build Windows NSIS installer via single npm script | ✓ SATISFIED | package script chains build:electron && electron-builder --win; config test derives installer name; manual gate produced the `.exe`. |
| PKG-02 | 06-02, 06-03 | Installed app runs full loop; asar resolves preload/index.html | ✓ SATISFIED | dist-layout test + `files:[dist/**]`; manual gate ran full loop, siblings resolved. |
| PKG-03 | 06-02, 06-03 | Start Menu shortcut + uninstaller + per-user, no admin | ✓ SATISFIED | nsis flags test; manual gate confirmed per-user install + shortcut + clean uninstall. |
| PKG-04 | 06-01, 06-02, 06-03 | Proper app icon, appId, product name, output to release/ | ✓ SATISFIED | appId/productName/output config test; icon test; manual gate confirmed app shows icon. Note: icon source `.png` (electron-builder generates `.ico` at package time) — documented deviation from the literal `.ico` wording. |

All four requirement IDs declared in PLAN frontmatter (PKG-01..PKG-04) are present in REQUIREMENTS.md and mapped to Phase 6. No orphaned requirements. REQUIREMENTS.md traceability marks all four Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `scripts/make-icon.mjs` | 1, 70 | "placeholder"/"throwaway" | ℹ️ Info | Deliberate throwaway monogram icon per design decision D-03 (swappable by replacing one file). Not a stub. |
| `test/packaging.icon.test.ts` | 24 | "placeholder icon source" | ℹ️ Info | Comment describing the intentional D-03 placeholder. Not a stub. |

No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified file. No blocking or warning anti-patterns.

### Human Verification Required

None outstanding. The Windows-only runtime truths (PKG-01/02/03/04 runtime) were verified by the completed Plan 06-03 manual gate (recorded `human_judgment: true, status: pass` for all coverage entries). No new human verification items are required.

### Gaps Summary

No gaps. Every observable truth is satisfied: the automatable slice (icon source, electron-builder config, package script, three pinning tests) verified directly on this host with `npm test` (281 pass) and `npm run typecheck` (clean); the Windows-only runtime slice verified by the completed human acceptance gate.

Two mid-phase defects were surfaced by the manual gate and fixed within the phase — both are reflected in the current, verified codebase state:
1. Icon source switched from `build/icon.ico` to `build/icon.png` (commit ec7f5ab) because electron-builder 26.15 rejects `.ico` as icon-tool input; the config, tests, and generator were all updated to match, and the Windows `.ico` is generated from the PNG at package time.
2. The `package`/`package:dir` scripts now pin `--win` (commit 8aaa260) so the Windows NSIS target is built regardless of host OS.

The only deviation from the literal must-have wording is the icon source format (`.png` vs `.ico`), which is an intentional, documented change that preserves the requirement's intent (the installed app ships and shows a proper Windows icon). No override entry is required since the delivered state satisfies the goal.

---

_Verified: 2026-07-18T11:42:57Z_
_Verifier: Claude (gsd-verifier)_
