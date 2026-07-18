# Phase 8: Release CI — Publish-on-Tag + Two-Release Validation - Research

**Researched:** 2026-07-18
**Domain:** GitHub Actions CI · electron-builder GitHub publish · electron-updater feed resolution · release/version mechanics
**Confidence:** HIGH

## Summary

Phase 8 automates the already-proven local `build:electron → electron-builder --win → GitHub Release`
chain (Phases 6–7) inside a single `windows-latest` GitHub Actions workflow triggered on `v*` tag
push, and then proves end-to-end self-update across two sequential published releases. No new npm
packages are introduced — the only new "dependencies" are first-party GitHub Actions
(`actions/checkout`, `actions/setup-node`). electron-builder and electron-updater are already wired
(publish block `github/jmptr/mv2-save-editor` present; electron-updater in `dependencies` + esbuild
`external[]`; asar-presence proven on Windows in 07-03).

The single highest-risk item flagged in STATE.md — the esbuild `@esbuild/win32-x64` platform-binary
interaction on `windows-latest` — is **substantially de-risked by inspection**: the committed
`package-lock.json` already contains all 26 `@esbuild/*` optional packages, including
`@esbuild/win32-x64@0.28.1` with correct `os:["win32"]`, `cpu:["x64"]`, `optional:true`, and
`resolved`+`integrity` fields `[VERIFIED: package-lock.json inspection]`. A plain `npm ci` on
`windows-latest` will therefore install the win32 binary from the lockfile. The concrete mitigations
are: never pass `--omit=optional`/`--no-optional`, never cross-OS-cache `node_modules`, and add a
Wave-0 lockfile-coverage test asserting `@esbuild/win32-x64` is present.

Two behaviors that are load-bearing and both **verified against electron-builder/electron-updater
docs**: (1) electron-builder's GitHub publisher creates the release as a **draft by default**
(`releaseType: "draft"`); (2) **electron-updater cannot see draft releases** — the auto-updater feed
only resolves once a human publishes the draft, which is exactly the safe manual gate CI-03 requires.

**Primary recommendation:** Add one `.github/workflows/release.yml` — `on: push: tags: ['v*']`,
`runs-on: windows-latest`, `permissions: contents: write`, `actions/checkout` → `actions/setup-node`
(node 22, `cache: npm`) → `npm ci` → `npm run build:electron` → `npx electron-builder --win --publish onTagOrDraft`
with `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Pin `package.json.version` to the tag before every
tag. Prove SC1–3 with the workflow + a static workflow-config test; SC4 is a manual two-release
Windows acceptance gate (mirrors 06-03 / 07-03).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | Pushing a `v*` tag triggers a GitHub Actions workflow that builds the Windows installer on `windows-latest` (Node 22, `npm run build:electron` before packaging) | § GitHub Actions Workflow Shape; § esbuild on windows-latest; § Code Examples (release.yml) |
| CI-02 | The workflow publishes installer + `latest.yml` + `.blockmap` as Release assets so the updater feed resolves (`permissions: contents: write`, `GH_TOKEN` passed) | § electron-builder Publish to GitHub Releases; § Pitfalls 1–4 |
| CI-03 | The release is created as a draft and published manually — the updater ignores drafts until published | § Draft-then-Manual-Publish Gate |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tag-triggered build | CI (GitHub Actions runner) | — | Build happens off the dev machine on `windows-latest`; nothing in the app itself |
| TS→JS compile | CI build step (`build:electron`) | esbuild | Must run before packaging; electron-builder must NOT rebuild TS (locked decision) |
| Installer packaging | CI (electron-builder) | NSIS toolchain (native on Windows runner) | electron-builder wraps `dist/` into `.exe`; needs native Windows (Wine constraint gone on runner) |
| Release asset upload | CI (electron-builder GitHub publisher) | GitHub Releases API via `GITHUB_TOKEN` | Publisher uploads `.exe`+`latest.yml`+`.blockmap` to the release matching `package.json` version |
| Update-feed serving | GitHub Releases (published, non-draft) | — | electron-updater reads `latest.yml` from the *published* release; drafts invisible |
| Update detect/download/apply | Installed client (electron-updater seam, Phase 7) | — | Already built; SC4 only *observes* it across two releases |
| Publish gate (draft→publish) | Human (manual) | GitHub Releases UI | The safe gate — CI creates draft, human publishes |

## Standard Stack

This phase installs **no npm packages**. The "stack" is the GitHub Actions workflow plus the
already-present toolchain.

### Core (GitHub Actions — first-party)
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `actions/checkout` | `@v4` (latest is v7.0.0, 2026-06-17) | Check out repo at the pushed tag | Canonical first-party checkout. `@v4` is the widely-used stable major; `@v5`/`@v7` also fine — the new v7 fork-PR restrictions are irrelevant to a tag-triggered non-fork workflow `[CITED: github.com/actions/checkout/releases]` |
| `actions/setup-node` | `@v4` | Install Node 22 + npm cache | Canonical Node setup; `cache: 'npm'` caches `~/.npm` (not `node_modules`) `[CITED: github.com/actions/setup-node]` |
| `windows-latest` runner | GitHub-hosted | Native Windows build host | electron-builder's NSIS/rcedit toolchain runs natively — no Wine (the 06-03 Linux constraint disappears) `[VERIFIED: 06-03-SUMMARY.md constraint + Windows runner]` |
| Node.js | `22` | Match Electron 43's bundled Node & local dev | ROADMAP SC1 mandates Node 22 `[CITED: .planning/ROADMAP.md Phase 8 SC1]` |

### Supporting (already installed — no action needed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| electron-builder | `^26.15.3` (26.15.3 resolved) | Package + publish to GitHub Releases | devDependency, present `[VERIFIED: package.json]` |
| electron-updater | `^6.8.9` | Consumes the feed on the client | dependency, present & proven in asar `[VERIFIED: 07-03-SUMMARY.md]` |
| esbuild | `^0.28.1` (0.28.1 resolved) | `build:electron` TS→JS | devDependency; win32 binary in lockfile `[VERIFIED: package-lock.json]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `npx electron-builder --publish` | `samuelmeuli/action-electron-builder` marketplace action | Adds a third-party action to the supply chain and hides the exact command; the repo already has proven local `package` script — call electron-builder directly for transparency and zero extra trust surface. **Recommend direct invocation.** |
| `--publish onTagOrDraft` | `--publish always` | Both create a draft when none exists. `always` publishes on every run (incl. non-tag); `onTagOrDraft` only when building a tagged commit or an existing draft — safer given `on: push tags` already gates the trigger. Either works; `onTagOrDraft` is the tighter fit. |
| `GITHUB_TOKEN` (auto) | Personal Access Token (PAT) | The workflow-scoped `GITHUB_TOKEN` with `permissions: contents: write` is sufficient for same-repo release upload; a PAT adds secret-management burden and broader scope. **Recommend `GITHUB_TOKEN`.** |

**Installation:** None. The workflow file is the only artifact added.

## Package Legitimacy Audit

> This phase installs **no npm packages**. electron-builder / electron-updater / esbuild were legitimacy-gated in Phases 6 and 7 (developer-approved). The only new supply-chain surface is first-party GitHub Actions.

| Component | Registry | Age | Publisher | Verdict | Disposition |
|-----------|----------|-----|-----------|---------|-------------|
| `actions/checkout` | GitHub Actions (first-party) | 7+ yrs | GitHub (`actions` org) | OK | Approved — pin to major `@v4` (or SHA for max hardening) |
| `actions/setup-node` | GitHub Actions (first-party) | 6+ yrs | GitHub (`actions` org) | OK | Approved — pin to major `@v4` |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

**Supply-chain note (optional hardening):** For a personal tool this is not required, but GitHub Actions can be pinned to a full commit SHA (e.g. `actions/checkout@<sha> # v4.x`) to defeat tag-repointing. Major-version pins (`@v4`) are the pragmatic default and match ecosystem norms. `[ASSUMED]` — see Assumptions Log A1.

## Architecture Patterns

### System Architecture Diagram

```
 Developer                         GitHub                              Installed Client (Windows)
 ─────────                         ──────                              ──────────────────────────
 bump package.json ─┐
 version to X.Y.Z   │
 git commit         │
 git tag vX.Y.Z ────┼──push tag──► [trigger: on push tags v*]
 git push --tags    │                     │
                    │                     ▼
                    │            GitHub Actions: release.yml
                    │            (runs-on windows-latest, node 22,
                    │             permissions: contents: write)
                    │                     │
                    │            checkout ─► setup-node ─► npm ci
                    │             (lockfile → @esbuild/win32-x64)
                    │                     │
                    │            npm run build:electron  (esbuild → dist/)
                    │                     │
                    │            npx electron-builder --win
                    │              --publish onTagOrDraft
                    │              (env GH_TOKEN=GITHUB_TOKEN)
                    │                     │
                    │                     ▼
                    │            ┌───────────────────────────┐
                    │            │ GitHub Release  vX.Y.Z     │
                    │            │ status: DRAFT              │
                    │            │ assets: Setup X.Y.Z.exe,  │
                    │            │   latest.yml, *.blockmap  │
                    │            └───────────────────────────┘
                    │                     │
                    └── HUMAN reviews ────► clicks "Publish release"
                                          │ (draft → published)  ◄── CI-03 safe gate
                                          ▼
                                  Published Release feed
                                  (latest.yml now visible)
                                          │
                                          │  on launch, electron-updater
                                          └──── GET latest.yml ──────────────► detects X.Y.Z > installed,
                                                                                downloads .exe (blockmap
                                                                                delta), notifies, installs
                                                                                on quit  ◄── SC4 proof
```

### Recommended Project Structure
```
.github/
└── workflows/
    └── release.yml          # the ONLY new file: tag-triggered publish workflow
test/
└── release.workflow.test.ts # Wave-0 static assertions over release.yml (node:test/tsx)
```

### Pattern 1: Tag-Triggered Publish Workflow
**What:** A single-job workflow gated on `v*` tag push that mirrors the proven local `package` chain.
**When to use:** This is the whole of CI-01/02/03.
**Example:** see § Code Examples (`release.yml`).

### Pattern 2: Version = Tag Invariant
**What:** electron-builder's GitHub publisher derives the release tag/name from `package.json.version`
(it creates/finds a release for `v${version}`), NOT from the git tag that triggered CI. Keep them
identical or assets land on a differently-named release than the tag you pushed.
**When to use:** Every release. Bump `package.json.version` → commit → `git tag v${version}` → push.
`[VERIFIED: electron-builder GithubOptions releaseType docs + version-derivation behavior]`

### Pattern 3: Static Workflow-Config Test (zero-dep, project style)
**What:** Read `.github/workflows/release.yml` as text and regex/parse-assert the load-bearing keys —
mirrors the existing `test/updater.packaging.test.ts` pattern of asserting config as text.
**When to use:** Wave 0, so the workflow contract cannot silently drift.

### Anti-Patterns to Avoid
- **Letting electron-builder rebuild TypeScript:** it must NOT. `build:electron` runs first; electron-builder only packages `dist/` (`files: ["dist/**","package.json"]`). Locked decision `[VERIFIED: STATE.md decisions, 06-02]`.
- **`--publish always` on every push:** publishing should be gated to tags. Use `on: push tags` + `--publish onTagOrDraft` so non-tag pushes never publish.
- **`npm ci --omit=optional`:** would skip `@esbuild/win32-x64` → build fails on the runner. Use plain `npm ci`.
- **Cross-OS caching `node_modules`:** a Linux `node_modules` restored on Windows carries the wrong esbuild binary. `setup-node`'s `cache: 'npm'` caches `~/.npm` only — safe; never cache `node_modules` across OS.
- **`permissions: write-all` / broad token:** grant only `contents: write` (least privilege, ASVS V4).
- **Auto-publishing (non-draft) the release:** defeats CI-03's human gate. Keep the default draft.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upload `.exe`/`latest.yml`/`.blockmap` to a Release | A custom `gh release upload` / API script | `electron-builder --publish` GitHub provider | It generates the correctly-formatted `latest.yml` (sha512, size) the updater requires; a hand-rolled upload will produce a subtly wrong feed |
| Generate the update feed metadata | Hand-written `latest.yml` | electron-builder | `latest.yml` hashes/paths must match the produced `.exe` exactly; regenerating by hand is a corruption vector |
| Detect/download/apply updates | Anything | electron-updater (already wired) | Done in Phase 7 |
| Provide a GitHub token | Create/manage a PAT | `${{ secrets.GITHUB_TOKEN }}` | Auto-provisioned, scoped, rotated per-run |

**Key insight:** The producing side (electron-builder) and consuming side (electron-updater) share the
`latest.yml` contract. Any hand-rolled substitution on either side breaks the round-trip. The whole
value of Phases 6–8 is that both ends come from the same tool family.

## esbuild `@esbuild/win32-x64` on windows-latest (STATE's #1 first-CI risk)

**Verdict: LOW risk — de-risked by lockfile inspection.** `[VERIFIED: package-lock.json inspection]`

What was checked in the committed `package-lock.json`:
- `node_modules/esbuild@0.28.1` declares all 26 `@esbuild/*` platform packages under
  `optionalDependencies`, including `@esbuild/win32-x64@0.28.1`.
- `node_modules/@esbuild/win32-x64` entry has `os:["win32"]`, `cpu:["x64"]`, `optional:true`, and
  both `resolved` (tarball URL) and `integrity` (sha512) present.
- `esbuild` has `hasInstallScript: true` (a postinstall), and `bin.esbuild → bin/esbuild`.

Why `npm ci` on `windows-latest` will work:
1. `npm ci` installs the exact lockfile tree; it selects optional deps whose `os`/`cpu` match the host
   → on win32/x64 it installs `@esbuild/win32-x64` (and skips the other 25). The `os`/`cpu` gating is
   present, so selection is deterministic.
2. Since esbuild 0.16, the platform binary is delivered **via the optional dep package**, not a
   postinstall download; esbuild's `bin/esbuild` shim resolves `@esbuild/win32-x64` at runtime. So the
   binary is present even independent of the postinstall.

Two secondary findings worth flagging to the planner:
- **`allowScripts` is currently inert.** `package.json` has `"allowScripts": {"esbuild@0.28.1": true}`,
  but there is **no `@lavamoat/allow-scripts` dependency and no `.npmrc`** `[VERIFIED: repo has no
  .npmrc, no lavamoat in lockfile]`. Plain npm does not read a top-level `allowScripts` field, so it is
  a no-op marker — esbuild's postinstall runs normally (scripts are not being ignored). This is
  *fine* for CI (scripts allowed → postinstall validates cleanly), but the field gives a false sense
  of enforcement. Do **not** add `--ignore-scripts` to CI expecting `allowScripts` to re-enable esbuild;
  it wouldn't, and even so esbuild 0.28 resolves its binary from the optional dep regardless.
- **Known historical failure mode (not present here):** old npm (v7 bug #4828) could omit
  platform-optional entries from a lockfile generated on a different OS, yielding
  `Cannot find module @esbuild/win32-x64` on the runner. This lockfile *has* all platforms, so it is
  not affected — but a **Wave-0 lockfile-coverage test** guarantees regressions surface in CI-less runs.

**Concrete mitigation (planner):**
1. Workflow uses plain `npm ci` (no `--omit=optional`, no `--no-optional`, no `--ignore-scripts`).
2. Do not cache `node_modules`; use `actions/setup-node` `cache: 'npm'` (caches `~/.npm`).
3. Add `test/release.workflow.test.ts` assertion (or a dedicated lockfile test) that
   `package-lock.json` contains `node_modules/@esbuild/win32-x64` with `os:["win32"]` — a cheap
   coverage check that fails loudly if a future `npm install` on Linux ever strips it.

## Common Pitfalls

### Pitfall 1: `package.json` version ≠ pushed tag
**What goes wrong:** You push `git tag v1.1.1` but `package.json` still says `1.1.0`. electron-builder
builds `1.1.0`, creates/uploads to a release tagged `v1.1.0`, and the `v1.1.1` tag has no assets. The
updater never sees `1.1.1`.
**Why it happens:** The git tag triggers CI, but electron-builder derives the release from
`package.json.version`, not the git ref.
**How to avoid:** Release procedure = bump `package.json.version` → commit → `git tag v${version}` →
`git push --follow-tags`. Optionally add a workflow step that fails if the tag ≠ `v$(node -p
"require('./package.json').version")`.
**Warning signs:** CI succeeds but the tag's Release page has no `.exe`/`latest.yml`.

### Pitfall 2: Missing `permissions: contents: write`
**What goes wrong:** `Resource not accessible by integration` (HTTP 403) when electron-builder tries to
create/upload the release.
**Why it happens:** Default `GITHUB_TOKEN` permissions are read-only in many orgs/repos.
**How to avoid:** Add `permissions: contents: write` at workflow or job level.
`[VERIFIED: electron-builder troubleshooting + GH Actions permissions]`
**Warning signs:** Build passes, publish step 403s.

### Pitfall 3: `GH_TOKEN` not passed to the publish step
**What goes wrong:** electron-builder can't authenticate to the GitHub publisher; publish fails or is
skipped.
**Why it happens:** electron-builder reads the token from the `GH_TOKEN` (or `GITHUB_TOKEN`) **env
var**, not from a config key.
**How to avoid:** `env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }` on the electron-builder step (or the
job). `[VERIFIED: electron-builder publish docs — "If GH_TOKEN or GITHUB_TOKEN is defined"]`

### Pitfall 4: Feed doesn't resolve because the release is still a draft
**What goes wrong:** After CI, the installed client never detects the update.
**Why it happens:** This is *by design* — electron-updater cannot read draft releases; `latest.yml` is
only served from a published release. `[VERIFIED: electron-builder troubleshooting — "ensure the
release isn't a draft"]`
**How to avoid:** This IS the CI-03 gate: a human publishes the draft. For SC4, remember to click
"Publish release" on both v1.1.0 and v1.1.1.
**Warning signs:** `updater.log` shows a 404 / "no published versions" while a draft exists.

### Pitfall 5: Publishing on every push instead of only tags
**What goes wrong:** Every commit builds/uploads, spamming draft releases or racing.
**Why it happens:** `--publish always` combined with a broad trigger (`on: push`).
**How to avoid:** `on: push: tags: ['v*']` + `--publish onTagOrDraft`.

### Pitfall 6: GSD's own tag creation colliding with the `v*` trigger
**What goes wrong:** A stray `v*` tag pushed by tooling triggers an unintended release build.
**Why it happens:** `.planning/config.json` has `git.create_tag: true`.
**How to avoid:** GSD phase/milestone tag templates are `gsd/phase-…` / `gsd/{milestone}-…` — they do
**not** match `v*`, so no collision `[VERIFIED: config.json git templates]`. Just don't hand-create
`v*` tags except for real releases.

## Code Examples

### `.github/workflows/release.yml` (recommended shape)
```yaml
# Source: composed from electron-builder GitHub Actions docs + actions/setup-node + actions/checkout
#         (all facts cross-checked; see Sources). Mirrors the proven local `npm run package` chain.
name: release

on:
  push:
    tags:
      - 'v*'          # CI-01: only version tags trigger a publish

permissions:
  contents: write     # CI-02: GITHUB_TOKEN must be able to create/upload the Release

jobs:
  release:
    runs-on: windows-latest        # CI-01: native Windows NSIS toolchain (no Wine)
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22         # CI-01: Node 22
          cache: npm               # caches ~/.npm (NOT node_modules) — safe across runs

      - run: npm ci                # installs @esbuild/win32-x64 from the committed lockfile

      - run: npm run build:electron   # CI-01: build BEFORE packaging; electron-builder never rebuilds TS

      # CI-02/03: package the built dist/ and publish assets to a DRAFT GitHub Release.
      # electron-builder default releaseType is "draft" → human publishes later (CI-03 gate).
      - run: npx electron-builder --win --config electron-builder.json --publish onTagOrDraft
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # CI-02: electron-builder reads the token from env
```

### Wave-0 static workflow test (project's zero-dep node:test/tsx style)
```typescript
// Source: mirrors test/updater.packaging.test.ts (read config as text, assert load-bearing keys)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const wf = readFileSync(join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

test('release workflow triggers on v* tags (CI-01)', () => {
  assert.match(wf, /tags:\s*\n\s*-\s*'v\*'/);
});
test('release workflow runs on windows-latest with Node 22 (CI-01)', () => {
  assert.match(wf, /runs-on:\s*windows-latest/);
  assert.match(wf, /node-version:\s*22/);
});
test('release workflow grants contents: write (CI-02)', () => {
  assert.match(wf, /permissions:\s*\n\s*contents:\s*write/);
});
test('release workflow builds before packaging and passes GH_TOKEN (CI-01/02)', () => {
  assert.match(wf, /npm run build:electron/);
  assert.match(wf, /electron-builder[^\n]*--publish\s+onTagOrDraft/);
  assert.match(wf, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
});

// Lockfile coverage: guarantees @esbuild/win32-x64 stays in the lockfile
import lock from '../package-lock.json';
test('package-lock.json includes @esbuild/win32-x64 (windows-latest build)', () => {
  const w = (lock as any).packages['node_modules/@esbuild/win32-x64'];
  assert.ok(w, '@esbuild/win32-x64 must be in the lockfile for npm ci on windows-latest');
  assert.deepEqual(w.os, ['win32']);
  assert.deepEqual(w.cpu, ['x64']);
});
```
*(Note: importing `package-lock.json` may need `resolveJsonModule`; if not enabled, read it via
`readFileSync`+`JSON.parse` to stay consistent with the existing text-assertion style.)*

## Two-Release Validation (SC4) — Procedure

No git tags exist yet `[VERIFIED: git tag -l is empty]`. `package.json.version` is already `1.1.0`.

**Automatable in CI (SC1–SC3):** the entire build → package → draft-create runs on `windows-latest`.
**Manual Windows acceptance gate (SC4):** install + observe the update — cannot run headlessly on
Linux; mirrors the 06-03 / 07-03 gates.

Minimal end-to-end procedure:
1. **Release v1.1.0.** Confirm `package.json.version == 1.1.0` → commit → `git tag v1.1.0` →
   `git push --follow-tags`. CI builds and creates a **draft** Release `v1.1.0` with `.exe`+`latest.yml`+`.blockmap`.
2. **Publish v1.1.0** manually in the GitHub Releases UI (draft → published). *(CI-03 gate.)*
3. **Install v1.1.0** on a Windows machine from the published `.exe`. Launch once (updater checks feed,
   finds no newer version → carries on; `updater.log` records the check).
4. **Release v1.1.1.** Bump `package.json.version` to `1.1.1` → commit → `git tag v1.1.1` →
   `git push --follow-tags`. CI builds a **draft** Release `v1.1.1`.
5. **Publish v1.1.1** manually.
6. **Observe update.** Launch the installed **v1.1.0** client → electron-updater reads `latest.yml`,
   sees `1.1.1 > 1.1.0`, background-downloads (using the `.blockmap` for a delta), fires the native
   "update ready" notification, and installs on quit. Re-launch → app is v1.1.1. *(SC4 proof.)*

**What the updater feed requires (all three assets):** `latest.yml` (version + sha512 + file size + path),
the `.exe` (the actual installer), and the `.exe.blockmap` (enables differential download). electron-builder
produces all three; the publisher uploads all three. `[VERIFIED: electron-builder publish + electron-updater feed]`

## Runtime State Inventory

Not applicable — Phase 8 is additive (one workflow file + one test) with no rename/refactor/migration.
No stored data, live-service config, OS-registered state, secrets, or build artifacts carry a renamed
string. **None — verified: the phase adds `.github/workflows/release.yml` and a test; it renames nothing.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` run via `tsx` `[VERIFIED: package.json "test": "tsx --test 'test/**/*.test.ts'"]` |
| Config file | none — glob-driven; `c8` for coverage |
| Quick run command | `npm test` |
| Full suite command | `npm test` + `npm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CI-01 | `release.yml` triggers on `v*`, runs on `windows-latest`, Node 22, runs `build:electron` before packaging | unit (static) | `npm test` → `test/release.workflow.test.ts` (text-assert the YAML) | ❌ Wave 0 |
| CI-02 | workflow has `permissions: contents: write`, passes `GH_TOKEN`, publishes via electron-builder | unit (static) | `npm test` → `test/release.workflow.test.ts` | ❌ Wave 0 |
| CI-03 | electron-builder default = draft (no `--publish` override forcing publish; no `releaseType` change) | unit (static) | assert config/workflow contain no `releaseType:"release"` / auto-publish override | ❌ Wave 0 |
| CI-01 | lockfile carries `@esbuild/win32-x64` so `npm ci` works on the runner | unit (static) | `npm test` → lockfile-coverage assertion | ❌ Wave 0 |
| CI-01/02 (runtime) | real tag push produces a draft Release with all 3 assets | manual/CI-observed | push `v1.1.0`, inspect the draft Release | Manual gate |
| SC4 (runtime) | installed v1.1.0 self-updates to v1.1.1 | manual (Windows) | two-release procedure above | Manual gate |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test` + `npm run typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`; then the real tag-push + two-release manual gate.

### Wave 0 Gaps
- [ ] `test/release.workflow.test.ts` — static assertions over `.github/workflows/release.yml` (CI-01/02/03) + `@esbuild/win32-x64` lockfile-coverage check.

*No framework install needed — `node:test`/`tsx` already present. YAML is asserted as text (zero-dep),
matching the existing `test/updater.packaging.test.ts` idiom; do NOT add a YAML-parser dependency.*

## Security Domain

`security_enforcement: true`, ASVS level 1. This phase's attack surface is the CI pipeline and the
release-publishing token.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No app auth; CI uses the ephemeral `GITHUB_TOKEN` |
| V3 Session Management | no | — |
| V4 Access Control | yes | Least-privilege `permissions: contents: write` (not `write-all`); `GITHUB_TOKEN` scoped to the repo, rotated per run |
| V5 Input Validation | minimal | The only external input is the tag name (push-restricted to repo writers); optional guard asserts tag == `v${package.json.version}` |
| V6 Cryptography | no (accepted) | Build is **unsigned** for v1.1 (documented in REQUIREMENTS out-of-scope); electron-updater still verifies `latest.yml` sha512 against the downloaded `.exe` |
| V14 Configuration / Supply Chain | yes | Pin GitHub Actions to major (or SHA); no `--ignore-scripts` bypass; committed lockfile; no third-party marketplace action |

### Known Threat Patterns for GitHub Actions release CI
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Over-privileged token uploads/deletes arbitrary content | Elevation of Privilege | `permissions: contents: write` only; no PAT |
| Malicious/repointed third-party action | Tampering | Use only first-party `actions/*`; pin to major/SHA |
| Secret exfiltration via logged token | Information Disclosure | Never `echo`/print `GITHUB_TOKEN`; pass via `env:` only; GH masks it in logs |
| Unintended publish on non-release push | Tampering | `on: push tags: ['v*']` + `--publish onTagOrDraft` |
| Unauthenticated user pushing a release tag | Spoofing | Repo push permission required to create tags; draft-then-manual-publish adds a human gate |
| Unsigned installer / SmartScreen | Tampering (accepted) | Out of scope v1.1 (documented); updater sha512 integrity still enforced on the delta |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| esbuild postinstall *downloads* the binary at install | Platform binary shipped as `@esbuild/*` optionalDependency; postinstall optional | esbuild 0.16 (Dec 2022) | `npm ci` from a full lockfile is reliable on any OS; no network download during postinstall |
| `set-output` / node16 actions | node20 runners, `GITHUB_OUTPUT`, `actions/checkout@v4+`, `setup-node@v4` | 2023–2024 | Use current majors; older majors are deprecated |
| Third-party `action-electron-builder` | Direct `npx electron-builder --publish` call | ongoing | Fewer trust dependencies; transparent command matching local `package` script |

**Deprecated/outdated:**
- `actions/checkout@v2/v3`, `actions/setup-node@v2/v3` — superseded; use `@v4`.
- Relying on esbuild's postinstall network download — obsolete since 0.16.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SHA-pinning GitHub Actions is optional hardening (major-version pin acceptable for a personal tool) | Package Legitimacy Audit | Low — major pins are ecosystem norm; SHA-pin only raises the bar |
| A2 | `actions/checkout@v4` and `actions/setup-node@v4` are the right majors to pin (v5/v7 exist but aren't required) | Standard Stack | Low — any current major works for this non-fork tag workflow; v4 is broadly stable |

**All other claims are VERIFIED (local inspection) or CITED (electron-builder/electron-updater/GitHub
Actions docs).**

## Open Questions

1. **Should CI hard-fail on a tag/version mismatch?**
   - What we know: electron-builder derives the release from `package.json.version`, not the git ref.
   - What's unclear: whether to add a guard step or rely on release discipline.
   - Recommendation: add a one-line guard step (`node -p` compare) — cheap insurance against Pitfall 1.

2. **`--publish onTagOrDraft` vs `always`.**
   - What we know: both create a draft when none exists; the trigger is already tag-gated.
   - Recommendation: `onTagOrDraft` (tighter); either satisfies CI-02/03.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions `windows-latest` | CI-01 build host | ✓ (GitHub-hosted) | Windows Server + Node 22 via setup-node | — |
| Node 22 on runner | CI-01 | ✓ via `actions/setup-node@v4` | 22 | — |
| electron-builder NSIS toolchain | CI-01/02 | ✓ native on Windows runner (no Wine) | 26.15.3 | — |
| `GITHUB_TOKEN` with `contents: write` | CI-02 | ✓ auto-provisioned | per-run | PAT (not recommended) |
| Windows machine for SC4 acceptance | SC4 | ✗ on CI (headless) | — | Manual gate on the developer's Windows box (as in 06-03/07-03) |

**Missing dependencies with no fallback:** none for CI-01/02/03.
**Missing dependencies with fallback:** SC4 end-to-end update observation → manual Windows gate.

## Sources

### Primary (HIGH confidence)
- `package-lock.json` (local inspection) — `@esbuild/win32-x64@0.28.1` present with `os`/`cpu`/`optional`/`resolved`/`integrity`; esbuild `optionalDependencies` list; no lavamoat.
- `package.json`, `electron-builder.json`, `scripts/build.mjs`, `electron/updater.ts` (local) — build chain, publish block, esbuild `external`, updater seam.
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, Phase 6/7 SUMMARYs, `07-CONTEXT.md`, `07-VALIDATION.md` — success criteria, locked decisions, prior gates.
- electron-builder publish docs — `releaseType` default = draft; `--publish` = onTag/onTagOrDraft/always/never; token via `GH_TOKEN` or `GITHUB_TOKEN`.
- electron-builder troubleshooting + issue tracker (#4258, #6397, #7912) — draft releases invisible to electron-updater.

### Secondary (MEDIUM confidence)
- WebSearch synthesis on electron-builder GitHub Actions workflow shape (`permissions: contents: write`, `--publish always`/`onTagOrDraft`, `GH_TOKEN`).
- `actions/setup-node` / `actions/checkout` READMEs & releases — current majors, `cache: 'npm'` semantics.

### Tertiary (LOW confidence)
- None load-bearing; SHA-pin recommendation flagged `[ASSUMED]` (A1/A2).

## Metadata

**Confidence breakdown:**
- Workflow shape (CI-01): HIGH — standard idioms cross-checked; direct electron-builder invocation.
- Publish/draft/updater behavior (CI-02/03): HIGH — verified against electron-builder docs + tracker.
- esbuild-on-windows risk: HIGH — de-risked by direct lockfile inspection.
- Action version pins: MEDIUM — majors verified; exact latest-major is fast-moving (see A2).

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (30 days; GitHub Actions majors and electron-builder minor may move — re-check action versions at planning if later).
