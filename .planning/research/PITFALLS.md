# Pitfalls Research

**Domain:** Packaging an existing esbuild-based Electron 43 app into an UNSIGNED, self-updating Windows NSIS installer published via GitHub Actions (electron-builder + electron-updater + Actions publish-on-tag)
**Researched:** 2026-07-09
**Confidence:** HIGH (electron-builder/electron-updater behavior verified against official docs + issue tracker; esbuild CI behavior verified against esbuild issues; grounded in this repo's actual package.json / main.ts)

> Scope note: This milestone (v1.1) adds **packaging + auto-update + CI** on top of a working v1.0 app. Nothing here touches the parser/patcher core. The pitfalls below are specific to the exact combination the user chose — **unsigned** + **electron-updater** + **GitHub Actions** on a repo whose build is a **custom esbuild script** (`scripts/build.mjs` → `dist/main.js`), `type: "commonjs"`, `main: "dist/main.js"`, with an `allowScripts` esbuild postinstall gate. Generic "how to use Electron" advice is deliberately omitted.

---

## Critical Pitfalls

### Pitfall 1: `electron-updater` placed in `devDependencies` → pruned out of the package → runtime crash

**What goes wrong:**
The app packages successfully, installs fine, launches on the dev machine from source — but the **installed** build throws `Cannot find module 'electron-updater'` (or silently never checks for updates) on first launch for real users. Auto-update is dead on the exact builds that ship.

**Why it happens:**
electron-builder **prunes `devDependencies`** out of the packaged `app.asar` (it only ships production `dependencies`). Because electron-updater is a build-adjacent tool, people reflexively `npm i -D electron-updater`. This repo already has the anti-pattern shape: `electron` and `esbuild` are correctly in `devDependencies`, so it's natural to drop electron-updater next to them — but electron-updater runs **inside the shipped main process at runtime**, so it must be a production `dependency`.

**How to avoid:**
`npm i electron-updater` (NOT `-D`). Verify it lands in `"dependencies"` in package.json alongside `react`/`react-dom`. After a test package, confirm the module physically exists inside the asar (`npx asar list release/.../app.asar | grep electron-updater`).

**Warning signs:**
Packaged app opens but never updates; DevTools/main-process log shows `MODULE_NOT_FOUND: electron-updater`; `dependencies` block has no electron-updater.

**Phase to address:**
Auto-update integration phase (the phase that adds the updater call to `electron/main.ts`) — make "electron-updater is in `dependencies`" an explicit success criterion.

---

### Pitfall 2: Assuming unsigned auto-update simply "won't work" on Windows — or conversely assuming it's silently secure

**What goes wrong:**
Two opposite failure modes:
(a) The team assumes an unsigned app *can't* auto-update on Windows and wastes the milestone chasing a code-signing cert that was explicitly out of scope. In reality **electron-updater DOES apply updates for a fully unsigned NSIS app on Windows** — when there is no publisher certificate, the signature-match check is effectively skipped, so updates flow.
(b) The team assumes "it updates, therefore it's verified." It is **not**. For an unsigned app there is no Authenticode signature to validate, so electron-updater falls back to matching the file against the SHA512 in `latest.yml` only. That is integrity-vs-the-feed, not authenticity — anyone who can control the release feed can serve an arbitrary installer. (Historically the Windows verifier has also swallowed `Get-AuthenticodeSignature` errors and proceeded — issue #4701.)

The important contrast: **macOS HARD-REQUIRES signing for auto-update** (Squirrel.Mac rejects unsigned updates). Windows/NSIS does not. Since this milestone is Windows-only + unsigned, updates will work — but with weaker guarantees.

**Why it happens:**
People generalize the well-known macOS "signing is mandatory for updates" rule to Windows. The rules genuinely differ per platform.

**How to avoid:**
Accept and document the tradeoff (already a stated milestone decision). Do **not** set `verifyUpdateCodeSignature` / `publisherName` expectations that assume a cert. Rely on the HTTPS GitHub Releases feed + `latest.yml` SHA512 as the integrity boundary, and note in the repo that authenticity is unverified until signing is added. Do not attempt macOS builds this milestone — they'd hit the hard signing wall.

**Warning signs:**
Time being spent on `.pfx`/cert config; `Error: New version X is not signed by the application owner` (that specific error only appears when the app *is* signed but the update's publisher name doesn't match — it should NOT appear for a genuinely unsigned build; if it does, a stray `publisherName`/cert crept into config).

**Phase to address:**
Auto-update integration phase — encode "unsigned Windows update path validated" and a one-line security note in the milestone docs.

---

### Pitfall 3: CI publishes to a **draft** release — updater sees nothing until a human clicks "Publish"

**What goes wrong:**
The Actions run succeeds, the `.exe` + `latest.yml` + `.blockmap` appear on GitHub, but installed clients **never see the update**. electron-updater's GitHub provider ignores **draft** releases entirely; it only reads the latest *published* (non-draft, non-prerelease unless configured) release.

**Why it happens:**
electron-builder's default GitHub publish behavior creates a **draft** release (intentionally, so you can review before going live). Teams tag, watch CI go green, and assume "published." It's sitting as a draft.

**How to avoid:**
Decide the release-visibility model explicitly: either (a) leave `releaseType: draft` and add a manual "Publish release" step to the process, or (b) set publish to release automatically. Document which. Also make sure `prerelease` semantics match your tag scheme — a `v1.1.0-beta.1` tag can land as a prerelease that stable clients won't pull unless `allowPrerelease` is set.

**Warning signs:**
Release page shows a "Draft" badge; clients on the prior version never prompt to update even though assets exist; updater logs `No published versions on GitHub`.

**Phase to address:**
CI publish phase — the workflow definition and the release-promotion runbook.

---

### Pitfall 4: `version` / tag / `latest.yml` mismatch → updater can't resolve or downgrade-loops

**What goes wrong:**
Any of: (a) `package.json` `version` not bumped, so the new release has the *same* version as installed → no update offered, or an install↔update version confusion; (b) the git tag (`v1.1.0`) disagrees with `package.json` (`1.0.0` — the repo's current value) → the release name and the embedded app version diverge and clients compare against the wrong number; (c) `latest.yml` references a filename that doesn't match the uploaded `.exe` (renamed artifact, `artifactName` template changed) → updater 404s on download; (d) the `.blockmap` is missing → differential download fails / falls back noisily.

**Why it happens:**
Version lives in three places (package.json, git tag, latest.yml) and they're maintained by different steps (human bump, human tag, electron-builder generation). electron-builder derives the app version from `package.json`, not the tag — so a tag without a matching bump is the classic trap. This repo is currently at `"version": "1.0.0"`; the first packaging tag must move it.

**How to avoid:**
Single source of truth = `package.json` `version`. Make the workflow **derive or verify** the tag from it (fail the build if `v$npm_package_version` ≠ pushed tag). Let electron-builder generate `latest.yml` and upload it in the *same* run that built the `.exe` — never hand-edit `latest.yml` or re-upload a renamed exe. Ship the `.blockmap` alongside.

**Warning signs:**
Updater logs `Cannot parse latest.yml` / `404` on the exe URL; "update available" fires but download fails; the same version appears to update forever (loop) because embedded version < feed version due to a missed bump.

**Phase to address:**
CI publish phase (tag↔version guard) + packaging config phase (`artifactName`/latest.yml/blockmap consistency).

---

### Pitfall 5: GitHub Actions `GITHUB_TOKEN` lacks `contents: write` and/or electron-builder can't see `GH_TOKEN`

**What goes wrong:**
The build compiles, then the **publish** step fails with `HttpError: 403` / `Resource not accessible by integration`, or electron-builder logs `GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"` and skips upload. Green-ish build, no release assets.

**Why it happens:**
Two independent requirements, both easy to miss: (1) the default `GITHUB_TOKEN` is **read-only** for `contents` in modern repos, so the job needs `permissions: contents: write`; (2) electron-builder reads the token from the **`GH_TOKEN`** (or `GITHUB_TOKEN`) **env var** at the publish step — it must be explicitly passed through `env:`; it is not picked up automatically just because the secret exists.

**How to avoid:**
In the workflow: add `permissions:` `contents: write` (job or top level), and on the electron-builder step set `env:` `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. The built-in `GITHUB_TOKEN` is sufficient — no PAT needed for same-repo releases.

**Warning signs:**
`403 Resource not accessible by integration`; `GH_TOKEN is not set`; release assets never appear despite a successful compile step.

**Phase to address:**
CI publish phase — the workflow's `permissions:` and step `env:` are explicit success criteria.

---

### Pitfall 6: electron-builder does NOT run the esbuild build — packaging a stale or empty `dist/`

**What goes wrong:**
electron-builder packages whatever is currently in `dist/`. If the workflow (or a local run) invokes `electron-builder` **without first running `node scripts/build.mjs`**, it ships stale output — or, on a clean CI checkout where `dist/` doesn't exist yet, an app with **no `main.js`** → the installed app fails to start / white screen.

**Why it happens:**
People coming from `electron-vite` / Forge expect the packager to invoke the bundler. It does not — electron-builder only *packages*. This repo's build is a **separate custom step** (`build:electron` → `scripts/build.mjs`), so the ordering must be wired by hand: build → then package.

**How to avoid:**
Explicit ordered steps: `npm ci` → `npm run build:electron` → `electron-builder --win --publish always` (or a `dist`/`pack` npm script that chains them). Add `dist/` to `.gitignore` if not already and never rely on a committed build. Optionally gate with electron-builder `beforeBuild`/`beforePack` hook to run the esbuild step so it can't be skipped.

**Warning signs:**
Installed app shows a blank/white window; main-process log `Cannot find module 'dist/main.js'` or `ERR_FILE_NOT_FOUND` for `index.html`; the packaged asar is suspiciously tiny.

**Phase to address:**
Packaging config phase (define the build→package chain) and CI publish phase (enforce step order).

---

### Pitfall 7: electron-builder `files` globs miss the esbuild output / `index.html` / preload → white screen

**What goes wrong:**
App installs and launches to a **blank white window**, or DevTools shows `Failed to load resource: index.html` / preload not found. The renderer bundle, `index.html`, or `preload.js` didn't make it into the asar because the `files` allowlist didn't include the esbuild output layout.

**Why it happens:**
`main.ts` does `win.loadFile(join(__dirname, 'index.html'))` and `preload: join(__dirname, 'preload.js')` — everything is expected co-located with `dist/main.js`. If `files` in electron-builder config only lists `dist/main.js` (or a default that doesn't match where `scripts/build.mjs` actually emits `index.html`/`preload.js`/renderer assets), those siblings are silently excluded. electron-builder's default `files` also assumes conventional layouts; a custom esbuild output dir can fall outside it.

**How to avoid:**
Confirm exactly what `scripts/build.mjs` emits (main.js, preload.js, index.html, renderer JS/CSS) and set electron-builder `files` to include the whole emitted `dist/**`. After packaging, **list the asar contents** and verify `index.html` + `preload.js` + renderer assets are present. Keep `main` (`dist/main.js`) and the loadFile/preload paths consistent with the packaged layout.

**Warning signs:**
White screen on launch; `ERR_FILE_NOT_FOUND` for index.html; preload IPC (the `save:*` bridge) is undefined so every button no-ops; `asar list` shows main.js but not its siblings.

**Phase to address:**
Packaging config phase — asar content verification is a success criterion. This is high-risk because it produces a *silent* broken app that still "installs fine."

---

### Pitfall 8: `npm ci` on the Windows runner is missing esbuild's Windows platform binary (cross-platform lockfile) or is blocked by the postinstall/allow-scripts gate

**What goes wrong:**
CI on `windows-latest` fails at build time with esbuild's classic `You installed esbuild for another platform than the one you're currently using` / `Cannot find module '@esbuild/win32-x64'`, or the postinstall that fetches the binary never runs (if `--ignore-scripts` is used) and the same error appears.

**Why it happens:**
Two distinct triggers, both live in this exact repo:
(1) **Cross-platform lockfile.** Dev happens on Linux/macOS; `package-lock.json` may only record the dev platform's `@esbuild/*` optional package. On `windows-latest`, `npm ci` installs strictly from the lockfile → the `@esbuild/win32-x64` optional dep isn't listed → esbuild has no Windows binary. esbuild 0.28 delivers its binary via **optional dependencies**, so the lockfile must contain all needed OS/CPU variants.
(2) **Postinstall / allow-scripts gate.** This repo has an `allowScripts` block (`"esbuild@0.28.1": true`) — a `@lavamoat/allow-scripts`-style gate. If CI runs `npm ci --ignore-scripts` (a common hardening default) or the allow-scripts wrapper isn't invoked in CI, esbuild's install step that materializes the binary is skipped.

**How to avoid:**
Regenerate the lockfile so it records **all** optional platform variants (or ensure the Windows variant is present), and commit it. In CI, run the same install path that works locally — if using `@lavamoat/allow-scripts`, run `allow-scripts` in CI too; if relying on the plain postinstall, don't add `--ignore-scripts`. As a belt-and-suspenders option, run the esbuild build step and let any missing-binary error fail fast and loud *before* electron-builder.

**Warning signs:**
CI log: `You installed esbuild for another platform`, `Cannot find module '@esbuild/win32-x64'`, `Expected "0.28.1" but got ...`; build step exits non-zero only on the Windows runner while local Linux/mac builds pass.

**Phase to address:**
CI publish phase — pin/verify the lockfile's platform coverage and the install command; this is the single most likely reason the *first* CI run goes red.

---

### Pitfall 9: Calling the updater in dev / unpackaged runs → `app-update.yml` not found, throws or no-ops

**What goes wrong:**
Running `npm start` (`electron .`) with the updater wired in throws `Error: ENOENT ... dev-app-update.yml` or `app-update.yml is missing`, or the updater silently no-ops and gives false confidence that "it works." The updater cannot function from an unpackaged app because `app-update.yml` (the embedded feed config) only exists inside a packaged build's resources.

**Why it happens:**
electron-builder writes `app-update.yml` into the packaged app's `resources/` at pack time. In dev there's no such file. Developers wire `autoUpdater.checkForUpdatesAndNotify()` unconditionally at the top of `app.whenReady()` and hit it immediately on the next `npm start`.

**How to avoid:**
Guard the updater with `app.isPackaged` — only call `checkForUpdates*` when packaged. For deliberate dev testing of the update flow, add a `dev-app-update.yml` and set `autoUpdater.forceDevUpdateConfig = true`, but treat that as a debugging aid, not the acceptance path. In this repo, the guard slots into `app.whenReady().then(...)` in `electron/main.ts` right beside `registerIpcHandlers()`.

**Warning signs:**
`npm start` throws on launch after adding the updater; `dev-app-update.yml not found`; update logic "runs" in dev but never actually contacts GitHub.

**Phase to address:**
Auto-update integration phase — `app.isPackaged` guard is a success criterion.

---

### Pitfall 10: First-release chicken-and-egg — you cannot validate auto-update with only one release

**What goes wrong:**
The team ships `v1.1.0`, installs it, and expects to "see the auto-update work" — but there's nothing to update *from* or *to*. The very first published release only ever **installs**; auto-update is unobservable until a **second, higher** version is published and a client running the first one checks in. Teams declare the updater "done" without ever exercising the actual update code path.

**Why it happens:**
Auto-update inherently needs a *previous* published release as the baseline. With a single release, `checkForUpdates` correctly finds "you're current" and does nothing — indistinguishable from a broken updater.

**How to avoid:**
Plan the validation as **two sequential releases**: publish `v1.1.0`, install it, then publish `v1.1.1` (even a trivial bump) and confirm the installed `v1.1.0` detects, downloads, and applies it. Only then is the update path proven. Budget this two-release dance into the milestone's acceptance step.

**Warning signs:**
"Updater works" claimed with exactly one release in existence; no evidence of a download/`update-downloaded` event ever firing on a real client.

**Phase to address:**
Auto-update validation / milestone acceptance phase — explicitly a two-release test.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Ship unsigned (no Authenticode cert) | Zero cost, no cert procurement, milestone stays small | SmartScreen "unknown publisher" on every new build; update authenticity unverified (feed-trust only); AV false positives | **Acceptable for v1.1** (explicit decision, single trusted user); revisit before any public distribution |
| Hand-editing `latest.yml` or re-uploading a renamed `.exe` | Quick fix for a naming slip | Breaks updater download resolution; every future release must repeat the hack | **Never** — let electron-builder generate + upload atomically |
| Committing a `dist/` build to the repo to "skip the build step in CI" | CI is simpler | Stale/wrong bundle ships; drift between source and shipped app | **Never** — build in CI |
| Leaving `releaseType: draft` without a documented publish step | Human review gate before go-live | Updates silently never reach clients (Pitfall 3) if the publish click is forgotten | Acceptable **only** with a written release runbook |
| `--ignore-scripts` in CI for "security" without adjusting esbuild | Blocks arbitrary postinstall code | esbuild binary never materializes → build fails (Pitfall 8) | Acceptable only if lockfile already carries the platform binary via optional deps |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Releases (publish) | Relying on the secret existing; not passing `GH_TOKEN` env to the electron-builder step | Set `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the publish step |
| GitHub Actions permissions | Default read-only `GITHUB_TOKEN` | Add `permissions: contents: write` to the job/workflow |
| GitHub Releases (consume/updater) | Draft or prerelease invisible to the GitHub provider | Publish the release (non-draft); align tag/prerelease semantics |
| electron-updater feed config | `publish` block in electron-builder config not pointing at `jmptr/mv2-save-editor` | Set `publish: { provider: 'github', owner: 'jmptr', repo: 'mv2-save-editor' }` so `app-update.yml` embeds the right feed |
| esbuild native binary | Cross-platform lockfile missing `@esbuild/win32-x64` on the Windows runner | Ensure lockfile records all optional OS/CPU variants; install without stripping optional deps |

## Performance Traps

Patterns that work at small scale but fail as usage grows. (Low relevance — single-user tool; included only where it touches update mechanics.)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Missing `.blockmap` disables differential download | Full-installer re-download every update; noisy fallback in logs | Ship the `.blockmap` electron-builder generates alongside the `.exe` | Every update (bandwidth only; harmless for one user, still avoid) |
| Update check on every launch with no error handling | A rate-limit/offline failure blocks or delays launch | Wrap the check so failure is non-fatal; log and continue | Only matters if GitHub is unreachable — still handle it |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating "update applied" as "update authenticated" (unsigned) | Feed compromise could serve an arbitrary installer; no Authenticode check to stop it | Document the unsigned tradeoff; keep the feed on HTTPS GitHub Releases; add signing before public distribution |
| Weakening the existing renderer hardening while adding update UI | Reintroducing an RCE surface into a previously locked-down app | Keep `contextIsolation:true` / `sandbox:true` / `nodeIntegration:false` (already set in `main.ts`); run update logic in **main**, surface status to renderer only via the existing narrow IPC bridge pattern |
| Loading remote content for an "update available" banner | Breaks the loadFile-only, no-remote-navigation guarantees in `main.ts` | Render update UI from local assets; never `loadURL` remote; keep `setWindowOpenHandler(deny)` + `will-navigate` prevention intact |
| PAT with broad scope stored as a secret for publishing | Over-privileged token leak | Use the built-in `GITHUB_TOKEN` with `contents: write` only — no PAT needed for same-repo releases |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent auto-install + relaunch mid-edit | User loses an in-progress save edit when the app restarts to apply an update | Use `autoUpdater.autoInstallOnAppQuit` / prompt before `quitAndInstall`; don't force-relaunch while a save is open/unsaved |
| No feedback on "checking / downloading / up-to-date" | User can't tell if updates work; assumes app is stale | Surface `update-available` / `download-progress` / `update-downloaded` events to a small status indicator |
| SmartScreen "unknown publisher" with no user guidance | First-run friction; user may abandon install thinking it's malware | Document the "More info → Run anyway" step in the release notes / README for the unsigned installer |
| Per-machine install forcing a UAC prompt unexpectedly | Elevation prompt surprises a user who just wanted a personal tool | Prefer NSIS per-user install (`perMachine: false`, `oneClick` choice deliberate) to avoid elevation |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Packaged app launches:** Often missing renderer assets — verify the installed app shows the real UI (not a white screen) and the `save:*` IPC bridge is defined.
- [ ] **Auto-update wired:** Often missing `dependencies` placement — verify `electron-updater` is a production dependency and physically inside `app.asar`.
- [ ] **CI publishes:** Often missing `permissions: contents: write` + `GH_TOKEN` env — verify assets (`.exe`, `latest.yml`, `.blockmap`) actually appear on the Release, not just a green build.
- [ ] **Release is consumable:** Often left as a **draft** — verify the release is published (not draft/prerelease) so the updater can see it.
- [ ] **Update path proven:** Often only one release exists — verify a **second** release is detected + applied by a client on the first (two-release test).
- [ ] **Version integrity:** Often the tag ≠ `package.json` version — verify `package.json` was bumped off `1.0.0` and the tag matches.
- [ ] **Dev safety:** Often the updater fires in dev — verify `npm start` doesn't throw / the `app.isPackaged` guard is present.
- [ ] **Icon present:** Often missing `.ico` — verify the installer + exe carry the app icon (else default Electron icon ships).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| electron-updater in devDependencies (shipped without it) | LOW | Move to `dependencies`, bump version, publish a new release; existing clients can't auto-update to the fix and must reinstall manually |
| Broken `latest.yml` / renamed exe on a published release | LOW–MEDIUM | Delete the bad assets, re-run the publish job to regenerate `latest.yml` + `.exe` + `.blockmap` atomically; never hand-patch |
| Released as draft, clients not updating | LOW | Click "Publish release" (or fix workflow to publish); clients pick it up on next check |
| Tag ≠ version mismatch already published | MEDIUM | Delete tag+release, bump `package.json`, re-tag matching, re-publish; avoid reusing a version number clients already installed |
| White-screen packaged app shipped | MEDIUM | Fix `files` globs / build ordering, bump version, publish; if auto-update itself works, clients self-heal on next release; if the broken build also broke the updater, manual reinstall required |
| First CI run red (esbuild platform binary) | LOW | Regenerate lockfile with platform variants / fix install command; re-run — no release consequences (nothing published yet) |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. (Phase names are suggestions for the roadmapper — the natural split is **packaging config → auto-update integration → CI publish → validation**.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P1 electron-updater in devDependencies | Auto-update integration | `dependencies` contains electron-updater; present in `app.asar` |
| P2 unsigned update assumptions | Auto-update integration | Unsigned Windows update applies; no stray cert/publisherName config; tradeoff documented |
| P3 draft release invisible | CI publish | Release is published (non-draft); documented promotion step |
| P4 version/tag/latest.yml mismatch | Packaging config + CI publish | Tag == `v$npm_package_version` guard; electron-builder generates latest.yml+blockmap in one run |
| P5 Actions token/permissions | CI publish | `permissions: contents: write` + `GH_TOKEN` env; assets appear on Release |
| P6 electron-builder doesn't run esbuild | Packaging config + CI publish | Ordered steps: build → package; non-empty, current asar |
| P7 files globs miss renderer/preload | Packaging config | `asar list` shows index.html + preload.js + renderer assets; no white screen |
| P8 esbuild platform binary / allow-scripts in CI | CI publish | Windows runner build passes; lockfile carries `@esbuild/win32-x64` |
| P9 updater fires in dev | Auto-update integration | `npm start` doesn't throw; `app.isPackaged` guard present |
| P10 first-release chicken-and-egg | Validation / milestone acceptance | Two-release test: v1.1.0 client applies v1.1.1 |

## Windows-Specific Notes (P11 — bundled minor pitfalls)

Lower-severity but Windows/NSIS + unsigned specific; fold into the packaging config phase.

- **Missing `.ico`:** electron-builder needs a `build/icon.ico` (256×256 multi-res). Without it the installer/exe ship the generic Electron icon. Warning sign: default Electron atom icon on the taskbar.
- **App name / product name with spaces:** "MV2 Save Editor" is fine as `productName`, but keep `appId` reverse-DNS (e.g. `com.jmptr.mv2saveeditor`) and be aware the install dir/shortcut use `productName`. A missing/changed `appId` breaks update identity continuity between versions.
- **Per-user vs per-machine elevation:** per-machine NSIS install triggers a UAC elevation prompt; for a personal tool prefer per-user (`perMachine: false`) to avoid it. Decide `oneClick` vs assisted installer deliberately.
- **Antivirus / SmartScreen false positives on unsigned NSIS:** unsigned installers commonly trip SmartScreen "unknown publisher" and occasional AV heuristics. Nothing *breaks*, but the user must click "More info → Run anyway." Document this; reputation only accrues with signing.

## Sources

- [electron-builder — GitHub Actions CI/CD](https://www.electron.build/docs/features/github-actions/) — `permissions: contents: write` + `GH_TOKEN` env requirements. HIGH
- [electron-builder — Publish](https://www.electron.build/publish.html) — latest.yml generation, draft/release behavior, GitHub provider. HIGH
- [electron-builder issue #4176 — Support GITHUB_TOKEN provided by GitHub Actions](https://github.com/electron-userland/electron-builder/issues/4176) — built-in token suffices; env passthrough. HIGH
- [electron-builder issue #5636 — GitHub publisher doesn't require a PAT](https://github.com/electron-userland/electron-builder/issues/5636) — no PAT needed for same-repo. MEDIUM
- [electron-builder issue #4701 — Update installed even though signature verification fails](https://github.com/electron-userland/electron-builder/issues/4701) — Windows verifier can proceed on error; unsigned updates apply. MEDIUM
- [electron-builder issue #1900 — "New version is not signed by the application owner"](https://github.com/electron-userland/electron-builder/issues/1900) — that error is a *signed*-app publisherName mismatch, not the unsigned path. MEDIUM
- [Doyensec — Signature Validation Bypass Leading to RCE in electron-updater](https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html) — unsigned/feed-trust weakness, integrity-vs-authenticity. HIGH
- [electron-builder issue #1505 — dev-app-update.yml not found](https://github.com/electron-userland/electron-builder/issues/1505) / [#4233 — app-update.yml is missing](https://github.com/electron-userland/electron-builder/issues/4233) — updater no-op/throw in dev; `app.isPackaged` guard. HIGH
- [esbuild issue #789 — Different strategy for installing platform-specific binaries](https://github.com/evanw/esbuild/issues/789) — optional-dependency platform binaries; cross-platform lockfile trap. HIGH
- [esbuild — Getting Started (install script behavior)](https://esbuild.github.io/getting-started/) — postinstall / `--ignore-scripts` implications. HIGH
- In-repo `package.json` — electron 43 + esbuild 0.28 in devDependencies, `allowScripts` esbuild gate, `main: dist/main.js`, `version: 1.0.0`, `build:electron` custom script. HIGH (direct observation)
- In-repo `electron/main.ts` — `app.whenReady()` wiring, hardened BrowserWindow, `loadFile`/`preload` co-located paths (informs P7/P9). HIGH (direct observation)

---
*Pitfalls research for: unsigned self-updating Windows NSIS packaging of an existing esbuild Electron 43 app via GitHub Actions*
*Researched: 2026-07-09*
