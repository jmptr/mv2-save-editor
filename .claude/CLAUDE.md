<!-- GSD:project-start source:PROJECT.md -->

## Project

**MV2 Save Editor**

A local desktop application for browsing and editing Melvor Idle 2 (MV2) save files (`.sav`).
It replaces the current workflow of hand-editing save files through the Claude web interface with
a purpose-built UI: load a save, browse its current contents, edit values with validation, preview
the changes, and write out a valid save file. Built for a solo early-access tester who edits saves
frequently to exercise game functionality.

**Core Value:** Turn a fiddly, error-prone manual save-editing process into a fast, safe, repeatable one — the
editor must always produce a `.sav` the game can load without corruption.

### Constraints

- **Platform**: Local desktop app — Why: user wants a native file open/save feel; runs entirely
  on their machine, no server, no upload.

- **Tech stack**: Lean toward Electron + TypeScript (Node backend for Brotli + binary parsing) —
  Why: Node's built-in Brotli and the existing Node scaffold minimize dependencies; research to
  confirm framework (Electron vs Tauri) before committing.

- **Editing model**: In-place, same-byte-width edits only for v1 — Why: avoids region-size-prefix
  rewrites and byte insertion, which are the main corruption risk.

- **Safety**: Validate ranges + re-parse offsets fresh on each load; preview changes before write;
  write to a new file rather than overwriting the original — Why: a corrupted save is the worst
  outcome; non-destructive writes make mistakes recoverable.

- **Correctness**: Output `.sav` must round-trip and load in-game — Why: this is the core value.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## TL;DR Recommendation

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Electron** | `43.x` | Desktop shell (Node main process + Chromium renderer) | Main process is real Node.js → native `zlib` Brotli + `Buffer` binary ops with **zero deps**. Native OS file open/save dialogs. Matches the existing Node/CommonJS scaffold and the user's stated lean. |
| **TypeScript** | `5.9.x` (or 6.x if released) | Language for main + renderer | Binary layouts are exactly where a type system pays off: model each field as `{ offset, kind, value, min, max }` and let the compiler catch type/width mistakes before they corrupt a save. |
| **electron-vite** | `5.x` | Dev server + build tooling for Electron (main/preload/renderer) | Purpose-built: one config bundles all three Electron process types, HMR for the renderer, hot-reload for main. Far less boilerplate than wiring Vite + Electron by hand. |
| **Vite** | `7.x` | Underlying bundler (used by electron-vite) | Fast dev server + instant HMR = high developer velocity, the explicit optimization target. Shared config with Vitest. |
| **React** | `19.x` | Renderer UI framework | Largest ecosystem for the two things this UI needs: searchable/virtualized lists and controlled form inputs with validation. Best-supported virtualization libraries target React. |
| **Node `zlib`** | built-in (Node 20/22 LTS) | Brotli decompress/recompress | `brotliDecompressSync` / `brotliCompressSync` ship in Node core. No `brotli`/`iltorb` npm package needed. |
| **Node `Buffer` / `DataView`** | built-in | Binary read/patch | `Buffer.readInt32LE/readBigInt64LE/readDoubleLE` + `write*LE` cover every primitive in the spec. `int64` → `BigInt` (use `readBigInt64LE`/`writeBigInt64LE`) to avoid precision loss on GP/Slayer Coins. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@tanstack/react-virtual** | `3.14.x` | List/row virtualization | Bank has hundreds of item stacks and ~30+ skills. Virtualize the browse lists so rendering stays smooth. Headless (you own the markup), tiny, framework-native. |
| **Zod** | `3.x` (or `4.x`) | Runtime validation of edit inputs + parsed-field bounds | Declaratively express per-field constraints (int32 range, int64/BigInt range, level 1–120, XP ≥ 0) and validate user input before writing. Optional but pairs cleanly with the field-descriptor model. |
| **electron-builder** | `26.x` | Local packaging (optional) | Only if you eventually want a double-clickable app. Distribution is out of scope for v1, so this is deferred; `electron-vite dev` covers day-to-day use. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest** | `4.1.x` | Unit + round-trip tests | Vite-native (reuses electron-vite's transform pipeline), Jest-compatible API. Run parser/patcher tests in the Node environment. |
| **@types/node** | matches Node LTS | Types for `zlib`, `Buffer`, `fs` | Required for typed main-process code. |
| **Prettier + ESLint (typescript-eslint)** | latest | Formatting/lint | Standard; keep light for a solo project. |

## Installation

# Scaffold (React + TypeScript template)

# choose: React, TypeScript

# Core is provided by the scaffold (electron, react, react-dom, electron-vite, vite, typescript)

# Supporting

# Dev / test

# Optional, only when you want a packaged binary

## The Electron vs Tauri Decision (grounded in THIS project)

| Factor | Electron | Tauri | Winner for this project |
|--------|----------|-------|-------------------------|
| Brotli decompression | `zlib` built into the Node main process — zero deps | No Node runtime. Must Brotli in Rust (`brotli` crate) or ship a WASM decoder in the webview (browsers' `DecompressionStream` supports gzip/deflate **but not Brotli**) | **Electron** |
| .NET binary parsing | `Buffer.read*LE` / `write*LE` cover every primitive natively | Do it in Rust, or in-webview with `DataView` + hand-written BigInt for int64 | **Electron** |
| Language count | One language (TypeScript) end-to-end | Two (Rust backend + TS frontend), unless you push all logic into the webview | **Electron** |
| Existing scaffold | Already a Node/CommonJS `package.json` | Would restart around a Rust/Cargo toolchain | **Electron** |
| Developer velocity (the stated goal) | High — reuse Node knowledge, huge ecosystem | Lower here — Rust learning curve for the exact hot path (binary + Brotli) | **Electron** |
| Bundle size / memory / startup | ~100–150 MB, heavier RAM | ~5–10 MB, lighter | Tauri — **but irrelevant for a single-user local tool that isn't distributed** |
| Security sandboxing | Requires care (contextIsolation, no `nodeIntegration` in renderer) | Stronger defaults | Tauri — **but the input is a local file the user already owns; not a threat surface that changes the decision** |

## Binary Parsing Approach — Why Hand-Rolled, Not a Schema Library

- **restructure** (`5.x`) and **binary-parser** (`2.2.x`) are declarative *parse ⇄ serialize*
- **kaitai-struct** is **parse-only** (no official serialization) → cannot write saves. Out.
- The format is already fully reverse-engineered in `docs/current-skill.md` with exact offset math.

## Testing Approach — Binary Round-Trip Correctness

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Electron | Tauri (v2) | Only if public distribution + small bundle/memory become real goals (not v1). |
| React | Svelte 5 / SolidJS | Fine if you prefer them; smaller virtualization ecosystem. React chosen for the strongest virtualization + form tooling. |
| Hand-rolled Buffer reader | restructure / binary-parser | Only if v2 byte-insertion forces full re-serialization of large regions. |
| electron-vite | Electron Forge (Vite + TS template) | If you want integrated packaging/publishing pipelines out of the box; heavier than needed for a dev tool. |
| @tanstack/react-virtual | react-window / react-virtuoso | react-virtuoso if you want batteries-included list behavior (grouping, sticky) with less wiring; TanStack chosen for headless control + active perf work. |
| Vitest | Jest / node:test | Vitest reuses the Vite pipeline (zero extra config). node:test is fine for a pure-Node parser package with no bundler. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `brotli` / `iltorb` npm packages | Redundant native/WASM deps; Node core already ships Brotli | `zlib.brotliDecompressSync` / `brotliCompressSync` |
| Browser `DecompressionStream` for Brotli | Supports gzip/deflate only — **not Brotli** | Node `zlib` in the main process |
| kaitai-struct | Parse-only; cannot write/serialize saves | Hand-rolled Buffer reader/writer |
| Full parse⇄serialize via restructure for v1 writes | Must reproduce byte-exact .NET output for untouched regions → corruption risk | In-place offset patching on the original buffer |
| `Number` for int64 GP/Slayer Coins | Loses precision above 2^53 (quintillion-scale values) | `BigInt` via `readBigInt64LE`/`writeBigInt64LE` |
| Redux/RTK, heavy state libs | Overkill for a single-window solo tool | React state / `useReducer` / tiny store |
| `nodeIntegration: true` in the renderer | Unsafe pattern; not needed | Do binary/Brotli/file work in **main**, expose narrow IPC via `contextBridge` + `contextIsolation` |

## Stack Patterns by Variant

- Re-evaluate Tauri v2; keep the parser as portable TS (no Node-only APIs in the core) so it can move
- Add electron-builder (or Tauri bundler) with code signing.
- Extend the hand-rolled writer to recompute entity **region byte-length prefixes** after insertion;
- Consider react-virtuoso for richer list semantics; add a diff/preview model over the field-descriptor

## Architecture Note (feeds ARCHITECTURE.md)

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| electron-vite `5.x` | Vite `7.x`, Electron `43.x` | Scaffold pins a working matrix; don't upgrade Vite past what electron-vite supports. |
| Vitest `4.1.x` | Vite `7.x` | Vitest 4 aligns with Vite 7; share one config. |
| Electron `43.x` | Node 22 / Chromium (bundled) | Node version is whatever this Electron bundles — `Buffer`/`zlib` APIs used here are long-stable. |
| @tanstack/react-virtual `3.14.x` | React `19.x` | Framework-native adapter. |

## Sources

- [Electron releases](https://releases.electronjs.org/) — latest stable **43.0.0**; support = latest 3 majors (41–43). HIGH
- [electron-vite](https://electron-vite.org/) / [create-electron-vite](https://github.com/electron-vite/create-electron-vite) — latest **5.0.0**, TS/React/Vue/Svelte/Solid scaffolds. HIGH
- [@tanstack/react-virtual (npm)](https://www.npmjs.com/package/@tanstack/react-virtual) — latest **3.14.5**; 2026 perf release. HIGH
- [Vitest](https://vitest.dev/) / [npm](https://www.npmjs.com/package/vitest) — latest **4.1.x**, Vite-native. HIGH
- [restructure (npm)](https://www.npmjs.com/package/restructure) & [binary-parser (npm)](https://www.npmjs.com/package/binary-parser) — declarative parse/serialize libs; evaluated and set aside for in-place patching. HIGH
- Node.js `zlib` Brotli + `Buffer` LE read/write APIs — Node core (LTS). HIGH (training-knowledge, stable API)
- `docs/current-skill.md` (in-repo) — authoritative save-format spec: layout, primitives, offset math, XP table. HIGH
- React 19 / Vite 7 / TypeScript 5.9 versions — HIGH confidence from ecosystem signals (Vitest 4↔Vite 7, react-virtual↔React 19); pin exact minors from `npm` at install time.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
