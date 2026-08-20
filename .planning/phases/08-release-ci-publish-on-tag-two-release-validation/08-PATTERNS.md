# Phase 8: Release CI — Publish-on-Tag + Two-Release Validation - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 3 (1 net-new domain: GitHub Actions; 1 static test; 1 optional package.json edit)
**Analogs found:** 2 / 3 (workflow YAML has no in-repo analog — canonical shape provided from RESEARCH)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/workflows/release.yml` | config (CI pipeline) | event-driven (tag-push trigger) | *(none — no `.github/workflows/` exists)* | no analog — see § No Analog Found |
| `test/release.workflow.test.ts` | test (static config) | transform (read config → assert) | `test/updater.packaging.test.ts` | exact (idiom) |
| `package.json` (optional `release`/version edit) | config | — | existing `scripts` block + `version` field | in-file precedent |

**Verified facts driving classification:**
- No `.github/workflows/` directory exists (`.github/` at repo root holds only `agents/`, `gsd-core/`, `hooks/`, `scripts/`, `copilot-instructions.md`). `release.yml` is genuinely net-new; there is no in-repo YAML workflow to mirror.
- `git tag -l` is empty — no `v*` tags exist yet.
- `tsconfig.json` has `resolveJsonModule: true` (line 15) → the lockfile-coverage test MAY `import lock from '../package-lock.json'`, but the established project idiom is `readFileSync`+`JSON.parse` / `import ... from '../*.json'` (both used). Existing tests import JSON directly (`import pkg from '../package.json'`); this is the preferred, typed path.

---

## Pattern Assignments

### `test/release.workflow.test.ts` (test, static-config)

**Analog:** `test/updater.packaging.test.ts` (exact idiom match). Secondary: `test/packaging.config.test.ts`, `test/packaging.dist-layout.test.ts`.

This is the load-bearing analog. The new test must be byte-for-byte faithful to this file's structure: zero-dep `node:test`, CommonJS `__dirname` (NOT `import.meta.url`), text reads via `readFileSync(join(__dirname,'..',…),'utf8')` + `assert.match`, and requirement-tagged test titles.

**Imports pattern** (`test/updater.packaging.test.ts` lines 12–18) — copy verbatim, adjust config imports:
```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
```
Idiom notes:
- `import test from 'node:test'` (default import) + `import assert from 'node:assert/strict'` — every test file in `test/` uses exactly these two.
- **CommonJS `__dirname` is available and used directly** — do NOT introduce `import.meta.url`/`fileURLToPath`. `package.json` is `"type": "commonjs"` and `tsx --test` runs these as CJS.

**Text-read-and-assert core pattern** (`test/updater.packaging.test.ts` lines 45–58) — this is the exact idiom to mirror for reading `release.yml` as text (do NOT add a YAML parser dependency):
```typescript
test('scripts/build.mjs keeps electron-updater external in esbuild (D-06 / success criterion 4)', () => {
  // build.mjs is an .mjs config — read it as text rather than importing (it runs a build on import).
  const buildScript = readFileSync(join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8');
  assert.match(
    buildScript,
    /external:\s*\[[^\]]*'electron'[^\]]*\]/,
    "esbuild external[] must contain 'electron'",
  );
});
```
Apply to `release.yml`: `const wf = readFileSync(join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');` then `assert.match(wf, /…/, 'message')` per CI-01/02/03. See RESEARCH § Code Examples lines 324–357 for the exact regexes.

**Requirement-tagged test title pattern** (`test/packaging.config.test.ts` lines 17, 23, 38) — every title ends with the requirement ID in parens:
```typescript
test('electron-builder.json: appId, productName, output dir (PKG-04)', () => { … });
test('electron-builder.json: NSIS installer flags (PKG-03)', () => { … });
```
Apply: `test('release workflow triggers on v* tags (CI-01)', …)`, `(CI-02)`, `(CI-03)`. Match the tone of the header comment block too — every test file opens with a `//` comment naming which requirements it pins and why the values "must never silently drift."

**Typed JSON-config import pattern** (`test/packaging.config.test.ts` lines 14–15, used for assertions against structured config):
```typescript
import builderConfig from '../electron-builder.json';
import pkg from '../package.json';
```
Apply to the lockfile-coverage assertion. `resolveJsonModule: true` is set, so `import lock from '../package-lock.json'` type-checks. Prefer this typed import over `readFileSync`+`JSON.parse` for the structured `packages['node_modules/@esbuild/win32-x64']` lookup — it matches how `pkg`/`builderConfig` are already consumed. (RESEARCH note lines 359–360 flags the fallback; `resolveJsonModule` is confirmed enabled so the import path is clean.)

**Lockfile-coverage assertion target** (VERIFIED in `package-lock.json` lines 790–802):
```json
"node_modules/@esbuild/win32-x64": {
  "version": "0.28.1",
  "cpu": ["x64"],
  "optional": true,
  "os": ["win32"],
  ...
}
```
Assert `lock.packages['node_modules/@esbuild/win32-x64']` exists with `os: ['win32']` and `cpu: ['x64']`. This is the STATE #1-risk regression guard (RESEARCH lines 350–357).

---

### `.github/workflows/release.yml` (config, event-driven)

**Analog:** NONE in-repo. No `.github/workflows/` directory exists. Use the canonical shape from RESEARCH § Code Examples (lines 288–322), reproduced here as the copy source.

Although there is no YAML analog, the workflow must stay consistent with two committed artifacts — treat them as the source of truth for the command chain:

1. **Command chain mirrors `package.json` scripts** (`package.json` lines 21–24). The workflow's build+package steps must reproduce the proven local chain, NOT invent a new one:
```json
"build:electron": "node scripts/build.mjs",
"package": "npm run build:electron && electron-builder --win --config electron-builder.json",
```
→ Workflow steps: `npm run build:electron` then `npx electron-builder --win --config electron-builder.json --publish onTagOrDraft`. The `--win --config electron-builder.json` flags come straight from the existing `package` script (do not drop `--config`, matching local invocation).

2. **Publish target is already wired** (`electron-builder.json` publish block, asserted by `test/updater.packaging.test.ts` lines 37–43): `{ provider: 'github', owner: 'jmptr', repo: 'mv2-save-editor' }`. The workflow adds no publish config — it only supplies `GH_TOKEN` env + `--publish onTagOrDraft`. Default `releaseType` stays `draft` (CI-03 gate); do NOT add any `releaseType: release` override.

**Canonical workflow shape to copy** (RESEARCH lines 289–322):
```yaml
name: release
on:
  push:
    tags:
      - 'v*'                # CI-01
permissions:
  contents: write           # CI-02
jobs:
  release:
    runs-on: windows-latest # CI-01: native NSIS, no Wine
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22  # CI-01
          cache: npm        # caches ~/.npm only — never node_modules (cross-OS binary hazard)
      - run: npm ci         # installs @esbuild/win32-x64 from lockfile; no --omit=optional / --ignore-scripts
      - run: npm run build:electron   # CI-01: build BEFORE packaging; electron-builder never rebuilds TS
      - run: npx electron-builder --win --config electron-builder.json --publish onTagOrDraft
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # CI-02
```
Idiom notes / anti-patterns (RESEARCH lines 176–182, 236–277):
- Pin actions to major `@v4` (A1/A2 — SHA-pin optional hardening, not required for a personal tool).
- Plain `npm ci` only — `--omit=optional`/`--no-optional`/`--ignore-scripts` would strip `@esbuild/win32-x64`.
- `cache: npm` (caches `~/.npm`); NEVER cache `node_modules` across OS.
- `permissions: contents: write` only — not `write-all`.
- Optional guard step (Open Question 1): fail if pushed tag ≠ `v$(node -p "require('./package.json').version")` — cheap insurance against the Pitfall-1 version/tag mismatch.

---

### `package.json` (optional edit — config)

**Analog:** the existing `scripts` block (`package.json` lines 17–25) and `version` field (line 3, `"1.1.0"`).

No new dependencies this phase (RESEARCH § Standard Stack). Any change is limited to:
- **Version bump** for each release: `"version": "1.1.0"` → next tag value (Version=Tag invariant, RESEARCH Pattern 2). electron-builder derives the release from `package.json.version`, not the git ref.
- **Optional `release` helper script** if desired, following the exact style of the existing chain-style scripts (line 23): `"package": "npm run build:electron && electron-builder --win --config electron-builder.json"`. A `release` script would compose the bump/commit/tag steps in the same `&&`-chained idiom. Keep it minimal — RESEARCH treats the release procedure as manual dev discipline, so a script is optional, not required.

Note: `test/packaging.config.test.ts` line 39 asserts `pkg.version === '1.1.0'`. If the version is bumped as part of this phase, that assertion must be updated in lockstep (flag to planner — it is a coupled edit, not a silent drift).

---

## Shared Patterns

### Static-config test idiom (zero-dep, project-wide)
**Source:** `test/updater.packaging.test.ts`, `test/packaging.config.test.ts`, `test/packaging.dist-layout.test.ts`
**Apply to:** `test/release.workflow.test.ts`
- Header `//` comment naming pinned requirement IDs + "must never silently drift" rationale.
- `import test from 'node:test'` + `import assert from 'node:assert/strict'`.
- CommonJS `__dirname` (never `import.meta.url`).
- Structured config → typed `import x from '../*.json'`; free-form config (`.mjs`, `.yml`) → `readFileSync(join(__dirname,'..',…),'utf8')` + `assert.match`.
- No new test/parse dependencies (no YAML parser).
- Test titles suffixed with `(CI-0X)`.

### Version=Tag invariant
**Source:** RESEARCH Pattern 2 + `electron-builder.json` publish block
**Apply to:** `release.yml` (optional guard step) and `package.json` (version bump)
- electron-builder resolves the release from `package.json.version`; keep git tag `v${version}` identical.

### Command-chain fidelity
**Source:** `package.json` scripts lines 21–24
**Apply to:** `release.yml` build/package steps
- CI must reproduce `build:electron` → `electron-builder --win --config electron-builder.json`; only additions are `--publish onTagOrDraft` and `GH_TOKEN` env.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/release.yml` | config (CI) | event-driven | No `.github/workflows/` directory exists; first CI workflow in the repo. Use RESEARCH § Code Examples canonical shape (lines 288–322), constrained by existing `package.json` scripts + `electron-builder.json` publish block. |

---

## Metadata

**Analog search scope:** `test/`, `.github/`, repo root (`package.json`, `package-lock.json`, `electron-builder.json`, `tsconfig.json`, `scripts/`)
**Files scanned:** ~8
**Key verified facts:** no `.github/workflows/`; no `v*` git tags; `resolveJsonModule: true`; `@esbuild/win32-x64@0.28.1` present in lockfile (lines 790–802) with `os:["win32"]`/`cpu:["x64"]`/`optional:true`; `package.json.version === "1.1.0"`.
**Pattern extraction date:** 2026-07-18
