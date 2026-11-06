import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcVal = crc32(crcData);
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

function generatePNG(size) {
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (1 + width * 4));

  // Electric Blue #3b82f6 background with rounded center card
  const rBg = 59, gBg = 130, bBg = 246; // #3b82f6
  const rCard = 24, gCard = 24, bCard = 27; // #18181b

  let offset = 0;
  const radius = Math.floor(size * 0.15);

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      // Rounded rectangle for icon
      const inX = x >= radius && x < width - radius;
      const inY = y >= radius && y < height - radius;
      let inside = inX || inY;
      if (!inside) {
        const cx = x < radius ? radius : width - radius - 1;
        const cy = y < radius ? radius : height - radius - 1;
        const dist = Math.hypot(x - cx, y - cy);
        inside = dist <= radius;
      }

      if (inside) {
        // Draw inner board columns motif
        const isBorder = x === radius || x === width - radius - 1 || y === radius || y === height - radius - 1;
        const isCol1 = x > size * 0.25 && x < size * 0.45 && y > size * 0.3 && y < size * 0.7;
        const isCol2 = x > size * 0.55 && x < size * 0.75 && y > size * 0.3 && y < size * 0.7;

        if (isCol1 || isCol2) {
          rawData[offset++] = 255; // White card column
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
        } else {
          rawData[offset++] = rBg;
          rawData[offset++] = gBg;
          rawData[offset++] = bBg;
          rawData[offset++] = 255;
        }
      } else {
        // Transparent outside rounded corner
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace: None

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(rawData));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(process.cwd(), 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = generatePNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png (${buf.length} bytes)`);
}
