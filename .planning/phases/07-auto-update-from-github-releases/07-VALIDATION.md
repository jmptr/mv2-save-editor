---
phase: 7
slug: auto-update-from-github-releases
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` § Validation Architecture. Much of this phase's
> correctness is only observable **after packaging** (electron-updater physically
> in `app.asar`) or **across two published releases** (Phase 8), so the strategy
> splits into cross-platform static assertions (the green gate) and packaged/Windows
> manual gates.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` run via `tsx` (VERIFIED: `package.json` `"test": "tsx --test 'test/**/*.test.ts'"`) |
| **Config file** | none — glob-driven; `c8` for coverage |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` + `npm run typecheck` |
| **Estimated runtime** | ~<30 seconds (static config/seam assertions) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + `npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite green, **plus** the manual packaged checks recorded on the build host
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner (`{plan}-{task}`); the requirement → test-type → command
> mapping below is the basis each task's `<automated>` verify must satisfy.

| Requirement | Behavior | Test Type | Automated Command (any OS) | File Exists |
|-------------|----------|-----------|----------------------------|-------------|
| UPD-03 / D-06 | electron-updater is in `dependencies`, NOT `devDependencies` | unit | assert `package.json.dependencies['electron-updater']` set && absent from `devDependencies` | ❌ W0 |
| UPD-01/02 / D-06 | esbuild `external[]` includes `electron-updater` | unit | read `scripts/build.mjs`; assert `external` contains `'electron'` and `'electron-updater'` | ❌ W0 |
| UPD-03 / D-05 | updater seam guarded by `app.isPackaged`, not called at top level | unit | static/AST assert: `electron/main.ts` calls init only inside an `app.isPackaged` branch | ❌ W0 |
| D-03 | an `error` listener is attached (no-throw safety) | unit | static assert `electron/updater.ts` registers `autoUpdater.on('error', …)` AND `.catch(` on the check | ❌ W0 |
| D-07 | `electron-builder.json` publish resolves to github/jmptr/mv2-save-editor | unit | parse `electron-builder.json`; assert `publish[0]` = `{provider:'github', owner:'jmptr', repo:'mv2-save-editor'}` | ❌ W0 |
| D-04 | logger object satisfies the Logger interface (info/warn/error present) | unit | import logger factory from `electron/updater.ts`; assert `{info,warn,error}` functions write to a tmp path | ❌ W0 |
| UPD-03 | dev/unpackaged run is inert — no `updater.log`, no throw | integration (dev) | harness with `app.isPackaged=false`; assert no `updater.log` and no throw | ❌ W0 (may be manual) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/updater.packaging.test.ts` — electron-updater in `dependencies` (not devDeps); `scripts/build.mjs` `external` includes `electron-updater`; `electron-builder.json` `publish` block correct (covers D-06/D-07 + success criterion 4 static slice)
- [ ] `test/updater.seam.test.ts` — static/AST assertions that `main.ts` gates init behind `app.isPackaged`, and `updater.ts` attaches `on('error')` + `.catch` (covers UPD-03/D-03/D-05)
- [ ] `test/updater.logger.test.ts` — imports the logger factory, writes to a tmp `logs` dir, asserts `info/warn/error` produce lines and never throw (covers D-04)

*`node:test`/`tsx` infrastructure already exists — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| electron-updater physically inside `app.asar` (not pruned) | Success criterion 4 | packaging runs on Windows/CI (inherits Phase 6 Wine constraint) | `npx asar list release/win-unpacked/resources/app.asar \| grep node_modules/electron-updater` on the build host |
| packaged app launches; editor loop works; `updater.log` written; logged feed-404 non-blocking (feed absent until Phase 8) | UPD-01/02/03 | requires an installed Windows build | install/run app, confirm load→browse→edit→preview→write loop; confirm `updater.log` exists under `app.getPath('logs')` |
| newer published release downloads + notifies + installs on quit | UPD-01/02 (end-to-end) | needs two sequential published Releases | **Deferred to Phase 8** two-release validation — NOT a Phase 7 blocker |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
