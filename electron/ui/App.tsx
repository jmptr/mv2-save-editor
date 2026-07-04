// App.tsx — the single top-level orchestrator wiring the whole renderer (RESEARCH Pattern 2, D-02/07/08).
//
// Owns the ONE `useReducer(appReducer, initialState)` for the entire app (no external store — CLAUDE.md)
// and orchestrates the four bridge calls on `window.saveEditor.*`, mapping each discriminated result to a
// dispatch. Layout is the UI-SPEC D-05 stack: a full-width SummaryBar over two side-by-side browse panels
// (BankPanel | SkillPanel) over the preview/write bar, with the non-blocking Banner on top and the
// authoritative PreviewModal on top of everything when a preview is open.
//
// Trust boundary (T-05-03/05): this module touches ONLY `window.saveEditor.*` — never `node:`/`fs`/
// `zlib`/`electron` and never a byte offset or a bigint. The dirty-edit payload is DERIVED by
// `editsToPayload` (pure selector), Preview is gated on `dirtyCount > 0` (D-02/D-07), and a write can
// only fire from the modal confirm (SAFE-02, D-08 — main owns the native Save-As dialog and re-validates
// every edit against its own FieldTable). All `src/*` shapes cross in via `import type` (esbuild-erased).

import { useCallback, useReducer } from 'react';
import { AppContext } from './AppContext';
import { appReducer, initialState } from './state/reducer';
import { editsToPayload, dirtyCount } from './state/selectors';
import { SummaryBar } from './components/SummaryBar';
import { BankPanel } from './components/BankPanel';
import { SkillPanel } from './components/SkillPanel';
import { PreviewModal } from './components/PreviewModal';
import { Banner, type BannerProps } from './components/Banner';
import type { ErrorKind } from '../../src/ipc/results';

/**
 * The root component. Holds the single reducer, orchestrates load → getModel → preview → write over the
 * frozen bridge, and renders the empty / loading / populated surfaces.
 */
export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // The dirty count is DERIVED (D-02) — never stored; recomputed each render from the accumulator. The
  // matching payload is recomputed inside each bridge handler from the freshest state (closure-safe).
  const count = dirtyCount(state);
  const loading = state.status === 'loading';

  // ── Bridge orchestration: each handler maps a discriminated result to a dispatch. ──

  // load(): native open dialog (main owns the path) → on success immediately fetch the offset-free model.
  const handleOpen = useCallback(async (): Promise<void> => {
    dispatch({ t: 'LOAD_START' });
    const res = await window.saveEditor.load();
    if (res.ok) {
      if ('cancelled' in res) {
        dispatch({ t: 'LOAD_CANCELLED' });
        return;
      }
      // A summary opened — now pull the full offset-free ViewModel that drives the browse panels.
      const model = await window.saveEditor.getModel();
      if (model.ok) {
        dispatch({ t: 'LOAD_OK', viewModel: model.viewModel });
      } else {
        dispatch({ t: 'LOAD_ERR', kind: model.kind, message: model.message });
      }
      return;
    }
    dispatch({ t: 'LOAD_ERR', kind: res.kind, message: res.message });
  }, []);

  // preview(payload): dry-run against main's FieldTable → open the authoritative modal (D-07). A validation
  // failure carries `violations` (surfaced in the modal, which blocks the write); any other failure opens
  // the modal empty (write stays disabled — SAFE-02) so the user is never silently left without feedback.
  const handlePreview = useCallback(async (): Promise<void> => {
    const res = await window.saveEditor.preview(editsToPayload(state));
    if (res.ok) {
      dispatch({ t: 'PREVIEW_OK', rows: res.changeReport, violations: [] });
    } else {
      dispatch({ t: 'PREVIEW_OK', rows: [], violations: res.violations ?? [] });
    }
  }, [state]);

  // write(payload): fires ONLY from the modal confirm (SAFE-02, D-08). main owns the native Save-As dialog
  // and writes a NEW .sav (non-destructive). On success close the modal; on cancel leave everything intact.
  const handleWrite = useCallback(async (): Promise<void> => {
    dispatch({ t: 'WRITE_START' });
    const res = await window.saveEditor.write(editsToPayload(state));
    if (res.ok) {
      if ('cancelled' in res) {
        dispatch({ t: 'WRITE_CANCELLED' });
        return;
      }
      dispatch({ t: 'WRITE_OK', outputPath: res.outputPath });
      dispatch({ t: 'PREVIEW_CLOSE' });
      return;
    }
    dispatch({ t: 'WRITE_ERR', message: res.message });
  }, [state]);

  const handleClosePreview = useCallback((): void => {
    dispatch({ t: 'PREVIEW_CLOSE' });
  }, []);

  // ── Banner props: fail-safe framed copy for a load OR a write error, plus non-blocking notices. ──
  const bannerProps: BannerProps = {
    unknownVersion: state.viewModel?.unknownVersion === true,
    unresolvedFields: state.viewModel?.unresolvedFields ?? [],
  };
  if (state.status === 'load-error' && state.errorKind !== undefined) {
    // Load/parse failure — pass the real kind so Banner picks the load-error copy (never the raw kind).
    bannerProps.error = { kind: state.errorKind as ErrorKind, message: state.errorMessage ?? '' };
  } else if (state.write.status === 'error') {
    // Write failure — a write-path kind selects the "Write failed … original not changed" copy.
    bannerProps.error = { kind: 'write-invariant', message: state.write.message ?? '' };
  }
  if (state.write.status === 'success' && state.write.outputPath !== undefined) {
    bannerProps.successPath = state.write.outputPath;
  }

  const vm = state.viewModel;

  return (
    <AppContext.Provider value={{ dispatch, edits: state.edits }}>
      <div className="app-layout">
        <div className="write-bar">
          <button type="button" className="btn-primary" onClick={handleOpen} disabled={loading}>
            Open Save File…
          </button>
          {loading && <span className="column-header">Loading…</span>}
        </div>

        <Banner {...bannerProps} />

        {vm === null ? (
          <div className="empty-state">
            <p className="panel-title">No save loaded</p>
            <p className="column-header">Choose a .sav file to browse and edit its contents.</p>
          </div>
        ) : (
          <>
            <SummaryBar summary={vm.summary} edits={state.edits} dispatch={dispatch} />

            <div className="browse-area">
              <BankPanel items={vm.bankItems} edits={state.edits} dispatch={dispatch} />
              <SkillPanel skills={vm.skills} edits={state.edits} dispatch={dispatch} />
            </div>

            <div className="write-bar">
              <button
                type="button"
                className="btn-primary"
                onClick={handlePreview}
                disabled={count === 0 || loading}
              >
                Preview Changes
              </button>
              {count > 0 ? (
                <span className="badge" aria-label={`${count} pending change(s)`}>
                  {count}
                </span>
              ) : (
                <span className="column-header">No pending changes.</span>
              )}
            </div>
          </>
        )}

        {state.preview !== null && (
          <PreviewModal
            rows={state.preview.rows}
            violations={state.preview.violations}
            count={state.preview.rows.length}
            onConfirm={handleWrite}
            onClose={handleClosePreview}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}
