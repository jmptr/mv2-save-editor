// renderer.tsx — the Chromium entry that mounts the React app (Plan 05-08, RESEARCH Code Examples).
//
// This is the browser-platform bundle (esbuild → dist/renderer.js): it runs in the sandboxed renderer
// under the strict CSP and touches ONLY the DOM + `window.saveEditor.*` — never `node:`/`fs`/`zlib`/
// `electron` and never a byte offset (that boundary lives in the main process). It imports the
// stylesheet purely for its side effect so esbuild emits `dist/renderer.css` beside the bundle; the
// path is `./ui/styles.css` (this file sits at `electron/renderer.tsx`, the stylesheet at
// `electron/ui/styles.css`) — NOT `./styles.css`, which would fail to resolve and drop renderer.css,
// leaving the CSP-linked <link rel="stylesheet" href="renderer.css"> pointing at nothing.
//
// React 19: mount with `createRoot(...).render(...)` (NOT the removed `ReactDOM.render`). The `#root`
// lookup is guarded so a missing mount point fails loudly instead of a silent white window.

import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('renderer: #root mount point not found in index.html');
}
createRoot(root).render(<App />);
