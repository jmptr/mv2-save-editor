// electron/ui/globals.d.ts — ambient module shims for the renderer typecheck (Plan 05-02).
//
// The renderer imports its stylesheet for the side effect of esbuild emitting dist/renderer.css
// (`import './renderer.css'`). tsc has no loader for `.css`, so this ambient declaration makes such
// an import resolve to an untyped module — accepted by `typecheck:ui`, erased by esbuild at build.
declare module '*.css';
