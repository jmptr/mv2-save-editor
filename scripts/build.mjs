// scripts/build.mjs — the Electron build (OPTION A / esbuild, per Plan 04-01's recorded decision).
//
// Emits three CommonJS bundles + the CSP-locked page into dist/, all beside each other so main.js's
// `path.join(__dirname, 'preload.js' | 'index.html')` resolves at runtime (RESEARCH Pitfall 2):
//
//   electron/main.ts     → dist/main.js     (platform:node — the pure src/* core is bundled IN;
//                                             `electron` stays external — it's the runtime host)
//   electron/preload.ts  → dist/preload.js  (platform:node — sandboxed preload; electron external)
//   electron/renderer.ts → dist/renderer.js (platform:browser — runs in Chromium; only touches
//                                             window.saveEditor.*; no node builtins)
//   electron/index.html  → dist/index.html  (copied verbatim; loads renderer.js beside it)
//
// Core stays CommonJS (type:"commonjs" unchanged) — no ESM migration. esbuild's native binary was
// consciously approved in Plan 04-01 (OPTION A postinstall), so this is the build mechanism (NOT the
// tsc --outDir fallback).

import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

/** Shared options for every entry: bundled CJS targeting the Electron-bundled Node 22 runtime. */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  outdir: 'dist',
};

await mkdir('dist', { recursive: true });

// main + preload run in Node (main process / sandboxed preload). The core is bundled into main.js.
await build({
  ...common,
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
});

// renderer runs in Chromium — build for the browser platform (no node builtins; window.saveEditor only).
await build({
  ...common,
  platform: 'browser',
  entryPoints: ['electron/renderer.ts'],
});

// Copy the CSP-locked page beside the compiled files so loadFile(join(__dirname,'index.html')) works.
await copyFile('electron/index.html', 'dist/index.html');
