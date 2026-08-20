// test/packaging.config.test.ts — pins the electron-builder + package.json packaging config.
//
// Covers the automatable slice of:
//   PKG-01: default artifactName resolves to "MV2 Save Editor Setup 1.1.0.exe" (no custom template)
//   PKG-03: NSIS installer flags (oneClick / perMachine:false / createStartMenuShortcut)
//   PKG-04: appId, productName, directories.output=release, win.icon=build/icon.png
// plus the locked D-04 version bump (1.1.0), D-05 `package` script chain, and the
// electron-builder ^26 devDependency pin. These values must never silently drift from the
// acceptance bar, so they are asserted directly against the committed config.

import test from 'node:test';
import assert from 'node:assert/strict';

import builderConfig from '../electron-builder.json';
import pkg from '../package.json';

test('electron-builder.json: appId, productName, output dir (PKG-04)', () => {
  assert.equal(builderConfig.appId, 'com.jmptr.mv2-save-editor');
  assert.equal(builderConfig.productName, 'MV2 Save Editor');
  assert.equal(builderConfig.directories.output, 'release');
});

test('electron-builder.json: NSIS installer flags (PKG-03)', () => {
  assert.equal(builderConfig.nsis.oneClick, true);
  assert.equal(builderConfig.nsis.perMachine, false);
  assert.equal(builderConfig.nsis.createStartMenuShortcut, true);
});

test('electron-builder.json: win target + icon and files glob (PKG-02/04)', () => {
  assert.equal(builderConfig.win.target, 'nsis');
  assert.equal(builderConfig.win.icon, 'build/icon.png');
  assert.ok(
    builderConfig.files.includes('dist/**'),
    'files must include dist/** so preload.js + index.html stay siblings of main.js in app.asar',
  );
});

test('package.json: version 1.1.1, package script chain, electron-builder devDep (D-04/D-05)', () => {
  assert.equal(pkg.version, '1.1.1');

  const packageScript = pkg.scripts.package;
  assert.ok(packageScript, 'package.json must define a `package` script');
  assert.match(packageScript, /build:electron/);
  assert.match(packageScript, /electron-builder/);
  // Force the Windows NSIS target explicitly — without --win, electron-builder
  // defaults to the HOST platform and silently builds Linux snap/AppImage when
  // run from Linux/WSL2 instead of the intended MV2 Save Editor Setup .exe (PKG-01).
  assert.match(packageScript, /--win/);

  assert.ok(
    pkg.devDependencies['electron-builder'],
    'electron-builder must be a devDependency',
  );
});

test('default artifactName derives "MV2 Save Editor Setup 1.1.1.exe" (PKG-01)', () => {
  // electron-builder's default NSIS artifactName template is "${productName} Setup ${version}.${ext}".
  // No custom artifactName is set, so the installer filename derives from productName + version.
  const installerName = `${builderConfig.productName} Setup ${pkg.version}.exe`;
  assert.equal(installerName, 'MV2 Save Editor Setup 1.1.1.exe');
});
