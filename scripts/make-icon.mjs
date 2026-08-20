// scripts/make-icon.mjs — throwaway "MV2" placeholder application icon (D-03).
//
// Emits a single valid 512x512 32-bit RGBA PNG at build/icon.png with ZERO npm deps
// (imports only from node:fs + node:zlib). Run once (`node scripts/make-icon.mjs`); the
// output build/icon.png is committed to the repo so packaging on any machine finds it.
// Swap in a real icon later by replacing that one file — no config change (D-03).
//
// Why a PNG (not the earlier .ico): electron-builder 26.x's icon pipeline
// (app-builder-lib/util/iconConverter.js) generates the Windows .ico — and every other
// size — from a raster/vector SOURCE, and its icon tool rejects a .ico as input
// ("Unsupported input format .ico. Supported: .png, .svg, .icns"). A .png source is used
// directly for the `set` format and is converted to a .ico for the Windows app icon, so
// one committed PNG covers PKG-04. The source must be >=256x256 (iconConverter recommendedMin);
// 512x512 is used for headroom on generated sizes.
//
// Why zero-dep: this deliberately avoids the SUS-flagged png-to-ico / sharp image
// dependencies (RESEARCH Package Legitimacy Audit, threat T-06-01) — no new supply-chain
// surface for the icon. node:zlib is a Node builtin (the same Brotli/deflate core the app
// already relies on), so DEFLATE compression adds no dependency.
//
// Format: 8-byte PNG signature + IHDR (512x512, 8-bit, color type 6 = RGBA) + IDAT
// (zlib-DEFLATE of filter-0 scanlines) + IEND. Chunk CRC32s use the PNG polynomial.
//
// Covers PKG-04 (icon-asset half). Deterministic: re-running reproduces byte-identical output.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;

// CRC32 (PNG polynomial 0xEDB88320), table-based — pure JS, no dependency.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

// IHDR: width, height, bit depth 8, color type 6 (RGBA), default compression/filter/interlace.
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr.writeUInt8(8, 8); // bit depth
ihdr.writeUInt8(6, 9); // color type: RGBA
ihdr.writeUInt8(0, 10); // compression
ihdr.writeUInt8(0, 11); // filter method
ihdr.writeUInt8(0, 12); // interlace

// Raw image data: each scanline is a filter byte (0 = none) followed by SIZE*4 RGBA bytes.
// Simple two-tone diagonal placeholder monogram (opaque), same spirit as the prior .ico.
const rowLen = 1 + SIZE * 4;
const raw = Buffer.alloc(rowLen * SIZE);
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * rowLen;
  raw.writeUInt8(0, rowStart); // filter: none
  for (let x = 0; x < SIZE; x++) {
    const accent = x + y < SIZE; // two-tone diagonal
    const p = rowStart + 1 + x * 4;
    raw.writeUInt8(accent ? 0x3c : 0x28, p); // R
    raw.writeUInt8(accent ? 0x2a : 0x1e, p + 1); // G
    raw.writeUInt8(accent ? 0x2a : 0x1e, p + 2); // B
    raw.writeUInt8(0xff, p + 3); // A (opaque)
  }
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log('wrote build/icon.png', png.length, 'bytes', `(${SIZE}x${SIZE} RGBA)`);
