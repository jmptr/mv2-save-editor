# Architecture Research

**Domain:** Local desktop binary save-file editor (Electron + TypeScript) for Melvor Idle 2 `.sav` files
**Researched:** 2026-07-03
**Confidence:** HIGH

## Standard Architecture

The dominant, well-supported pattern for this class of tool is a **three-layer split**:

1. A **pure format core** (no Electron, no `fs`, no DOM) that owns all binary knowledge.
2. A **trusted host** (Electron main process) that owns file I/O, Brotli, and hosts the core.
3. An **untrusted UI** (Electron renderer) that only renders a serialized view model and emits edit intents.

The single most important architectural rule: **raw bytes and byte offsets never leave the main process.** The renderer only ever sees JSON-safe view models and sends back `{fieldId, newValue}` intents. This is both a security boundary (Electron best practice: only main touches the filesystem) and the mechanism that structurally enforces the project's hard-won lesson — *offsets are re-parsed fresh on every load and never reused or persisted*.

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  RENDERER (untrusted, sandboxed) — UI only, no Node, no bytes      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Summary  │  │  Bank    │  │  Skills  │  │ Preview / Confirm │   │
│  │  view    │  │  browser │  │  browser │  │     dialog        │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────┬────────┘   │
│       └─────────────┴──────┬──────┴──────────────────┘            │
│              View model (JSON) ▲        ▼ edit intents {id,value}  │
├───────────────────────────────╫═════════╫═════════════════════════┤
│           PRELOAD  ── contextBridge: narrow, one method per channel │
│      loadSave() · getModel() · previewEdits() · writeSave()         │
├───────────────────────────────╫═════════╫═════════════════════════┤
│  MAIN (trusted) — ipcMain.handle handlers + validation gate        │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │  File I/O  │  │ Brotli codec  │  │  Session store            │ │
│  │  open/save │  │ (zlib native) │  │  buffer + FieldTable      │ │
│  └─────┬──────┘  └───────┬───────┘  └────────────┬──────────────┘ │
│        └─────────────────┴───────── hosts ───────┘                │
├────────────────────────────────────────────────────────────────────┤
│  FORMAT CORE (pure TS — zero Electron/Node/DOM deps, unit-tested)   │
│  ┌─────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ BinaryReader│ │  Parser    │ │  Model    │ │  Validation      │ │
│  │ /Writer     │ │ header +   │ │ FieldTable│ │  value + struct  │ │
│  │ LE prims    │ │ entities   │ │ + patcher │ │  round-trip      │ │
│  └─────────────┘ └────────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **BinaryReader/Writer** | LE primitives: int32, int64 (BigInt), double, bool, 7-bit-length UTF-8 string; cursor tracking | Pure class over `Buffer`/`DataView`; `readInt32LE`, `read7BitEncodedInt`, symmetric writers |
| **Parser** | Walk `[version][SaveHeader][entity list][…]`; locate Bank/skill entities; extract editable **Fields** with fresh offsets | Sequential decoder; produces `FieldTable` + section tree |
| **Model (FieldTable + view builder)** | Map every editable value to `{id, kind, offset, width, value}`; build the renderer view model (summary/bank/skills) | `Map<FieldId, FieldDescriptor>` (main-only) + derived JSON tree |
| **Patcher** | Apply same-width edits at `field.offset` onto a **copy** of the buffer | `struct.pack_into`-equivalent writes; refuses width changes |
| **Validation** | (a) value: type/range/XP-table consistency; (b) structural: re-parse patched buffer, assert byte length unchanged | Pure validators shared by renderer (feedback) + main (gate) |
| **Main / IPC host** | `open` → decompress → parse → cache session; serve view model; preview + write | `ipcMain.handle` handlers; owns `zlib` + `fs` |
| **Preload bridge** | Expose ~4 narrow methods; serialize to plain types | `contextBridge.exposeInMainWorld` |
| **Renderer** | Render view model, capture edits, show preview, trigger write | React/Svelte/vanilla; holds *no* offsets/bytes |

## Recommended Project Structure

```
src/
├── core/                     # PURE TS — no electron/fs/dom imports (the crown jewel)
│   ├── binary/
│   │   ├── reader.ts         # BinaryReader: LE prims + 7-bit string
│   │   ├── writer.ts         # BinaryWriter: symmetric same-width writes
│   │   └── primitives.test.ts
│   ├── format/
│   │   ├── header.ts         # SaveHeader parse (+ offset of entity list)
│   │   ├── entities.ts       # entity-list walk → {id, start, size}
│   │   ├── bank.ts           # item-stack extraction (qty/placeholder/locked/id)
│   │   ├── skills.ts         # ExperienceComponent (XP double / cap / level)
│   │   ├── wallet.ts         # GP/SlayerCoins int64 in Bank wallet
│   │   └── *.test.ts         # golden-file round-trip fixtures
│   ├── model/
│   │   ├── field.ts          # FieldDescriptor {id, kind, offset, width, value}
│   │   ├── field-table.ts    # Map<FieldId, FieldDescriptor> (offsets live ONLY here)
│   │   ├── view-model.ts     # JSON-safe tree derived for the renderer
│   │   └── patcher.ts        # apply {id,newValue} → same-width writes on a copy
│   ├── validation/
│   │   ├── value-rules.ts    # type/range + XP↔level consistency
│   │   └── structural.ts     # re-parse patched buffer, length-invariant check
│   └── xp-table.ts           # StandardExperienceTable (scaling/exp/base)
├── main/                     # Electron main — trusted; the only place bytes exist
│   ├── main.ts               # app lifecycle, BrowserWindow, webPreferences
│   ├── session.ts            # per-file: {buffer, fieldTable, sourcePath}
│   ├── codec.ts              # zlib.brotli{De,C}ompressSync wrappers
│   ├── fs-io.ts              # read original / write NEW file (never overwrite)
│   └── ipc-handlers.ts       # ipcMain.handle: load/getModel/preview/write + validate sender+args
├── preload/
│   └── preload.ts            # contextBridge: loadSave/getModel/previewEdits/writeSave
├── renderer/                 # Electron renderer — untrusted, sandboxed, UI only
│   ├── App.tsx
│   ├── views/ (Summary, BankBrowser, SkillBrowser, PreviewDialog)
│   ├── state/ (view model + pendingEdits map, keyed by fieldId)
│   └── shared-types.ts       # DTO types shared with core view-model (no offsets)
└── shared/
    └── ipc-contract.ts       # channel names + request/response DTO types
```

### Structure Rationale

- **`core/` has zero Electron/Node-host imports** so the entire binary engine runs under `vitest` in milliseconds, with golden-file fixtures asserting byte-exact round-trips. This is the highest-leverage boundary in the whole project: correctness of the save format is the product, and it must be testable without launching Electron.
- **`main/` is the only layer that holds a `Buffer` or an offset.** File I/O, Brotli, and the authoritative `FieldTable` live here. This satisfies Electron's rule that only the trusted process touches the filesystem, and it makes "never reuse offsets across sessions" a structural fact — the renderer physically cannot cache an offset it never receives.
- **`shared/ipc-contract.ts`** is the single source of truth for what crosses the boundary; both main and renderer import it so the DTO shape stays honest.

## Architectural Patterns

### Pattern 1: Field-Descriptor Offset Mapping (the core idea)

**What:** Parsing produces a flat `FieldTable: Map<FieldId, FieldDescriptor>` where each descriptor is `{ id, kind: 'int32'|'int64'|'double'|'bool', offset, width, value }`. Edits are expressed purely as `{ fieldId, newValue }`. The patcher looks up the descriptor and writes `newValue` at `offset` with the fixed `width`. The renderer never sees `offset` — it only sees the id, a label, the current value, and validation constraints.

**When to use:** Any in-place, same-width binary editor. It cleanly decouples "what the user edits" from "where the bytes are."

**Trade-offs:** Excellent testability and a rock-solid non-destructive story; the FieldTable must be rebuilt on every load (feature, not cost — it's exactly the anti-stale-offset lesson).

**Example:**
```typescript
interface FieldDescriptor {
  id: string;            // e.g. "bank.item.MelvorBase:AgilityMark.qty"
  kind: 'int32' | 'int64' | 'double' | 'bool';
  offset: number;        // fresh, main-process-only, never serialized
  width: number;         // 4 | 8 | 1  — edits must not change this
  value: number | bigint | boolean;
}

function applyEdit(buf: Buffer, f: FieldDescriptor, next: number | bigint) {
  switch (f.kind) {
    case 'int32':  buf.writeInt32LE(Number(next), f.offset); break;
    case 'int64':  buf.writeBigInt64LE(BigInt(next), f.offset); break;
    case 'double': buf.writeDoubleLE(Number(next), f.offset); break;
  } // width is fixed by kind → same-width guarantee holds by construction
}
```

### Pattern 2: Bytes-Stay-Home IPC (view model out, intents in)

**What:** `ipcMain.handle('save:load', path)` decompresses + parses + caches the session, then returns only the JSON view model. The renderer sends `save:preview` / `save:write` with a `pendingEdits` array of `{fieldId, newValue}` (int64 as string). The main process re-resolves ids against its own FieldTable, re-validates, and only then patches a copy.

**When to use:** Every Electron app handling privileged data. Aligns with the current default posture (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) and "one narrow method per channel; never expose raw `ipcRenderer`."

**Trade-offs:** Requires defining DTOs and serializing BigInt as string; in return you get a hard security boundary and an offset-leak-proof design.

**Example:**
```typescript
// preload.ts — tiny, no fs/child_process/eval
contextBridge.exposeInMainWorld('saveApi', {
  load:    (path: string)            => ipcRenderer.invoke('save:load', path),
  preview: (edits: EditIntent[])     => ipcRenderer.invoke('save:preview', edits),
  write:   (edits: EditIntent[], out:string) => ipcRenderer.invoke('save:write', edits, out),
});
// main validates sender + arg schema inside every handler before acting
```

### Pattern 3: Non-Destructive Copy-Patch-Verify-Write

**What:** The load path keeps the pristine decompressed buffer immutable in the session. Write path: `const out = Buffer.from(session.buffer)` → apply all patches → **re-parse `out` and assert it still parses and `out.length === session.buffer.length`** → `brotliCompressSync` → write to a **new** path. The original file is never opened for writing.

**When to use:** Always, for this project. A corrupted save is the worst outcome; the round-trip re-parse is a cheap last-line-of-defense.

**Trade-offs:** One extra parse per write (negligible for a personal tool) buys strong corruption protection.

## Data Flow

### Load → Edit → Validate → Preview → Write

```
[User: Open file]
    │  renderer → preload.load(path)
    ▼
MAIN: fs.readFile → brotliDecompressSync → Parser.parse(buffer)
    │  builds FieldTable (fresh offsets) + view model; caches session
    ▼
[view model JSON] ──────────────► RENDERER renders Summary/Bank/Skills
    │
[User edits a value] → value-rules validate inline (instant feedback in renderer)
    │  edits accumulate as pendingEdits: Map<fieldId, newValue>
    ▼
[User: Preview] → preload.preview(edits)
    ▼
MAIN: resolve ids in FieldTable → value-validate → build diff summary
    │  {field, label, oldValue, newValue}  (no offsets crossing the wire)
    ▼
[preview summary] ──────────────► RENDERER shows confirm dialog
    │
[User: Confirm write] → preload.write(edits, outPath)
    ▼
MAIN: clone buffer → patch (same-width) → RE-PARSE + length-invariant check
    │  → brotliCompressSync → fs.writeFile(NEW path)   [original untouched]
    ▼
[success + output path] ────────► RENDERER shows confirmation
```

### State Management

```
Authoritative state (MAIN, per open file):   { sourcePath, buffer (immutable), fieldTable }
Derived/UI state (RENDERER):                  { viewModel (readonly), pendingEdits: Map<fieldId,newValue> }
```
The renderer's `pendingEdits` is the only mutable edit state; it is a set of *intents*, not byte mutations. Nothing in the renderer can corrupt the buffer because the renderer has no buffer.

### Key Data Flows

1. **Load flow:** file → main decompress → parse → FieldTable + view model → renderer. Offsets stop at the FieldTable.
2. **Edit flow:** renderer value-validates locally for UX, but main re-validates authoritatively before any write — the renderer's validation is advisory only.
3. **Write flow:** intents → main resolves against its FieldTable → copy-patch-verify-recompress → new file.

## Scaling Considerations

This is a single-user desktop tool; "scale" means save-file size and editable-field count, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Typical save (< ~10 MB decompressed, hundreds of bank items) | Synchronous `brotli*Sync` + full parse on load is fine; virtualize long lists in the UI |
| Large save / thousands of bank items | Virtualized/`windowed` list rendering; debounce search; keep parse synchronous but off the UI thread (it already is — it's in main) |
| Very large / slow Brotli | Move `brotli*Sync` to a `worker_threads` worker in main so the app window stays responsive; stream progress over IPC |

### Scaling Priorities

1. **First bottleneck:** rendering a huge bank/skill list — fix with UI virtualization + client-side search index; no core changes.
2. **Second bottleneck:** Brotli (de)compression latency on big saves — offload to a worker thread in the main process; the pure core is already worker-safe (no Electron deps).

## Anti-Patterns

### Anti-Pattern 1: Parsing bytes (or shipping the Buffer) in the renderer

**What people do:** Enable `nodeIntegration`, read the file and run Brotli/parse in the renderer for convenience.
**Why it's wrong:** Breaks Electron's security model, and it leaks offsets/buffers into the untrusted UI where they can be cached and reused — the exact stale-offset failure the project already learned to avoid.
**Do this instead:** Keep `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`; do all bytes/Brotli/fs in main; send only a view model.

### Anti-Pattern 2: Persisting or reusing offsets across sessions

**What people do:** Cache the FieldTable/offsets from a previous load to "speed up" the next edit.
**Why it's wrong:** Offsets are only valid for the exact buffer they were parsed from; reusing them silently corrupts a different (or re-saved) file.
**Do this instead:** Rebuild the FieldTable from scratch on every load; never serialize `offset`. The bytes-stay-home IPC design makes this automatic.

### Anti-Pattern 3: Using JS `number` for int64 GP/currency

**What people do:** Read/write GP as a `number`.
**Why it's wrong:** `number` loses integer precision above 2^53; GP is int64 (up to ~9.2 quintillion).
**Do this instead:** Use `BigInt` (`readBigInt64LE`/`writeBigInt64LE`); serialize as a string across IPC (JSON has no BigInt).

### Anti-Pattern 4: Coupling the format core to Electron

**What people do:** Import `electron`/`fs` inside parser/model code.
**Why it's wrong:** Makes the binary engine un-unit-testable and forces launching Electron to verify correctness — where all the real risk lives.
**Do this instead:** `core/` imports nothing from Electron; test it with golden-file round-trip fixtures under `vitest`.

### Anti-Pattern 5: Rewriting region-size prefixes for value edits

**What people do:** Recompute/rewrite entity `[int32 size]` prefixes on every edit.
**Why it's wrong:** For same-width edits the region size is unchanged; rewriting it adds risk for zero benefit. Width-changing edits (byte insertion) are explicitly out of scope for v1.
**Do this instead:** Enforce same-width writes at the patcher (`width` fixed by `kind`); if an edit would change width, reject it. Add a structural length-invariant assertion before write.

### Anti-Pattern 6: Overwriting the original file

**What people do:** Write the recompressed bytes back to the source path.
**Why it's wrong:** A single bug destroys the only good save.
**Do this instead:** Always write to a new output path; treat the loaded buffer as immutable.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Brotli codec | Node built-in `zlib.brotliDecompressSync` / `brotliCompressSync` in main | No external dependency; keep in `main/codec.ts`; consider worker_threads for large saves |
| Filesystem | `fs` in main only, via native open/save dialogs (`dialog.showOpenDialog`/`showSaveDialog`) | Read source; write NEW file; never open source for writing |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| core ↔ main | Direct function calls (main imports core) | Core stays pure; main injects the `Buffer` |
| main ↔ renderer | `ipcMain.handle` / `ipcRenderer.invoke` via preload `contextBridge` | JSON-safe DTOs only; validate sender + arg schema; one method per channel |
| renderer views ↔ edit state | Local store (`pendingEdits` map keyed by fieldId) | Intents only; no bytes/offsets |

## Suggested Build Order

Dependencies flow inward-out; build and test the core before any Electron shell exists.

1. **Binary primitives** (`core/binary`) — reader/writer for int32/int64/double/bool/7-bit string, with unit tests. *No UI, no Electron.*
2. **Format parser** (`core/format/header` + `entities`) — version, SaveHeader, entity-list walk; verify against a real decompressed save fixture.
3. **Field extraction** (`core/format/bank`, `skills`, `wallet`) — produce `FieldDescriptor`s with fresh offsets; golden-file round-trip test (parse → patch → re-parse equals expected).
4. **Model + patcher + validation** (`core/model`, `core/validation`, `xp-table`) — FieldTable, view-model builder, same-width patcher, value + structural validators.
5. **Main host** (`main/codec`, `fs-io`, `session`, `ipc-handlers`) — wire Brotli + fs + core; implement load/preview/write handlers with sender/arg validation.
6. **Preload bridge** (`preload/preload.ts`) — narrow contextBridge API; `shared/ipc-contract.ts` DTOs.
7. **Renderer UI** (`renderer/`) — Summary, Bank browser, Skill browser, inline validation, Preview/Confirm dialog, write trigger.

Rationale: steps 1–4 are the risk-bearing correctness work and are fully testable headless; steps 5–7 are comparatively standard Electron plumbing. A working, unit-tested core with a byte-exact round-trip is the milestone that de-risks everything downstream.

## Sources

- [Context Isolation | Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation) — HIGH
- [Security | Electron](https://www.electronjs.org/docs/latest/tutorial/security) — HIGH
- [Process Sandboxing | Electron](https://www.electronjs.org/docs/latest/tutorial/sandbox) — HIGH
- [contextBridge | Electron](https://www.electronjs.org/docs/latest/api/context-bridge) — HIGH
- [Electron Architecture — Process Model & IPC (emadibrahim.com)](https://www.emadibrahim.com/electron-guide/architecture) — MEDIUM
- `docs/current-skill.md` (authoritative reverse-engineered save-format spec) — HIGH
- `.planning/PROJECT.md` (project constraints and lessons learned) — HIGH

---
*Architecture research for: local desktop binary save-file editor (Electron + TypeScript)*
*Researched: 2026-07-03*
