// Banner.tsx — the safe error/warning surface (ErrorKind→copy mapping + non-blocking notices).
//
// The one place a main-process failure `kind` becomes user-facing text. It maps EVERY `ErrorKind`
// (the exhaustive union from src/ipc/results.ts) to the UI-SPEC framed copy and NEVER renders a raw
// `kind` string (T-05-09 / Copy rules): load/parse failures collapse to the "Couldn't read this
// save file…" copy, and the write-invariant / no-session / internal kinds render the
// "Write failed: {message}. Your original file was not changed." copy. It also renders two
// NON-BLOCKING notices that never disable editing: the `unknownVersion` warning
// ("Newer save version than tested — parsed anyway; review changes carefully.") and, if present, an
// `unresolvedFields` ambiguity notice (D-03). Problem banners use `--c-destructive` (via
// `.banner--error`); the write-success line is neutral text + a ✓ glyph — no green token, to preserve
// the 10% accent discipline (UI-SPEC Color). All messages render as auto-escaped React text children.

import type { ErrorKind } from '../../../src/ipc/results';
import type { UnresolvedField } from '../../../src/view-model';

/** The verbatim UI-SPEC load/parse failure copy (a `kind` is never surfaced raw — Copy rules). */
const LOAD_ERROR_COPY =
  "Couldn't read this save file. It may be from an unsupported game version. Choose a different .sav file.";

/** The verbatim UI-SPEC non-blocking unknown-version warning (SC-5 — warn but parse). */
const UNKNOWN_VERSION_COPY =
  'Newer save version than tested — parsed anyway; review changes carefully.';

/**
 * Map an `ErrorKind` + message to its UI-SPEC framed copy — NEVER the raw kind (T-05-09). Write-path
 * kinds (`write-invariant` / `no-session` / `internal`) surface the write-failure copy with the
 * non-destructive reassurance; every other kind collapses to the load/parse copy. The `never`
 * default makes a newly-added kind a compile error (exhaustiveness).
 */
export function errorCopy(kind: ErrorKind, message: string): string {
  switch (kind) {
    case 'write-invariant':
    case 'no-session':
    case 'internal':
      return `Write failed: ${message}. Your original file was not changed.`;
    case 'validation':
    case 'readonly':
    case 'unknown-field':
    case 'conflict':
    case 'bad-args':
      return LOAD_ERROR_COPY;
    default: {
      // Exhaustiveness guard: a new ErrorKind without a case is a compile error.
      const _never: never = kind;
      return _never;
    }
  }
}

/** Props for the banner surface. Every field is optional — the banner renders only what applies. */
export interface BannerProps {
  /** A typed failure from main (mapped to framed copy — the raw kind is never rendered). */
  error?: { kind: ErrorKind; message: string };
  /** True when the save version is newer than tested → non-blocking warning (does NOT disable editing). */
  unknownVersion?: boolean;
  /** Fields with >1 context-validated candidate (D-03) → non-blocking ambiguity notice. */
  unresolvedFields?: UnresolvedField[];
  /** A successful write's output path → neutral "✓ Saved to {path}" line (no green token). */
  successPath?: string;
}

/**
 * The banner surface: renders (in order) the write-success line, the framed error, the non-blocking
 * unknown-version warning, and the non-blocking unresolved-fields notice — each only when applicable.
 * Returns `null` when there is nothing to show.
 */
export function Banner({
  error,
  unknownVersion,
  unresolvedFields,
  successPath,
}: BannerProps): React.ReactElement | null {
  const hasUnresolved = unresolvedFields !== undefined && unresolvedFields.length > 0;
  if (
    error === undefined &&
    unknownVersion !== true &&
    !hasUnresolved &&
    successPath === undefined
  ) {
    return null;
  }

  return (
    <>
      {successPath !== undefined && (
        // Write success: neutral text + ✓ glyph — no green token (UI-SPEC Color discipline).
        <div className="banner" role="status">
          {'✓ '}
          Saved to <span className="mono">{successPath}</span>
        </div>
      )}
      {error !== undefined && (
        <div className="banner banner--error" role="alert">
          {errorCopy(error.kind, error.message)}
        </div>
      )}
      {unknownVersion === true && (
        <div className="banner" role="status">
          {UNKNOWN_VERSION_COPY}
        </div>
      )}
      {hasUnresolved && (
        <div className="banner" role="status">
          Some fields matched more than one location and were left unresolved — review before editing:{' '}
          <span className="mono">
            {unresolvedFields.map((f) => f.field).join(', ')}
          </span>
        </div>
      )}
    </>
  );
}
