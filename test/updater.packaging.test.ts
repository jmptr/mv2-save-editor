// test/updater.packaging.test.ts — pins the electron-updater packaging wiring.
//
// Covers the static (any-OS) slice of:
//   UPD-01 / UPD-02: electron-updater ships inside app.asar and reads a deterministic feed
//   D-06: electron-updater is a production dependency AND kept external by esbuild, so it resolves
//         from node_modules at runtime instead of being bundled (dynamic requires + app-update.yml)
//   D-07: the GitHub-Releases provider resolves deterministically to github/jmptr/mv2-save-editor
//   Success criterion 4 (static slice): electron-updater physically in app.asar + in esbuild external
// These values must never silently drift from the acceptance bar, so they are asserted directly
// against the committed config (Pitfall 3: devDeps are pruned from app.asar; Pitfall 5: feed drift).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import builderConfig from '../electron-builder.json';
import pkg from '../package.json';

test('electron-updater is a production dependency, not a devDependency (D-06 / Pitfall 3)', () => {
  const range = pkg.dependencies['electron-updater'];
  assert.ok(range, 'electron-updater must be listed under dependencies');
  assert.match(
    range,
    /\^?6\./,
    'electron-updater must be pinned to a ^6-compatible range (^6.8.9, not the 7.0.0-alpha next tag)',
  );
  // devDependencies are pruned from app.asar; a misplacement silently breaks the runtime require.
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  assert.equal(
    devDeps?.['electron-updater'],
    undefined,
    'electron-updater must NOT be in devDependencies (would be pruned from app.asar)',
  );
});

test('electron-builder.json publish block pins the GitHub feed (D-07 / Pitfall 5)', () => {
  assert.deepEqual(builderConfig.publish[0], {
    provider: 'github',
    owner: 'jmptr',
    repo: 'mv2-save-editor',
  });
});

test('scripts/build.mjs keeps electron-updater external in esbuild (D-06 / success criterion 4)', () => {
  // build.mjs is an .mjs config — read it as text rather than importing (it runs a build on import).
  const buildScript = readFileSync(join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8');
  assert.match(
    buildScript,
    /external:\s*\[[^\]]*'electron'[^\]]*\]/,
    "esbuild external[] must contain 'electron'",
  );
  assert.match(
    buildScript,
    /external:\s*\[[^\]]*'electron-updater'[^\]]*\]/,
    "esbuild external[] must contain 'electron-updater' (otherwise its dynamic requires break)",
  );
});

test('electron-builder.json files glob stays lean — no asar re-bloat (D-06 anti-pattern)', () => {
  // Production deps are auto-included in the asar; broadening `files` re-bloats it.
  assert.deepEqual(builderConfig.files, ['dist/**', 'package.json']);
});
