// scripts/make-icon.mjs — throwaway "MV2" placeholder application icon (D-03).
//
// Emits a single valid 256x256 32bpp Windows .ico at build/icon.ico with ZERO npm deps
// (imports only from node:fs). Run once (`node scripts/make-icon.mjs`); the output
// build/icon.ico is committed to the repo so packaging on any machine finds it. Swap in a
// real icon later by replacing that one file — no config change (D-03).
//
// Why zero-dep: electron-builder's Windows target hard-fails if win.icon is missing or its
// largest entry is below 256x256 (06-RESEARCH Pitfall 3). This script guarantees a valid,
// regenerable, >=256x256 asset. It deliberately avoids the SUS-flagged png-to-ico / sharp
// image dependencies (RESEARCH Package Legitimacy Audit, threat T-06-01) — no new
// supply-chain surface for the icon.
//
// Format: [6-byte ICONDIR][16-byte ICONDIRENTRY][40-byte BITMAPINFOHEADER + BGRA XOR bitmap
// + 1bpp all-zero AND mask]. Verified this session by `file` as
// "MS Windows icon resource - 1 icon, 256x256, 32 bits/pixel".
//
// Covers PKG-04 (icon-asset half). Deterministic: re-running reproduces byte-identical output.

import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 256;
const xor = Buffer.alloc(SIZE * SIZE * 4); // BGRA, bottom-up
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const accent = x + y < SIZE; // simple two-tone diagonal
    xor[i] = accent ? 0x2a : 0x1e; // B
    xor[i + 1] = accent ? 0x2a : 0x1e; // G
    xor[i + 2] = accent ? 0x3c : 0x28; // R
    xor[i + 3] = 0xff; // A (opaque)
  }
const andMask = Buffer.alloc((SIZE / 8) * SIZE); // 1bpp mask, all zero (alpha used)
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0); // BITMAPINFOHEADER size
dib.writeInt32LE(SIZE, 4); // width
dib.writeInt32LE(SIZE * 2, 8); // height = 2x (XOR + AND)
dib.writeUInt16LE(1, 12); // planes
dib.writeUInt16LE(32, 14); // bpp
const image = Buffer.concat([dib, xor, andMask]);
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type = icon
dir.writeUInt16LE(1, 4); // count = 1
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // width  0 => 256
entry.writeUInt8(0, 1); // height 0 => 256
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(image.length, 8); // bytesInRes
entry.writeUInt32LE(6 + 16, 12); // imageOffset (after ICONDIR + ICONDIRENTRY)
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.ico', Buffer.concat([dir, entry, image]));
console.log('wrote build/icon.ico', 6 + 16 + image.length, 'bytes');
