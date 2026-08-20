// test/release.workflow.test.ts — pins the tag-triggered release workflow contract.
//
// Covers the static (any-OS) slice of:
//   CI-01: a `v*` tag push runs on windows-latest with Node 22, and `npm run build:electron`
//          runs BEFORE electron-builder packages (electron-builder never rebuilds TS)
//   CI-02: least-privilege `contents: write` token, passed to electron-builder via GH_TOKEN env
//   CI-03: default-draft release — no forced-publish override defeating the human publish gate
//   CI-01 (lockfile coverage): package-lock.json carries @esbuild/win32-x64 so `npm ci` on the
//          windows-latest runner installs the win32 esbuild binary (STATE's #1 first-CI risk)
// These values must never silently drift from the acceptance bar, so they are asserted directly
// against the committed workflow text (zero-dep — no YAML parser) and the typed lockfile.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import lock from '../package-lock.json';

// Read the workflow as text rather than parsing YAML — mirrors test/updater.packaging.test.ts,
// which reads build.mjs as text. No YAML-parser dependency is added.
const wf = readFileSync(join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

test('release workflow triggers only on v* tags, on windows-latest + Node 22 (CI-01)', () => {
  assert.match(wf, /on:\s*\n\s*push:\s*\n\s*tags:\s*\n\s*-\s*'v\*'/, 'must trigger on push of v* tags only');
  assert.match(wf, /runs-on:\s*windows-latest/, 'must run on windows-latest (native NSIS, no Wine)');
  assert.match(wf, /node-version:\s*'?22'?/, 'must use Node 22');
});

test('release workflow installs then builds before packaging (CI-01)', () => {
  assert.match(wf, /run:\s*npm ci\b/, 'must run plain `npm ci`');
  assert.match(wf, /npm run build:electron/, 'must run build:electron');
  // Build step must precede the electron-builder package step so electron-builder never rebuilds TS.
  assert.match(
    wf,
    /build:electron[\s\S]*electron-builder/,
    'npm run build:electron must appear before the electron-builder invocation',
  );
});

test('release workflow grants least-privilege contents: write and passes GH_TOKEN via env (CI-02)', () => {
  assert.match(wf, /permissions:\s*\n\s*contents:\s*write/, 'must grant contents: write at top level');
  assert.match(
    wf,
    /electron-builder[^\n]*--publish\s+onTagOrDraft/,
    'electron-builder must publish with onTagOrDraft',
  );
  assert.match(
    wf,
    /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    'GH_TOKEN must be supplied from secrets.GITHUB_TOKEN via env',
  );
});

test('release workflow keeps the default-draft gate — no forced-publish override (CI-03)', () => {
  assert.doesNotMatch(wf, /releaseType/, 'must not override releaseType (default draft is the CI-03 gate)');
  assert.doesNotMatch(wf, /--publish\s+always/, 'must not force publish on every run');
});

test('release workflow uses least privilege and first-party pinned actions (CI-02, T-08-01/02)', () => {
  assert.doesNotMatch(wf, /write-all/, 'must not grant a broad write-all token');
  assert.match(wf, /actions\/checkout@v/, 'must use first-party actions/checkout pinned to a major');
  assert.match(wf, /actions\/setup-node@v/, 'must use first-party actions/setup-node pinned to a major');
});

test('release workflow does not strip optional deps or echo the token (CI-01, T-08-03)', () => {
  assert.doesNotMatch(wf, /--omit=optional/, 'must not omit optional deps (would strip @esbuild/win32-x64)');
  assert.doesNotMatch(wf, /--no-optional/, 'must not skip optional deps');
  assert.doesNotMatch(wf, /--ignore-scripts/, 'must not ignore install scripts');
  // No run: step may print the token to the log.
  assert.doesNotMatch(wf, /echo[^\n]*(GH_TOKEN|GITHUB_TOKEN)/, 'must never echo the token');
});

test('package-lock.json carries @esbuild/win32-x64 for the windows-latest build (CI-01)', () => {
  const win = (lock as { packages: Record<string, { os?: string[]; cpu?: string[] }> }).packages[
    'node_modules/@esbuild/win32-x64'
  ];
  assert.ok(win, '@esbuild/win32-x64 must be in the lockfile for npm ci on windows-latest');
  assert.deepEqual(win.os, ['win32']);
  assert.deepEqual(win.cpu, ['x64']);
});
