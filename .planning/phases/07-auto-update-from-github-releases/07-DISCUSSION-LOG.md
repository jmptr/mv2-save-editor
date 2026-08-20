# Phase 7: Auto-Update from GitHub Releases - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 7-Auto-Update from GitHub Releases
**Areas discussed:** Update-ready notification, Check cadence, Failure visibility, Logging dependency

---

## Update-Ready Notification (UPD-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Built-in `checkForUpdatesAndNotify()` | One electron-updater call does the launch check + native OS toast on download-complete; zero UI code, generic wording | ✓ |
| Custom `Notification` on `update-downloaded` | ~10 lines to control the message text; still no renderer | |

**User's choice:** Built-in `checkForUpdatesAndNotify()`
**Notes:** In-app update UI is deferred (UPDUX-01/02), so both options were OS-level. Chose the least-maintenance built-in; generic wording acceptable for a solo tester.

---

## Check Cadence (UPD-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Launch-only | Check once, shortly after window ready; matches UPD-01 | ✓ |
| Launch + periodic | Also re-check on an interval (e.g. every 6h) for long sessions | |

**User's choice:** Launch-only
**Notes:** The save editor is typically opened briefly to make edits, so a per-launch check catches updates in practice with the least machinery.

---

## Failure Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Silent + logged | Swallow the updater error event / promise rejection, write to log only; never interrupt editing | ✓ |
| Notify on failure | Also surface a notification when an update fails | |

**User's choice:** Silent + logged
**Notes:** Self-update is best-effort; a failed check (offline / GitHub down / rate-limited) must be invisible mid-edit. "Notify on failure" risked nagging on every offline launch.

---

## Logging Dependency

| Option | Description | Selected |
|--------|-------------|----------|
| Zero-dep file logger | `autoUpdater.logger` → tiny `fs`-based writer into `app.getPath('logs')`; no new dep | ✓ |
| `electron-log` | electron-updater's recommended logger (levels/rotation); new runtime dep | |
| Console-only | No logger wiring; invisible in a packaged app | |

**User's choice:** Zero-dep file logger
**Notes:** Matches the project's zero-dep pattern (hand-rolled icon). Keeps electron-updater as the only new runtime dependency this phase adds; still yields a diagnosable `updater.log` on the user's machine. electron-log noted as a fallback if diagnostics outgrow a plain log file.

---

## Claude's Discretion

- Seam placement (inline in `electron/main.ts` vs a small `electron/updater.ts` helper).
- Exact updater-log filename/format under `app.getPath('logs')`; whether to log `update-available`/`download-progress` breadcrumbs.
- The exact `electron-updater` version pin (compatible with electron-builder `26.x`).
- Keeping electron-updater defaults `autoDownload: true` / `autoInstallOnAppQuit: true` (they already match UPD-01/UPD-02).

## Deferred Ideas

- In-app update UI (progress bar, release notes) — UPDUX-01/02.
- Manual "Check for updates" menu item — UPDUX-03.
- "Restart now to apply" prompt — UPDUX-04 (install-on-quit chosen).
- Periodic in-session re-check cadence — considered, deferred (launch-only chosen).
- `electron-log` — considered for logging, set aside for the zero-dep logger.
- CI publish-on-tag (`latest.yml` + assets, draft-then-publish) — Phase 8.
