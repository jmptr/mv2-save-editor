// test/packaging.dist-layout.test.ts — proves the esbuild dist/ sibling layout that electron-builder
// packs into app.asar via `files: [dist/**]`.
//
// Covers the automatable slice of:
//   PKG-01/02: main.js, preload.js, renderer.js, index.html must co-exist as siblings in dist/
//              (main.ts resolves preload.js + index.html via path.join(__dirname, ...) — Phase 4
//              Pitfall 2 — so they must remain siblings after asar packing), and the config's
//              `files` glob must include `dist/**` to preserve that layout inside app.asar.
//
// Depends on `npm run build:electron` having run first (the plan's verify chains it before `npm test`).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import builderConfig from '../electron-builder.json';

const distDir = join(__dirname, '..', 'dist');

test('dist/ contains main.js, preload.js, renderer.js, index.html as siblings (PKG-01/02)', () => {
  for (const file of ['main.js', 'preload.js', 'renderer.js', 'index.html']) {
    assert.ok(
      existsSync(join(distDir, file)),
      `dist/${file} must exist as a sibling (run \`npm run build:electron\` first)`,
    );
  }
});

test('electron-builder files glob ships dist/** to preserve asar sibling layout (PKG-02)', () => {
  assert.ok(
    builderConfig.files.includes('dist/**'),
    'files must include dist/** so the sibling layout survives asar packing',
  );
});
