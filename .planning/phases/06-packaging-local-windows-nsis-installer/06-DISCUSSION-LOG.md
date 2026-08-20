# Phase 6: Packaging — Local Windows NSIS Installer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 6-Packaging — Local Windows NSIS Installer
**Areas discussed:** App identity strings, Application icon, Version number, Package script ergonomics

---

## App Identity Strings

| Option | Description | Selected |
|--------|-------------|----------|
| MV2 Save Editor + reverse-DNS | productName `MV2 Save Editor`, appId `com.jmptr.mv2-save-editor`. Matches project name; reverse-DNS from GitHub owner. Installer → `MV2 Save Editor Setup 1.1.0.exe`. | ✓ |
| Melvor spelled out | productName `Melvor Idle 2 Save Editor`, appId `com.jmptr.melvor-save-editor`. More descriptive/searchable, longer shortcut label. | |

**User's choice:** MV2 Save Editor + reverse-DNS
**Notes:** appId reused by the electron-updater seam in Phase 7 — must stay stable across releases.

---

## Application Icon

| Option | Description | Selected |
|--------|-------------|----------|
| Generate a simple placeholder | Create a clean glyph/monogram `.ico` (multi-size) now, committed; satisfies PKG-04; swappable later by replacing the file. | ✓ |
| I'll supply the .ico | User provides an `.ico` (or high-res PNG to convert); planning references the expected path, real asset comes from the user before build. | |

**User's choice:** Generate a simple placeholder
**Notes:** Intentionally throwaway ("MV2" monogram) to unblock PKG-04; explicitly swappable later.

---

## Version Number

| Option | Description | Selected |
|--------|-------------|----------|
| Bump to 1.1.0 now | Set version `1.1.0` this phase. Installer reads `Setup 1.1.0.exe`; Phase 7/8 updater chain (1.1.0 → 1.1.1) starts from a clean, milestone-aligned base. | ✓ |
| Keep 1.0.0 for Phase 6 | Package as `1.0.0`; bump later when updater/CI lands. Keeps this phase's diff purely about packaging. | |

**User's choice:** Bump to 1.1.0 now
**Notes:** Version embeds in installer name and drives the two-release validation in Phase 8.

---

## Package Script Ergonomics

| Option | Description | Selected |
|--------|-------------|----------|
| Chain build then package | `npm run package` = `build:electron && electron-builder`. One command works from clean; eb still never recompiles TS. | ✓ |
| Pure package only | `npm run package` = `electron-builder` alone, assuming `dist/` already built. Matches "packaging the existing dist/" literally. | |

**User's choice:** Chain build then package
**Notes:** esbuild does the TS compile; electron-builder wraps the resulting `dist/` without recompiling. A bare eb-only script may additionally be added for Phase 8 CI reuse (planner's call).

---

## Claude's Discretion

- electron-builder config location (package.json `build` key vs standalone `electron-builder.yml`).
- Exact `files` globs, asar on/off, `directories.output`/`buildResources` wiring — with locked
  constraints: output → `release/`, asar must resolve preload.js + index.html as siblings of main.js.
- Whether to add `release/` to `.gitignore` (recommended yes).

## Deferred Ideas

None — discussion stayed within phase scope. Auto-update (Phase 7), CI publish (Phase 8), and code
signing / cross-platform packaging (v2) were referenced only as the reason appId + version must be
chosen deliberately now.
