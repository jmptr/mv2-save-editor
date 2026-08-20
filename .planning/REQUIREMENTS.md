# Requirements: MV2 Save Editor — v1.1 Packaging & Distribution

**Defined:** 2026-07-09
**Core Value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the editor must always produce a `.sav` the game can load without corruption.
**Milestone goal:** Produce a downloadable, self-updating Windows installer, published automatically to GitHub Releases.

## v1.1 Requirements

Requirements for the Packaging & Distribution milestone. Each maps to exactly one roadmap phase.

### Packaging (PKG)

- [x] **PKG-01**: Developer can build a Windows NSIS installer (`.exe`) locally from the existing esbuild output via a single npm script (electron-builder packages the built `dist/`; it does not rebuild the TypeScript)
- [x] **PKG-02**: The installed app launches and runs the full load → browse/search → edit → preview → write loop identically to the dev build (the packaged asar resolves `preload.js` and `index.html` correctly)
- [x] **PKG-03**: The installer creates a Start Menu shortcut and a working uninstaller, and installs per-user without requiring admin elevation (`oneClick: true`, `perMachine: false`)
- [x] **PKG-04**: The app ships with a proper application icon (`.ico`), an `appId`, and a product name, and electron-builder output goes to `release/` (not the esbuild-owned `dist/`)

### Auto-Update (UPD)

- [x] **UPD-01**: On launch, a packaged app checks the GitHub Releases feed and downloads a newer published version in the background
- [x] **UPD-02**: A downloaded update is installed when the app quits, and the user sees an "update ready" notification beforehand
- [x] **UPD-03**: The updater is inert in dev/unpackaged runs — guarded by `app.isPackaged`, it never errors during `npm start` or `electron .`

### Release CI (CI)

- [x] **CI-01**: Pushing a `v*` version tag triggers a GitHub Actions workflow that builds the Windows installer on `windows-latest` (Node 22, `npm run build:electron` before packaging)
- [x] **CI-02**: The workflow publishes the installer + `latest.yml` + `.blockmap` as assets on the matching GitHub Release, so the auto-updater feed resolves (workflow has `permissions: contents: write` and passes `GH_TOKEN`)
- [x] **CI-03**: The release is created as a draft and published manually — a safe gate, since the auto-updater ignores drafts until they are published

## v2 Requirements

Deferred beyond v1.1. Tracked but not in the current roadmap.

### Distribution (DIST)

- **DIST-01**: macOS packaging (`.dmg`) with notarization
- **DIST-02**: Linux packaging (AppImage / `.deb`)
- **DIST-03**: Code signing (Windows Authenticode / Apple Developer ID) to remove SmartScreen/Gatekeeper warnings

### Update UX (UPDUX)

- **UPDUX-01**: In-app update UI — download progress bar and status surfaced in the renderer
- **UPDUX-02**: Release notes shown to the user when an update is available
- **UPDUX-03**: A manual "Check for updates" menu item
- **UPDUX-04**: "Restart now to apply" prompt instead of install-on-quit

## Out of Scope

Explicitly excluded for v1.1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| macOS / Linux installers | Windows-only this milestone; user runs Windows. Cross-platform deferred to v2 (DIST-01/02) |
| Code signing / notarization | No certs; shipping unsigned is acceptable for a personal tool. SmartScreen click-through is documented, not defeated |
| In-app update UI (progress, release notes) | Native OS notification via `checkForUpdatesAndNotify()` is enough for a solo tester; renderer/IPC surface deferred (UPDUX-01/02) |
| Manual "Check for updates" menu item | Check-on-launch covers the need; app has no menu yet. Deferred (UPDUX-03) |
| Delta / staged / multi-channel updates, download analytics | Over-engineering for a single-user tool; electron-updater defaults suffice |
| SmartScreen reputation warming | Unreachable at solo scale (reputation resets every unsigned build); futile effort |

## Traceability

Which phases cover which requirements. Phase assignments populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 6 | Complete |
| PKG-02 | Phase 6 | Complete |
| PKG-03 | Phase 6 | Complete |
| PKG-04 | Phase 6 | Complete |
| UPD-01 | Phase 7 | Complete |
| UPD-02 | Phase 7 | Complete |
| UPD-03 | Phase 7 | Complete |
| CI-01 | Phase 8 | Complete |
| CI-02 | Phase 8 | Complete |
| CI-03 | Phase 8 | Complete |

**Coverage:**

- v1.1 requirements: 10 total
- Mapped to phases: 10 ✓ (Phase 6: PKG-01..04 · Phase 7: UPD-01..03 · Phase 8: CI-01..03)
- Unmapped: 0

---
*Requirements defined: 2026-07-09 after v1.1 milestone questioning + packaging research*
*Last updated: 2026-07-09 after roadmap creation — all 10 requirements mapped to Phases 6-8*
