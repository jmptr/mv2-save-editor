# Feature Research

**Domain:** Self-updating, GitHub-Releases-distributed **Windows Electron app** (packaging/distribution for MV2 Save Editor v1.1)
**Researched:** 2026-07-09
**Confidence:** HIGH (electron-builder NSIS + electron-updater are mature, stable, well-documented; defaults verified against current docs)

> **Scope note — who the "user" is.** This is a *personal* tool for one early-access tester who both **ships** the release and **installs** it. That reframes table stakes: the bar is "the installer runs, the app self-updates without me babysitting it, and the one-time SmartScreen wall is a known click-through" — not the polished, trust-building install experience a mass-market app needs. Anything whose entire payoff is *building trust with strangers* or *managing a large user base* (reputation farming, staged rollouts, multi-channel, download analytics) is over-engineering here. This file classifies the four question areas (install/download, auto-update, versioning/release, provenance) into Table Stakes / Differentiator / Anti-feature for **this** context.

## Feature Landscape

Self-updating desktop apps (VS Code, Obsidian, GitHub Desktop, Discord — all Electron/Squirrel/NSIS-class) share a well-worn convention set: an OS-native installer that drops Start Menu + desktop shortcuts and registers an uninstaller; a background updater that checks on launch, downloads silently, and applies the update on the next quit; and semver-driven release feeds. electron-builder (NSIS target) + electron-updater implement essentially all of this **out of the box with sane defaults**, which is why the table-stakes tier below is mostly "accept the default and wire ~10 lines," and the effort budget should go toward *not breaking the update feed* rather than building UI.

The one hard wall unique to this milestone is **shipping unsigned**: Windows SmartScreen shows a "Windows protected your PC / unknown publisher" interstitial on first run, and — critically — an **unsigned** binary's SmartScreen reputation "must build anew with every update, starting from zero, and cannot transfer between versions." Reputation only accrues from *hundreds of clean installs across a wide audience over weeks* — which a solo tool will never generate. So for this project the SmartScreen prompt is **permanent and unavoidable**, the correct response is to **document the click-through** (More info → Run anyway), and any attempt to *mitigate* it without a certificate is wasted effort (an anti-feature). This is decided (`unsigned` per PROJECT.md); the research just confirms the consequence.

### Table Stakes (Users Expect These)

Missing any of these means "the installer/updater is broken." Nearly all are electron-builder/electron-updater **defaults** — the work is configuration + wiring, not building.

| Feature | Why Expected | Complexity | Notes / Dependency on existing app |
|---------|--------------|------------|-------|
| **NSIS installer `.exe` (oneClick)** | Double-click → installed app; the whole point of packaging | LOW | electron-builder `win`+`nsis` target. `oneClick:true` (default): per-user install to `%LOCALAPPDATA%\Programs\mv2-save-editor`, **no UAC/elevation**, no wizard, auto-launch on finish. Fastest path; recommended for solo use. Needs a `build` block in `package.json` (appId, productName, publish) + an app **`.ico`** asset. |
| **Start Menu shortcut** | Users launch from Start Menu | LOW | NSIS default (`createStartMenuShortcut:true`). Free. |
| **Desktop shortcut** | Convention; expected for a daily-use tool | LOW | NSIS default (`createDesktopShortcut:true`). Free; keep on. |
| **Uninstaller + Add/Remove Programs entry** | Users expect to cleanly remove it | LOW | NSIS generates this automatically. Free. |
| **SmartScreen click-through is documented** | First run is blocked by "unknown publisher"; user must know it's expected | LOW | *Documentation only.* Unsigned ⇒ prompt is permanent (reputation can't build at solo scale). Add a one-line "click More info → Run anyway" note to README/release notes. No code. |
| **Check-for-update on launch** | Self-updating means the app finds new versions itself | LOW | `autoUpdater.checkForUpdatesAndNotify()` (or `checkForUpdates()`) in main after `app.whenReady()`. **New main-process module** `electron/updater.ts`. Depends on `electron-updater` dependency. |
| **Background download of the update** | User shouldn't have to manually fetch installers | LOW | `autoDownload` **defaults to `true`** — happens automatically after `update-available`. Zero extra code. |
| **Apply update on quit (silent)** | Update lands without a disruptive mid-session restart | LOW | `autoInstallOnAppQuit` **defaults to `true`** — downloaded update installs on next app quit. This is the zero-UX happy path; **no renderer changes needed**. |
| **Minimal update notification** | User should know an update was applied/available | LOW | `checkForUpdatesAndNotify()` fires a **native OS notification** on `update-downloaded` for free. Surface **`error`** to a log. That's the minimum viable UX — no custom UI. |
| **semver in `package.json` drives the feed** | The updater compares versions to decide "newer exists" | LOW | Bump `version` (currently `1.0.0`) per release. electron-updater compares packaged version vs `latest.yml`. Requires **release discipline**, not code. |
| **App knows its own version** | Needed to compare against the feed + show in UI/about | LOW | `app.getVersion()` returns the packaged `package.json` version. Built in. |
| **Release contains installer + `latest.yml` (+ `.blockmap`)** | The updater **cannot work** without the `latest.yml` manifest | LOW | `electron-builder --publish` uploads `*-Setup-x.y.z.exe`, **`latest.yml`** (version/URL/sha512 manifest), and **`.exe.blockmap`** (enables automatic differential download). All auto-generated. Missing `latest.yml` = silent no-updates. |
| **GitHub Releases as the update feed** | Chosen distribution channel | LOW | `build.publish` = `{ provider: "github", owner: "jmptr", repo: "mv2-save-editor" }`. electron-updater reads releases from this repo. (CI publish handled by CI-* reqs.) |

### Differentiators (Competitive Advantage)

Genuinely nicer UX, but **not required** for a working self-updater. Each is optional polish; defer unless cheap and wanted.

| Feature | Value Proposition | Complexity | Notes / Dependency |
|---------|-------------------|------------|-------|
| **"Restart to apply now" prompt** | Lets the tester apply an update immediately instead of waiting for next quit | MEDIUM | `dialog.showMessageBox` on `update-downloaded` → `autoUpdater.quitAndInstall()`. Main-process only if using native dialog; renderer UI if in-app. Small but real added code + a decision (native dialog vs in-window banner). |
| **Manual "Check for updates" menu item** | Tester can force a check instead of waiting for launch — handy when validating a fresh release | LOW | App menu item → `autoUpdater.checkForUpdates()`. Needs a `Menu` (app currently has none). Nice for *this* user since they ship + verify their own releases. |
| **In-app update status / progress** | Shows checking / downloading (`download-progress` %) / ready in-window | MEDIUM | Requires new **IPC channel** + preload exposure (`contextBridge`) + a small React component. Adds a renderer surface the zero-UX path avoids. Defer. |
| **Release notes shown on update** | "What changed in this version" surfaced to the user | MEDIUM | electron-updater exposes `updateInfo.releaseNotes` (from the GitHub release body). Needs UI to display + **discipline to write release bodies**. Low code, real content cost. |
| **Assisted installer (choose install dir / per-machine)** | Wizard with directory + per-user/per-machine choice | LOW–MED | `oneClick:false` + `allowToChangeInstallationDirectory:true`. Config only, but adds install ceremony (and possibly UAC) with **near-zero value for a solo install** — arguably an anti-feature here. Listed as a differentiator only because some users expect a wizard. |
| **"About" box showing version** | Quick "am I on the latest?" check | LOW | `app.getVersion()` in a small dialog/menu item. Trivial; nice-to-have. |

### Anti-Features (Commonly Requested, Often Problematic)

These look like "proper distribution" but are pure over-engineering for a one-person tool. Explicitly **out of scope** to prevent scope creep.

| Feature | Why Requested | Why Problematic (here) | Alternative |
|---------|---------------|-----------------------|-------------|
| **SmartScreen reputation building / warming** | "Make the scary warning go away" | Unsigned reputation resets **every version** and needs *hundreds of installs from a wide audience over weeks* — mathematically unreachable at solo scale. Effort with zero payoff. | Accept the prompt; document the click-through. (Real fix = code signing, which is deferred.) |
| **Code signing / EV cert / notarization** | Removes SmartScreen; "professional" | Explicitly deferred for v1.1 (PROJECT.md `unsigned`). Cert cost + CI secret handling + signing pipeline for an audience of one. | Deferred to a later milestone if the tool is ever distributed. |
| **Staged / percentage rollouts** (`stagingPercentage`) | "Roll out safely to % of users" | There is exactly one user. Meaningless. | Ship 100% every release. |
| **Multi-channel (stable/beta/alpha)** (`allowPrerelease`, channels) | "Separate test track" | The whole app *is* the test track; the user controls both ends. Extra `.yml` channels + config to maintain. | Single `latest` channel. Bump semver per release. |
| **Custom delta/differential update engine** | "Faster small updates" | The `.blockmap` already gives automatic differential download for free — building more is redundant complexity. | Keep the auto `.blockmap`; do nothing. |
| **Self-hosted / custom update server** | "Own the feed" | GitHub Releases is the chosen, zero-infra feed and it works with the built-in `github` provider. | `publish: github`. |
| **Forced / mandatory update gating** ("you must update to continue") | "Ensure everyone's current" | User is the maintainer; forcing themselves is pointless friction, and a bad update could lock them out. | Silent install-on-quit (default). |
| **Auto-rollback / A-B version pinning** | "Recover from a bad update" | Reinstalling a prior GitHub Release `.exe` is a 30-second manual recovery for one person. | Keep old release `.exe`s on GitHub; reinstall if needed. |
| **Download counts / update analytics dashboards** | "Track adoption" | No audience to measure. | Ignore; GitHub shows raw asset download counts if ever curious. |
| **macOS / Linux installers** | "Cross-platform" | Windows-only is decided; adds signing/notarization/target matrix. | Deferred (PROJECT.md). |

## Feature Dependencies

```
[semver bump in package.json]
    └──drives──> [latest.yml version manifest]
                     └──required by──> [electron-updater check-on-launch]
                                            ├──requires──> [main-process updater module (electron/updater.ts)]
                                            │                   └──requires──> [electron-updater dependency]
                                            └──requires──> [Release assets: .exe + latest.yml + .blockmap]
                                                               └──produced by──> [electron-builder NSIS target + build.publish=github]
                                                                                      └──requires──> [app .ico + build config block]

[NSIS oneClick installer] ──produces──> [Start Menu + desktop shortcut + uninstaller]  (all defaults, free)

[in-app update UI] ──requires──> [new IPC channel + preload bridge + React component]   (differentiator only)
[restart-to-apply prompt] ──enhances──> [check-on-launch]
[release notes on update] ──requires──> [GitHub release body discipline]

[unsigned build] ──causes──> [permanent SmartScreen prompt]  (mitigation = documentation only)
[electron-updater] ──conflicts with──> [dev run `electron .`]  (updater only works in a PACKAGED app)
```

### Dependency Notes

- **Updater requires a packaged app.** electron-updater does **not** run under `npm start` / `electron .` — testing the update flow means building installers and publishing (or pointing at a local/dev feed). This affects the phase's verification approach: acceptance requires an actual installed build checking a real GitHub Release.
- **The zero-UX path needs no renderer changes.** `checkForUpdatesAndNotify()` + native notification lives entirely in main (`electron/updater.ts`, wired in `app.whenReady()` after `createWindow()`). Any *in-app* status/progress/release-notes UI is what pulls in new IPC + preload + React surface — that's the boundary between table stakes and differentiators.
- **`latest.yml` is the single point of failure.** If CI publishes the `.exe` but not `latest.yml`, the updater silently finds nothing. The release-asset set (`.exe` + `latest.yml` + `.blockmap`) must be treated as atomic. `electron-builder --publish always/onTag` guarantees it.
- **Config lives in `package.json` (or `electron-builder.yml`).** Needs `build.appId`, `build.productName`, `build.win.target=nsis`, `build.nsis` options, `build.publish=github`, and an icon path. `main` stays `dist/main.js`; electron-builder packages the esbuild output.
- **Version is the contract between all four areas.** `package.json version` → embedded via `app.getVersion()` → compared against `latest.yml` → matches the git tag CI builds from. One bump drives the whole feed.

## MVP Definition

### Launch With (v1.1) — the minimum viable self-updating installer

- [ ] **NSIS `oneClick` installer** with Start Menu + desktop shortcut + uninstaller — the deliverable
- [ ] **App icon (`.ico`)** + `build` config block (appId, productName, `win`/`nsis`, `publish: github`)
- [ ] **Main-process updater module** (`electron/updater.ts`): `checkForUpdatesAndNotify()` on launch, `autoDownload`/`autoInstallOnAppQuit` defaults, native notification on `update-downloaded`, `error` logged
- [ ] **semver bump discipline** + `app.getVersion()` — version drives the feed
- [ ] **Release asset set**: `.exe` + `latest.yml` + `.blockmap` published to GitHub Releases (couples to CI-* reqs)
- [ ] **README/release-notes note** documenting the SmartScreen "More info → Run anyway" click-through

### Add After Validation (v1.x) — once the update loop is proven working

- [ ] **Manual "Check for updates" menu item** — cheap, genuinely useful for a self-shipping tester (trigger: first time you want to force-verify a release without relaunching)
- [ ] **"Restart to apply now" prompt** — trigger: waiting-for-quit feels too slow in practice
- [ ] **"About" box showing current version** — trigger: you keep wondering which build you're on

### Future Consideration (v2+) — only if the tool is ever distributed to others

- [ ] **Code signing / SmartScreen removal** — trigger: real external users
- [ ] **In-app update progress + release-notes UI** — trigger: updates get large enough that silent background feels opaque
- [ ] **macOS/Linux targets, multi-channel** — trigger: cross-platform or a real beta program emerges

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| NSIS oneClick installer (+ shortcuts + uninstaller) | HIGH | LOW | P1 |
| Check-on-launch + background download + install-on-quit | HIGH | LOW | P1 |
| Minimal native update notification + error logging | MEDIUM | LOW | P1 |
| semver feed + `latest.yml`/`.blockmap` release assets | HIGH | LOW | P1 |
| GitHub `publish` config + app icon + build block | HIGH | LOW | P1 |
| SmartScreen click-through documentation | MEDIUM | LOW | P1 |
| Manual "Check for updates" menu item | MEDIUM | LOW | P2 |
| "Restart to apply now" prompt | MEDIUM | MEDIUM | P2 |
| "About" box / version display | LOW | LOW | P2 |
| Release notes shown on update | LOW | MEDIUM | P3 |
| In-app update progress UI | LOW | MEDIUM | P3 |
| Assisted installer (dir choice) | LOW | LOW | P3 |
| SmartScreen reputation / signing / staged rollout / multi-channel | LOW–NONE | HIGH | Anti (drop) |

**Priority key:** P1 = must have for v1.1 · P2 = should have, add when convenient · P3 = nice to have / defer · Anti = explicitly out of scope

## Reference Convention Analysis

How mature self-updating desktop apps behave, and what this project should copy vs skip.

| Behavior | VS Code / GitHub Desktop (Squirrel) | Obsidian / Discord-class | Our approach (v1.1) |
|----------|-------------------------------------|--------------------------|---------------------|
| Install experience | Silent/oneClick, per-user, no UAC | oneClick, shortcuts + uninstaller | **Copy:** NSIS `oneClick`, per-user, shortcuts + uninstaller |
| Update check | On launch + periodic background | On launch | **Copy launch-check; skip periodic** (relaunch-driven is fine for a tester) |
| Apply update | Silent on quit, optional "restart to update" | Silent on quit + banner | **Copy:** install-on-quit default; "restart now" prompt deferred to P2 |
| Update UI | Rich (progress, release notes) | Banner + notes | **Skip for v1.1:** native notification only; rich UI is P3 |
| Signing | Fully signed | Signed | **Skip (unsigned):** document SmartScreen click-through |
| Channels | Stable/Insiders | Stable/beta | **Skip:** single `latest` channel |

## Sources

- [autoUpdater / electron-updater — event & option reference](https://www.electron.build/electron-updater.class.appupdater) — confirms `autoDownload` (default **true**), `autoInstallOnAppQuit` (default **true**), events `checking-for-update` / `update-available` / `update-not-available` / `download-progress` / `update-downloaded` / `error`, and `checkForUpdatesAndNotify()`. HIGH
- [Electron `autoUpdater` docs](https://www.electronjs.org/docs/latest/api/auto-updater) — update lifecycle + `quitAndInstall()` semantics. HIGH
- [electron-builder NSIS options](https://www.electron.build/nsis.html) — `oneClick` (default true), `allowToChangeInstallationDirectory` (default false, assisted-only), `createDesktopShortcut`/`createStartMenuShortcut` defaults, per-user vs per-machine, uninstaller generation. HIGH
- [electron-builder NsisOptions interface](https://www.electron.build/app-builder-lib.Interface.NsisOptions.html) — full option list incl. `stagingPercentage`, assisted config. HIGH
- [Microsoft Learn — SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) — **unsigned reputation resets every version, starts at zero, cannot transfer**; only signing lets reputation accrue. HIGH
- [My-SSL — how SmartScreen publisher reputation works](https://my-ssl.com/learn/windows-smartscreen-publisher-reputation) — reputation needs broad download history over weeks; "More info → Run anyway" click-through. MEDIUM
- [electron-builder AppUpdater.ts source](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/AppUpdater.ts) — authoritative event/option defaults. HIGH
- Project files: `.planning/PROJECT.md` (v1.1 milestone: NSIS + electron-updater + GitHub Actions, **unsigned**), `package.json` (`version: 1.0.0`, `main: dist/main.js`), `electron/main.ts` (existing hardened window + `app.whenReady()` wiring seam for the updater module). HIGH

---
*Feature research for: Windows Electron app packaging + self-update distribution (MV2 Save Editor v1.1)*
*Researched: 2026-07-09*
