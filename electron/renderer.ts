/// <reference lib="dom" />
// electron/renderer.ts — throwaway smoke-test renderer (RESEARCH §Architecture, Open Q 3).
//
// Phase 5 replaces this with the real UI. It ONLY calls the four `window.saveEditor` bridge methods
// and dumps their (offset-free) results into a <pre>. It touches NO Node/fs/Brotli/offsets, holds NO
// session handle, and imports nothing from `src/*`, `node:`, or `electron` — the renderer's only
// privileged surface is the four exposed methods (SC-1 / T-4-03). The DOM lib is pulled in per-file
// via the triple-slash reference above so the CommonJS tsconfig (lib: ES2022) stays unchanged.

// Hard-coded sample edits so Preview/Write exercise the full bridge round-trip. int64 currencies
// cross the wire as strings (never JSON numbers — precision, T-4-08).
const sampleEdits: ReadonlyArray<{ fieldKey: string; newValue: string | number }> = [
  { fieldKey: 'wallet.GoldPieces', newValue: '1000000' },
];

const out = document.getElementById('output')!;

function show(label: string, result: unknown): void {
  out.textContent = `${label}\n${JSON.stringify(result, null, 2)}`;
}

async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    show(label, await fn());
  } catch (err) {
    out.textContent = `${label} — error\n${String(err)}`;
  }
}

document.getElementById('btn-load')?.addEventListener('click', () => {
  void run('load', () => window.saveEditor.load());
});
document.getElementById('btn-getModel')?.addEventListener('click', () => {
  void run('getModel', () => window.saveEditor.getModel());
});
document.getElementById('btn-preview')?.addEventListener('click', () => {
  void run('preview', () => window.saveEditor.preview(sampleEdits));
});
document.getElementById('btn-write')?.addEventListener('click', () => {
  void run('write', () => window.saveEditor.write(sampleEdits));
});
