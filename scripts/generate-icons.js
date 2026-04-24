/**
 * Generates logo192.png and logo512.png for the Lekours PWA
 * Pure Node.js — no external dependencies.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG encoder ────────────────────────────────────────────────────────────
function makePNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw.set(pixels.slice(src, src + 4), dst);
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  }

  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── Pixel drawing helpers ──────────────────────────────────────────────────
function makeCanvas(S) {
  const buf = Buffer.alloc(S * S * 4);

  function set(x, y, r, g, b, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const i = (y * S + x) * 4;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
  }

  function ellipse(cx, cy, rx, ry, r, g, b, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1) set(x, y, r, g, b, a);
  }

  function rect(x, y, w, h, r, g, b) {
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++)
      for (let px = Math.floor(x); px < Math.ceil(x + w); px++)
        set(px, py, r, g, b);
  }

  function polygon(pts, r, g, b) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
    for (let y = minY; y <= maxY; y++) {
      const inter = [];
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        const [x1, y1] = pts[i], [x2, y2] = pts[j];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
          inter.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
      inter.sort((a, b) => a - b);
      for (let k = 0; k < inter.length - 1; k += 2)
        for (let x = Math.floor(inter[k]); x < Math.ceil(inter[k+1]); x++)
          set(x, y, r, g, b);
    }
  }

  // Smooth rounded rectangle (filled ellipse corners)
  function roundedRect(x, y, w, h, radius, r, g, b) {
    rect(x + radius, y, w - 2*radius, h, r, g, b);
    rect(x, y + radius, w, h - 2*radius, r, g, b);
    ellipse(x + radius, y + radius, radius, radius, r, g, b);
    ellipse(x + w - radius, y + radius, radius, radius, r, g, b);
    ellipse(x + radius, y + h - radius, radius, radius, r, g, b);
    ellipse(x + w - radius, y + h - radius, radius, radius, r, g, b);
  }

  return { buf, set, ellipse, rect, polygon, roundedRect };
}

// ── Horse icon generator ───────────────────────────────────────────────────
function createIcon(S) {
  const c = makeCanvas(S);
  const k = S / 100; // scale factor: 1 unit = k pixels

  const sc = (v) => v * k;
  const E = (cx, cy, rx, ry, r, g, b, a) => c.ellipse(sc(cx), sc(cy), sc(rx), sc(ry), r, g, b, a);
  const R = (x, y, w, h, r, g, b) => c.rect(sc(x), sc(y), sc(w), sc(h), r, g, b);
  const P = (pts, r, g, b) => c.polygon(pts.map(([x, y]) => [sc(x), sc(y)]), r, g, b);
  const RR = (x, y, w, h, rad, r, g, b) => c.roundedRect(sc(x), sc(y), sc(w), sc(h), sc(rad), r, g, b);

  // ── Background: deep indigo with rounded corners ──
  // Fill solid indigo first
  for (let i = 0; i < S * S; i++) {
    c.buf[i*4]   = 67;
    c.buf[i*4+1] = 56;
    c.buf[i*4+2] = 202;
    c.buf[i*4+3] = 255;
  }
  // Rounded card in slightly lighter indigo
  RR(4, 4, 92, 92, 12, 79, 70, 229);

  // ── Horse (white silhouette, facing right) ──
  const [W, HG, HB] = [255, 255, 255]; // white
  const [SW, SHG, SHB] = [220, 215, 245]; // soft off-white for depth

  // Hindquarters rump
  E(32, 57, 14, 13, W, HG, HB);

  // Body
  E(48, 59, 22, 13, W, HG, HB);

  // Chest / shoulder
  E(63, 57, 11, 11, W, HG, HB);

  // Neck (polygon)
  P([[60,52],[67,32],[74,36],[68,54]], W, HG, HB);

  // Head
  E(74, 30, 12, 9, W, HG, HB);

  // Muzzle / nose
  E(84, 34, 7, 5, W, HG, HB);

  // Nostril (small dark dot)
  E(88, 36, 1.5, 1.5, 100, 90, 180);

  // Ear
  P([[70,22],[73,14],[78,22]], W, HG, HB);

  // Eye (dark)
  E(80, 26, 2.2, 2, 50, 40, 120);
  E(79.5, 25.5, 0.8, 0.8, W, HG, HB); // highlight

  // Mane (flowing slightly darker off-white strips along neck top)
  E(68, 38, 4.5, 5, SW, SHG, SHB);
  E(64, 44, 3.5, 5, SW, SHG, SHB);
  E(61, 49, 3, 4, SW, SHG, SHB);

  // Front legs (two, offset for depth)
  R(66, 69, 5, 21, SW, SHG, SHB); // back front leg
  R(60, 68, 5.5, 22, W, HG, HB);  // front front leg

  // Back legs (two, offset)
  R(42, 69, 5, 21, SW, SHG, SHB); // back hind leg
  R(35, 68, 5.5, 22, W, HG, HB);  // front hind leg

  // Hooves (dark)
  R(60, 88, 5.5, 4, 60, 50, 150);
  R(66, 89, 5, 3.5, 60, 50, 150);
  R(35, 88, 5.5, 4, 60, 50, 150);
  R(42, 89, 5, 3.5, 60, 50, 150);

  // Tail (flowing upward to the left)
  P([[27,53],[22,48],[17,42],[13,38],[11,35],[14,33],[20,37],[25,43],[29,50]], W, HG, HB);
  E(13, 33, 4, 5, W, HG, HB);
  E(12, 29, 3, 4, W, HG, HB);
  E(14, 25, 2.5, 3.5, W, HG, HB);

  return c.buf;
}

// ── Generate and save ──────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', 'horse-betting-frontend', 'public');

for (const size of [192, 512]) {
  const pixels = createIcon(size);
  const png = makePNG(size, size, pixels);
  const outPath = path.join(publicDir, `logo${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ Generated ${outPath} (${size}×${size})`);
}

console.log('Done! Icons written to horse-betting-frontend/public/');
