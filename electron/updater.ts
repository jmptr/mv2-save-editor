// electron/updater.ts — the packaged-only auto-update seam (D-01..D-05, D-08).
//
// Two exports, kept deliberately small and failure-isolated:
//   • createFileLogger(logDir) — a ZERO-DEP fs logger (D-04: no electron-log) satisfying
//     electron-updater's Logger interface (info/warn/error required, debug optional). Every write is
//     wrapped in a try/catch that swallows — logging must NEVER throw into the updater (D-03).
//   • initAutoUpdater() — sets that logger, attaches the REQUIRED error trap, and fires the single
//     launch check via checkForUpdatesAndNotify() (D-01/D-02/D-08).
//
// Zero-dep rationale (D-04, mirrors scripts/make-icon.mjs): the TOP-LEVEL imports are ONLY the
// node: builtins `appendFileSync` (node:fs) and `join` (node:path). `electron` and `electron-updater`
// are obtained via LAZY require INSIDE initAutoUpdater() — that keeps createFileLogger importable in
// isolation (the unit test runs with no Electron runtime) and preserves the dev-inert contract (D-05 /
// UPD-03): nothing here loads electron-updater unless main.ts calls initAutoUpdater() behind its
// `app.isPackaged` guard.
//
// Failure isolation (D-03 / T-07-04): an emitted `error` event with NO listener throws an uncaught
// exception, so `autoUpdater.on('error', …)` is mandatory; the `.catch()` on the check promise is the
// second, separate channel (offline / feed-404 / rate-limited resolves to "carry on"). The Releases
// feed does not exist until Phase 8 — a logged feed-404 here is EXPECTED, not a failure (T-07-05).
//
// Covers UPD-01 (launch check + background download), UPD-02 ("update ready" notify + install-on-quit
// via defaults), UPD-03 (inert in dev).

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** The minimal logger shape electron-updater expects (info/warn/error required, debug optional). */
export interface FileLogger {
  info(message?: unknown): void;
  warn(message?: unknown): void;
  error(message?: unknown): void;
  debug(message?: unknown): void;
}

/**
 * Zero-dep fs logger satisfying electron-updater's Logger interface (D-04). Appends timestamped,
 * level-tagged lines to `join(logDir, 'updater.log')`. Every write is wrapped in a try/catch whose
 * catch body does nothing — logging must never throw into the updater (D-03), so an unwritable path
 * degrades to a silent no-op rather than crashing the launch check.
 */
export function createFileLogger(logDir: string): FileLogger {
  const logPath = join(logDir, 'updater.log');
  const write = (level: string, msg: unknown): void => {
    try {
      appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${String(msg)}\n`);
    } catch {
      /* logging must never throw into the updater (D-03) */
    }
  };
  return {
    info: (msg?: unknown) => write('info', msg),
    warn: (msg?: unknown) => write('warn', msg),
    error: (msg?: unknown) => write('error', msg),
    debug: (msg?: unknown) => write('debug', msg),
  };
}

/**
 * Initialise the packaged-app auto-updater (D-01/D-02/D-03/D-08). Loads `electron` and
 * `electron-updater` via LAZY require so this module stays importable without an Electron runtime and
 * loads electron-updater ONLY when actually called (main.ts calls it behind `app.isPackaged` — D-05).
 *
 * Wires the zero-dep logger, attaches the REQUIRED `error` listener (an unhandled error event throws —
 * T-07-04), optional log-only breadcrumbs, and fires the single launch check. `autoDownload` and
 * `autoInstallOnAppQuit` are left at their `true` defaults (D-08) — background download + install on
 * quit are exactly the desired behavior, so no override.
 */
export function initAutoUpdater(): void {
  // Lazy require (NOT a top-level import): keeps dev strictly inert and the module Electron-free.
  const { app } = require('electron') as typeof import('electron');
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

  const logger = createFileLogger(app.getPath('logs'));
  autoUpdater.logger = logger;

  // REQUIRED (D-03 / T-07-04): an emitted `error` event with no listener throws an uncaught exception.
  autoUpdater.on('error', (err: unknown) => {
    logger.error?.(err instanceof Error ? (err.stack ?? err.message) : String(err));
  });

  // Log-only diagnostics breadcrumbs (Claude's discretion — no user surface, D-03).
  autoUpdater.on('update-available', (info: unknown) => {
    logger.info?.(`update-available ${String((info as { version?: string })?.version ?? '')}`);
  });
  autoUpdater.on('update-downloaded', (info: unknown) => {
    logger.info?.(`update-downloaded ${String((info as { version?: string })?.version ?? '')}`);
  });

  // The single launch check (D-01/D-02): check + background download + native "update ready" notify.
  // The `.catch()` is the second failure channel (D-03) — offline/feed-404/rate-limited → carry on.
  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    logger.error?.(err instanceof Error ? (err.stack ?? err.message) : String(err));
  });
}
