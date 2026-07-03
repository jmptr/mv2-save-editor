# Stack Research

**Domain:** Local desktop binary save-file editor (Brotli-compressed .NET BinaryReader/Writer format)
**Researched:** 2026-07-03
**Confidence:** HIGH

## TL;DR Recommendation

**Electron + TypeScript + React + Vite (via electron-vite), with a hand-rolled `Buffer`/`DataView`
binary reader that records offsets and patches bytes in place. Test round-trips with Vitest.**

The single most important fact driving this stack: **the save workflow is a Node workload.**
Decompression is `zlib.brotliDecompressSync` (built into Node core), and every binary primitive in
the spec (`int32`/`int64`/`double` LE, 1-byte bool, 7-bit length-prefixed UTF-8 strings) maps
directly onto Node `Buffer` methods (`readInt32LE`, `readBigInt64LE`, `readDoubleLE`, and their
`write*` counterparts). Electron's main process **is** full Node.js, so the entire parse/patch/
recompress pipeline runs with zero external dependencies. This is decisive for the Electron-vs-Tauri
choice (see below).

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

**Recommended editing engine (opinionated, no library):** Write a small recursive-descent reader
that walks the documented layout (version → SaveHeader → entity list → …) and emits a **flat list of
editable fields, each carrying its absolute byte offset, kind, current value, and validation bounds**.
Editing = validate → `buf.write*LE(newValue, offset)` on the decompressed `Buffer` → re-Brotli. This
is a perfect fit for the v1 constraint ("in-place, same-byte-width edits only") and for the recorded
lesson "always re-parse offsets fresh." A schema/serialization library is the wrong tool here (see
"What NOT to Use").

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@tanstack/react-virtual** | `3.14.x` | List/row virtualization | Bank has hundreds of item stacks and ~30+ skills. Virtualize the browse lists so rendering stays smooth. Headless (you own the markup), tiny, framework-native. |
| **Zod** | `3.x` (or `4.x`) | Runtime validation of edit inputs + parsed-field bounds | Declaratively express per-field constraints (int32 range, int64/BigInt range, level 1–120, XP ≥ 0) and validate user input before writing. Optional but pairs cleanly with the field-descriptor model. |
| **electron-builder** | `26.x` | Local packaging (optional) | Only if you eventually want a double-clickable app. Distribution is out of scope for v1, so this is deferred; `electron-vite dev` covers day-to-day use. |

**Deliberately minimal:** For v1 you likely need **only** `@tanstack/react-virtual` beyond the
framework. Brotli and binary parsing are Node built-ins; state can be plain React state/`useReducer`
or a tiny store — no need for Redux/RTK at this scale.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest** | `4.1.x` | Unit + round-trip tests | Vite-native (reuses electron-vite's transform pipeline), Jest-compatible API. Run parser/patcher tests in the Node environment. |
| **@types/node** | matches Node LTS | Types for `zlib`, `Buffer`, `fs` | Required for typed main-process code. |
| **Prettier + ESLint (typescript-eslint)** | latest | Formatting/lint | Standard; keep light for a solo project. |

## Installation

```bash
# Scaffold (React + TypeScript template)
npm create electron-vite@latest mv2-save-editor
# choose: React, TypeScript

# Core is provided by the scaffold (electron, react, react-dom, electron-vite, vite, typescript)

# Supporting
npm install @tanstack/react-virtual zod

# Dev / test
npm install -D vitest @types/node

# Optional, only when you want a packaged binary
npm install -D electron-builder
```

> Note: the existing scaffold declares `"type": "commonjs"`. electron-vite emits the correct module
> format per process, so let the scaffold set this; don't hand-fight ESM/CJS. Renderer code is bundled
> by Vite (ESM); main/preload are emitted in the format electron-vite configures.

## The Electron vs Tauri Decision (grounded in THIS project)

**Recommendation: Electron. HIGH confidence.**

| Factor | Electron | Tauri | Winner for this project |
|--------|----------|-------|-------------------------|
| Brotli decompression | `zlib` built into the Node main process — zero deps | No Node runtime. Must Brotli in Rust (`brotli` crate) or ship a WASM decoder in the webview (browsers' `DecompressionStream` supports gzip/deflate **but not Brotli**) | **Electron** |
| .NET binary parsing | `Buffer.read*LE` / `write*LE` cover every primitive natively | Do it in Rust, or in-webview with `DataView` + hand-written BigInt for int64 | **Electron** |
| Language count | One language (TypeScript) end-to-end | Two (Rust backend + TS frontend), unless you push all logic into the webview | **Electron** |
| Existing scaffold | Already a Node/CommonJS `package.json` | Would restart around a Rust/Cargo toolchain | **Electron** |
| Developer velocity (the stated goal) | High — reuse Node knowledge, huge ecosystem | Lower here — Rust learning curve for the exact hot path (binary + Brotli) | **Electron** |
| Bundle size / memory / startup | ~100–150 MB, heavier RAM | ~5–10 MB, lighter | Tauri — **but irrelevant for a single-user local tool that isn't distributed** |
| Security sandboxing | Requires care (contextIsolation, no `nodeIntegration` in renderer) | Stronger defaults | Tauri — **but the input is a local file the user already owns; not a threat surface that changes the decision** |

Tauri's genuine advantages (tiny bundles, low memory, hardened sandbox) all target **distribution and
untrusted-input** scenarios. This project is the opposite: a solo tester editing their own local
files, optimizing for velocity and correctness. Every Tauri advantage is moot, while its one cost —
losing Node's built-in Brotli and `Buffer` binary API right on the critical path — is exactly what
this app spends its time doing. **Electron wins decisively.**

If the project ever pivots to public distribution and bundle size becomes a real complaint, Tauri (v2)
would be worth re-evaluating — but by then the parser would be portable TS that could run in-webview
with a WASM Brotli decoder, so the rewrite cost is contained.

## Binary Parsing Approach — Why Hand-Rolled, Not a Schema Library

The v1 model is **parse-to-find-offsets, then patch same-width bytes in place**, not
**deserialize-to-object-graph then re-serialize**. That distinction determines the tool:

- **restructure** (`5.x`) and **binary-parser** (`2.2.x`) are declarative *parse ⇄ serialize*
  libraries. They produce/consume JS objects. To patch a save with them you'd fully decode the file,
  mutate the object, and **re-encode the entire buffer** — which must reproduce byte-exact output for
  a `.NET`-written file (including the 7-bit string prefixing and every untouched region). Any
  encoder mismatch corrupts the save. That's strictly more risk than patching a handful of known
  offsets in the original buffer.
- **kaitai-struct** is **parse-only** (no official serialization) → cannot write saves. Out.
- The format is already fully reverse-engineered in `docs/current-skill.md` with exact offset math.
  Porting those ~5 read helpers (LEB128 string, int32, int64→BigInt, double, entity walk) to typed
  `Buffer` code is an afternoon, is auditable, and returns offsets directly — which is precisely what
  in-place patching needs.

**Verdict:** hand-write a `SaveReader` over Node `Buffer` that yields `{ offset, kind, value, min,
max }` field descriptors; patch via `buf.write*LE(value, offset)`. Use a schema library only if v2's
byte-insertion / region-resize work makes full re-serialization unavoidable — and even then, prefer
extending the hand-rolled writer so you control region-size prefixes explicitly.

## Testing Approach — Binary Round-Trip Correctness

The core value is "output `.sav` must round-trip and load in-game," so tests must be **byte-level and
fixture-driven** (Vitest, Node environment):

1. **No-op decompressed round-trip (the golden test):** `decompress(fixture)` → parse → apply **zero**
   edits → the decompressed buffer must be **byte-identical** to the original decompressed bytes.
   This proves the parser/patcher touches nothing it shouldn't.
2. **Edit-then-reparse:** patch a field (GP, item qty, skill XP/Level) → re-parse the patched buffer →
   assert the field reads back the new value and **every other field is unchanged**.
3. **Width invariant:** assert each patch writes exactly the field's byte width at its offset (int32=4,
   int64=8, double=8) and never changes buffer length — enforces the v1 same-width constraint.
4. **XP-table consistency:** unit-test `compute_xp_table` against the documented milestones
   (L50=101,331 … L120=104,273,162); test that setting a level writes a consistent XP/Level pair.
5. **BigInt fidelity:** GP/Slayer Coins are int64 — assert values above `2^53` survive read→write via
   `BigInt` without precision loss.

> **Critical pitfall to encode in tests:** do **not** assert on the *compressed* file bytes. Brotli
> recompression will almost never be byte-identical to the original (different encoder/quality). The
> game reads the *decompressed* content, so assert round-trip equality at the **decompressed-buffer**
> level, not the `.sav` level. Keep a couple of real `.sav` files as committed fixtures.

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

**If distribution to other users ever becomes a goal:**
- Re-evaluate Tauri v2; keep the parser as portable TS (no Node-only APIs in the core) so it can move
  to a WASM-Brotli webview build.
- Add electron-builder (or Tauri bundler) with code signing.

**If v2 adds new items/entities (byte insertion):**
- Extend the hand-rolled writer to recompute entity **region byte-length prefixes** after insertion;
  add tests that re-parse the full entity list and verify sizes. Do not reach for a generic schema lib
  first — you need explicit control of region prefixes.

**If the UI grows beyond browse+edit (bulk ops, diffs):**
- Consider react-virtuoso for richer list semantics; add a diff/preview model over the field-descriptor
  list.

## Architecture Note (feeds ARCHITECTURE.md)

Keep a clean process split: **main process = Node** (fs read/write, Brotli, parse, patch, validate);
**renderer = React UI**; **preload = `contextBridge`** exposing a narrow, typed IPC surface
(`loadSave(path) → { summary, fields }`, `writeSave(edits, outPath)`). Never expose raw `fs`/`Buffer`
to the renderer. This keeps the corruption-sensitive binary logic in one testable Node module,
independent of the UI.

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

---
*Stack research for: local desktop binary save-file editor (MV2 `.sav`)*
*Researched: 2026-07-03*
