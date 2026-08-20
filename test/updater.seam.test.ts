// test/updater.seam.test.ts — static source proof that the updater seam is dev-inert and dual-trapped.
//
// This is an any-OS, no-Electron test: it reads electron/main.ts and electron/updater.ts as TEXT and
// asserts the structural contract that guarantees UPD-03 / D-05 / D-03, since the runtime behavior only
// manifests in a packaged Windows build (proven in Plan 07-03):
//   • main.ts guards the seam with `app.isPackaged` and reaches `./updater` ONLY via a lazy
//     `require('./updater')` — there is NO top-level (module-scope, unindented) import/require of
//     `./updater`, so dev runs never even load electron-updater (D-05 / UPD-03).
//   • updater.ts wires BOTH failure channels of D-03: an `autoUpdater.on('error', …)` listener (an
//     unhandled error event throws — T-07-04) AND a `.catch(` on the check-promise.
//
// Covers UPD-03 / D-05 / D-03 at the source/static level. Harness: node:test via tsx (matches the repo).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const electronDir = join(__dirname, '..', 'electron');
const mainSrc = readFileSync(join(electronDir, 'main.ts'), 'utf8');
const updaterSrc = readFileSync(join(electronDir, 'updater.ts'), 'utf8');

test('main.ts guards the updater seam behind app.isPackaged (D-05 / UPD-03)', () => {
  assert.match(mainSrc, /if\s*\(\s*app\.isPackaged\s*\)/, 'must guard with `if (app.isPackaged)`');
  assert.match(mainSrc, /require\(['"]\.\/updater['"]\)/, 'must reach ./updater via a lazy require');
});

test('main.ts has NO top-level (module-scope) import/require of ./updater (UPD-03)', () => {
  // A top-level import would be unindented at column 0; the sanctioned require lives inside the guard.
  assert.doesNotMatch(
    mainSrc,
    /^import[^\n]*['"]\.\/updater['"]/m,
    'no module-top `import ... from "./updater"` — it would load electron-updater in dev',
  );
  assert.doesNotMatch(
    mainSrc,
    /^(const|let|var)[^\n]*require\(['"]\.\/updater['"]\)/m,
    'no module-top `require("./updater")` — the require must be inside the app.isPackaged guard',
  );
});

test('updater.ts wires BOTH D-03 failure channels (on("error") + .catch)', () => {
  assert.match(
    updaterSrc,
    /autoUpdater\.on\(\s*['"]error['"]/,
    'must attach autoUpdater.on("error", …) — an unhandled error event throws (T-07-04)',
  );
  assert.match(updaterSrc, /\.catch\(/, 'must .catch() the checkForUpdatesAndNotify() promise (D-03)');
});
