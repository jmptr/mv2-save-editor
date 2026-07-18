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

/** Dev vs prod: minify off in dev, on in prod; also drives the react-dom NODE_ENV define below. */
const isDev = process.env.NODE_ENV === 'development';

/** Shared options for every entry: bundled CJS targeting the Electron-bundled Node 22 runtime. */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  // `electron` is the runtime host (never bundled). `electron-updater` stays external too: it does
  // dynamic requires and resolves `app-update.yml` relative to `process.resourcesPath` at runtime,
  // so bundling it would break those path lookups in the packaged app (RESEARCH Pitfall 4).
  external: ['electron', 'electron-updater'],
  outdir: 'dist',
};

await mkdir('dist', { recursive: true });

// main + preload run in Node (main process / sandboxed preload). The core is bundled into main.js.
await build({
  ...common,
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
});

// renderer runs in Chromium — build for the browser platform (no node builtins; window.saveEditor only).
// It compiles the React 19 JSX renderer (Plan 05-02) under the strict CSP — no Vite, no HMR:
//   • entry MUST stay named `renderer` → dist/renderer.js (renaming to main/app clobbers dist/main.js — Pitfall 1)
//   • format:'iife' overrides the inherited 'cjs' — a bare <script> has no CommonJS host (Pitfall 2)
//   • jsx:'automatic' — React 19 automatic runtime (no `import React` needed)
//   • define process.env.NODE_ENV — MANDATORY: react-dom reads it; absent → "process is not defined" white window
await build({
  ...common,
  platform: 'browser',
  entryPoints: ['electron/renderer.tsx'],
  format: 'iife',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },
  minify: !isDev,
});

// Copy the CSP-locked page beside the compiled files so loadFile(join(__dirname,'index.html')) works.
await copyFile('electron/index.html', 'dist/index.html');
