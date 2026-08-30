import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const bg = [9, 8, 7];
  const amber = [212, 160, 23];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const inset = Math.round(size * 0.12);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3;
      const edge =
        x < inset || y < inset || x >= size - inset || y >= size - inset;
      const inner =
        x >= inset &&
        y >= inset &&
        x < size - inset &&
        y < size - inset &&
        (x < inset + 6 || y < inset + 6 || x >= size - inset - 6 || y >= size - inset - 6);
      const [r, g, b] = inner || edge && (x < 4 || y < 4 || x >= size - 4 || y >= size - 4)
        ? edge && !inner
          ? bg
          : amber
        : bg;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public");
writeFileSync(join(dir, "icon-192.png"), png(192));
writeFileSync(join(dir, "icon-512.png"), png(512));
