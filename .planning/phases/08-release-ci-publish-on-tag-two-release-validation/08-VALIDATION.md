---
phase: 8
slug: release-ci-publish-on-tag-two-release-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` run via `tsx` (`test/**/*.test.ts`) |
| **Config file** | none — glob-driven; `c8` for coverage |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` + `npm run typecheck` |
| **Estimated runtime** | ~30 seconds |

*YAML is asserted as text (zero-dep), mirroring the existing `test/updater.packaging.test.ts` idiom. Do NOT add a YAML-parser dependency.*

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` + `npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green, then the real tag-push + two-release manual gate
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-xx | 01 | 1 | CI-01 | T-08-V14 | `npm ci` on `windows-latest` resolves `@esbuild/win32-x64` from the committed lockfile | unit (static) | `npm test` → lockfile-coverage assertion | ❌ W0 | ⬜ pending |
| 08-01-xx | 01 | 1 | CI-01 | — | `release.yml` triggers on `v*`, `runs-on: windows-latest`, Node 22, runs `build:electron` before packaging | unit (static) | `npm test` → `test/release.workflow.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-xx | 01 | 1 | CI-02 | T-08-V4 | workflow declares `permissions: contents: write` and passes `GH_TOKEN` via `env:` only (never echoed) | unit (static) | `npm test` → `test/release.workflow.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-xx | 01 | 1 | CI-03 | — | no `releaseType`/auto-publish override → electron-builder default draft; updater ignores drafts | unit (static) | `npm test` → `test/release.workflow.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-xx | 02 | 2 | CI-01/02 | — | a real `v*` tag push produces a draft GitHub Release carrying `.exe` + `latest.yml` + `.blockmap` | manual/CI-observed | push `v1.1.0`, inspect the draft Release assets | Manual gate | ⬜ pending |
| 08-02-xx | 02 | 2 | SC4 | T-08-V6 (accepted) | installed v1.1.0 client detects, downloads, and applies the published v1.1.1 update | manual (Windows) | two-release procedure (publish v1.1.0, install, publish v1.1.1, observe update) | Manual gate | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/release.workflow.test.ts` — static text-assertions over `.github/workflows/release.yml` (CI-01/02/03: `v*` trigger, `windows-latest`, Node 22, `build:electron` before packaging, `permissions: contents: write`, `GH_TOKEN` env, no forced-publish/`releaseType` override) **and** a `@esbuild/win32-x64` lockfile-coverage assertion over `package-lock.json`.

*No framework install needed — `node:test`/`tsx` already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tag push produces a draft Release with all 3 assets | CI-01/CI-02 (runtime) | Requires a real GitHub Actions run on `windows-latest` + repo write; cannot be observed from a static test | Bump `package.json.version`, commit, `git tag v<version>`, push the tag; inspect the created draft Release for `.exe` + `latest.yml` + `.blockmap` |
| Draft is invisible to the updater until manually published | CI-03 (runtime) | Requires an installed client polling the live feed | With a draft present, confirm an installed client does NOT update; after clicking Publish, it does |
| Installed v1.1.0 self-updates to v1.1.1 end-to-end | SC4 | Needs two sequential real published releases + a Windows client (mirrors 06-03 / 07-03) | Publish v1.1.0, install it; publish a v1.1.1 bump; observe the installed client detect → download → apply on relaunch |

---

## Validation Sign-Off

- [ ] All automatable tasks have `<automated>` verify or Wave 0 dependencies (workflow-config + lockfile-coverage static test)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`test/release.workflow.test.ts`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] Runtime-only truths (tag→draft→assets, two-release update) are explicitly captured as manual gates — not silently dropped
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
