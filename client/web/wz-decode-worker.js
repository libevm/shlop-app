/**
 * wz-decode-worker.js — Web Worker for off-main-thread WZ canvas decoding.
 *
 * Receives: { id, basedata, width, height, wzrawformat }
 * Responds: { id, dataUrl } or { id, error }
 *
 * Pipeline: base64 → [listWz decrypt] → inflate → pixel decode → RGBA → PNG blob → data URL
 */

self.onmessage = async function (e) {
  const { id, basedata, width, height, wzrawformat } = e.data;
  try {
    const dataUrl = await decode(basedata, width, height, wzrawformat);
    self.postMessage({ id, dataUrl });
  } catch (err) {
    self.postMessage({ id, error: err?.message ?? String(err) });
  }
};

async function decode(basedata, width, height, wzrawformat) {
  let format = wzrawformat != null ? parseInt(wzrawformat, 10) : -1;
  let compressed = base64ToBytes(basedata);

  // Detect standard zlib vs listWz encrypted
  const isStdZlib = compressed.length >= 2 && compressed[0] === 0x78 &&
    (compressed[1] === 0x9C || compressed[1] === 0xDA || compressed[1] === 0x01 || compressed[1] === 0x5E);

  if (!isStdZlib) {
    const decrypted = decryptListWzBlocks(compressed);
    if (decrypted.length >= 2 && decrypted[0] === 0x78) {
      compressed = decrypted;
    }
    // else: try raw inflate on original data as fallback
  }

  // Infer format if unknown
  if (format < 0) {
    const size4444 = width * height * 2;
    const { data: raw4444, bytesRead: read4444 } = inflateTracked(compressed, size4444);
    if (read4444 >= size4444) {
      const rgba = decodePixels(raw4444, width, height, 1);
      return await rgbaToPngDataUrl(rgba, width, height);
    }
    const size8888 = width * height * 4;
    const { data: raw8888 } = inflateTracked(compressed, size8888);
    const rgba = decodePixels(raw8888, width, height, 2);
    return await rgbaToPngDataUrl(rgba, width, height);
  }

  const expectedSize = getDecompressedSize(width, height, format);
  const rawPixels = inflate(compressed, expectedSize);
  const rgba = decodePixels(rawPixels, width, height, format);
  return await rgbaToPngDataUrl(rgba, width, height);
}

// ─── Base64 ──────────────────────────────────────────────────────────────────

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── Inflate (Pure JS — RFC 1951) ────────────────────────────────────────────

const _LEN_BASE  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const _LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const _DST_BASE  = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const _DST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const _CL_ORDER  = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function _buildTree(lengths) {
  const maxLen = lengths.reduce((m, l) => l > m ? l : m, 0);
  if (maxLen === 0) return 0;
  const count = new Uint16Array(maxLen + 1);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) count[lengths[i]]++;
  const nextCode = new Uint16Array(maxLen + 1);
  for (let i = 1; i <= maxLen; i++) nextCode[i] = (nextCode[i - 1] + count[i - 1]) << 1;
  const root = [null, null];
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (!len) continue;
    const code = nextCode[len]++;
    let node = root;
    for (let i = len - 1; i > 0; i--) {
      const bit = (code >> i) & 1;
      if (node[bit] === null) node[bit] = [null, null];
      node = node[bit];
    }
    node[code & 1] = sym;
  }
  return root;
}

function _readSym(src, bp, tree) {
  let node = tree;
  while (Array.isArray(node)) {
    node = node[(src[bp[0] >> 3] >> (bp[0] & 7)) & 1];
    bp[0]++;
  }
  return node;
}

function _bits(src, bp, n) {
  let val = 0;
  for (let i = 0; i < n; i++) {
    val |= ((src[bp[0] >> 3] >> (bp[0] & 7)) & 1) << i;
    bp[0]++;
  }
  return val;
}

let _fixedLit = null, _fixedDist = null;
function _getFixedTrees() {
  if (!_fixedLit) {
    const ll = new Uint8Array(288);
    for (let i = 0; i <= 143; i++) ll[i] = 8;
    for (let i = 144; i <= 255; i++) ll[i] = 9;
    for (let i = 256; i <= 279; i++) ll[i] = 7;
    for (let i = 280; i <= 287; i++) ll[i] = 8;
    _fixedLit = _buildTree(ll);
    const dl = new Uint8Array(30); dl.fill(5);
    _fixedDist = _buildTree(dl);
  }
  return { lit: _fixedLit, dist: _fixedDist };
}

function inflateRaw(src, expectedSize) {
  const dst = new Uint8Array(expectedSize);
  const bp = [0];
  let dp = 0, bfinal = 0;
  while (!bfinal && dp < expectedSize) {
    bfinal = _bits(src, bp, 1);
    const btype = _bits(src, bp, 2);
    if (btype === 0) {
      bp[0] = ((bp[0] + 7) >> 3) << 3;
      const len = _bits(src, bp, 16);
      bp[0] += 16;
      for (let i = 0; i < len && dp < expectedSize; i++) {
        dst[dp++] = src[bp[0] >> 3]; bp[0] += 8;
      }
    } else if (btype === 1 || btype === 2) {
      let litTree, distTree;
      if (btype === 1) {
        const f = _getFixedTrees(); litTree = f.lit; distTree = f.dist;
      } else {
        const hlit = _bits(src, bp, 5) + 257;
        const hdist = _bits(src, bp, 5) + 1;
        const hclen = _bits(src, bp, 4) + 4;
        const clLen = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLen[_CL_ORDER[i]] = _bits(src, bp, 3);
        const clTree = _buildTree(clLen);
        const total = hlit + hdist;
        const codeLens = new Uint8Array(total);
        let ci = 0;
        while (ci < total) {
          const sym = _readSym(src, bp, clTree);
          if (sym < 16) { codeLens[ci++] = sym; }
          else if (sym === 16) { const r = _bits(src, bp, 2) + 3, v = codeLens[ci-1]; for (let j = 0; j < r; j++) codeLens[ci++] = v; }
          else if (sym === 17) { ci += _bits(src, bp, 3) + 3; }
          else { ci += _bits(src, bp, 7) + 11; }
        }
        litTree = _buildTree(codeLens.subarray(0, hlit));
        distTree = _buildTree(codeLens.subarray(hlit));
      }
      while (dp < expectedSize) {
        const sym = _readSym(src, bp, litTree);
        if (sym < 256) { dst[dp++] = sym; }
        else if (sym === 256) { break; }
        else {
          const li = sym - 257;
          const length = _LEN_BASE[li] + (li < 29 ? _bits(src, bp, _LEN_EXTRA[li]) : 0);
          const di = _readSym(src, bp, distTree);
          const distance = _DST_BASE[di] + _bits(src, bp, _DST_EXTRA[di]);
          for (let i = 0; i < length && dp < expectedSize; i++) { dst[dp] = dst[dp - distance]; dp++; }
        }
      }
    } else { break; }
  }
  return dst;
}

function inflate(zlibData, expectedSize) {
  return inflateRaw(zlibData.subarray(2), expectedSize);
}

function inflateTracked(zlibData, expectedSize) {
  const data = inflate(zlibData, expectedSize);
  let bytesRead = expectedSize;
  while (bytesRead > 0 && data[bytesRead - 1] === 0) bytesRead--;
  if (bytesRead > expectedSize * 0.9) bytesRead = expectedSize;
  return { data, bytesRead };
}

// ─── Pixel Decode ────────────────────────────────────────────────────────────

function getDecompressedSize(w, h, fmt) {
  switch (fmt) {
    case 1: return w * h * 2;
    case 2: return w * h * 4;
    case 3: return w * h * 4;
    case 257: return w * h * 2;
    case 513: return w * h * 2;
    case 517: return Math.ceil(w * h / 128);
    case 1026: return w * h * 4;
    case 2050: return w * h;
    default: return w * h * 4;
  }
}

function decodePixels(raw, w, h, fmt) {
  switch (fmt) {
    case 1: return decodeBGRA4444(raw, w, h);
    case 2: return decodeBGRA8888(raw, w, h);
    case 3: case 1026: return decodeDXT3(raw, w, h);
    case 257: return decodeARGB1555(raw, w, h);
    case 513: return decodeRGB565(raw, w, h);
    case 517: return decodeRGB565_Block(raw, w, h);
    case 2050: return decodeDXT5(raw, w, h);
    default: return decodeBGRA8888(raw, w, h);
  }
}

function decodeBGRA4444(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h * 2; i += 2) {
    const lo = raw[i], hi = raw[i + 1], j = i * 2;
    out[j]     = (hi & 0x0F) | ((hi & 0x0F) << 4);
    out[j + 1] = ((lo >> 4) & 0x0F) | (((lo >> 4) & 0x0F) << 4);
    out[j + 2] = (lo & 0x0F) | ((lo & 0x0F) << 4);
    out[j + 3] = ((hi >> 4) & 0x0F) | (((hi >> 4) & 0x0F) << 4);
  }
  return out;
}

function decodeBGRA8888(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    out[j] = raw[j + 2]; out[j + 1] = raw[j + 1]; out[j + 2] = raw[j]; out[j + 3] = raw[j + 3];
  }
  return out;
}

function decodeARGB1555(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = raw[i * 2] | (raw[i * 2 + 1] << 8), j = i * 4;
    out[j]     = ((v >> 10) & 0x1F) * 255 / 31;
    out[j + 1] = ((v >> 5) & 0x1F) * 255 / 31;
    out[j + 2] = (v & 0x1F) * 255 / 31;
    out[j + 3] = ((v >> 15) & 1) * 255;
  }
  return out;
}

function decodeRGB565(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = raw[i * 2] | (raw[i * 2 + 1] << 8), j = i * 4;
    out[j]     = ((v >> 11) & 0x1F) * 255 / 31;
    out[j + 1] = ((v >> 5) & 0x3F) * 255 / 63;
    out[j + 2] = (v & 0x1F) * 255 / 31;
    out[j + 3] = 255;
  }
  return out;
}

function decodeRGB565_Block(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j0 = 0; j0 < h / 16; j0++) {
    for (let i0 = 0; i0 < w / 16; i0++) {
      const idx = (j0 * (w / 16) + i0) * 2;
      const px = raw[idx] | (raw[idx + 1] << 8);
      const r = ((px >> 11) & 0x1F) * 255 / 31, g = ((px >> 5) & 0x3F) * 255 / 63, b = (px & 0x1F) * 255 / 31;
      for (let j1 = 0; j1 < 16; j1++) for (let i1 = 0; i1 < 16; i1++) {
        const x = i0 * 16 + i1, y = j0 * 16 + j1;
        if (x < w && y < h) { const k = (y * w + x) * 4; out[k] = r; out[k+1] = g; out[k+2] = b; out[k+3] = 255; }
      }
    }
  }
  return out;
}

function decodeDXT3(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const bx = (w + 3) >> 2, by = (h + 3) >> 2;
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) {
    const bi = (y * bx + x) * 16;
    const alphas = dxt3Alpha(raw, bi);
    const c0 = raw[bi+8]|(raw[bi+9]<<8), c1 = raw[bi+10]|(raw[bi+11]<<8);
    const colors = colorTable565(c0, c1), indices = colorIndices(raw, bi + 12);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const px = x*4+i, py = y*4+j;
      if (px >= w || py >= h) continue;
      const c = colors[indices[j*4+i]], k = (py*w+px)*4;
      out[k]=c[0]; out[k+1]=c[1]; out[k+2]=c[2]; out[k+3]=alphas[j*4+i];
    }
  }
  return out;
}

function dxt3Alpha(raw, off) {
  const a = new Uint8Array(16);
  for (let i = 0; i < 8; i++) { const b = raw[off+i]; a[i*2]=(b&0x0F)*17; a[i*2+1]=((b>>4)&0x0F)*17; }
  return a;
}

function decodeDXT5(raw, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const bx = (w + 3) >> 2, by = (h + 3) >> 2;
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) {
    const bi = (y * bx + x) * 16;
    const alphas = dxt5Alpha(raw, bi);
    const c0 = raw[bi+8]|(raw[bi+9]<<8), c1 = raw[bi+10]|(raw[bi+11]<<8);
    const colors = colorTable565(c0, c1), indices = colorIndices(raw, bi + 12);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const px = x*4+i, py = y*4+j;
      if (px >= w || py >= h) continue;
      const c = colors[indices[j*4+i]], k = (py*w+px)*4;
      out[k]=c[0]; out[k+1]=c[1]; out[k+2]=c[2]; out[k+3]=alphas[j*4+i];
    }
  }
  return out;
}

function dxt5Alpha(raw, off) {
  const a0 = raw[off], a1 = raw[off+1];
  const t = new Uint8Array(8); t[0]=a0; t[1]=a1;
  if (a0 > a1) { for (let i=1;i<=6;i++) t[i+1]=((7-i)*a0+i*a1+3)/7|0; }
  else { for (let i=1;i<=4;i++) t[i+1]=((5-i)*a0+i*a1+2)/5|0; t[6]=0; t[7]=255; }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(raw[off+2+i]) << BigInt(i*8);
  const result = new Uint8Array(16);
  for (let i = 0; i < 16; i++) result[i] = t[Number((bits >> BigInt(i*3)) & 7n)];
  return result;
}

function colorTable565(c0, c1) {
  const r0=(c0>>11)&0x1F, g0=(c0>>5)&0x3F, b0=c0&0x1F;
  const r1=(c1>>11)&0x1F, g1=(c1>>5)&0x3F, b1=c1&0x1F;
  const toRGB=(r,g,b)=>[r*255/31|0, g*255/63|0, b*255/31|0];
  const colors = [toRGB(r0,g0,b0), toRGB(r1,g1,b1)];
  if (c0 > c1) {
    colors[2]=[(2*colors[0][0]+colors[1][0]+1)/3|0,(2*colors[0][1]+colors[1][1]+1)/3|0,(2*colors[0][2]+colors[1][2]+1)/3|0];
    colors[3]=[(colors[0][0]+2*colors[1][0]+1)/3|0,(colors[0][1]+2*colors[1][1]+1)/3|0,(colors[0][2]+2*colors[1][2]+1)/3|0];
  } else {
    colors[2]=[(colors[0][0]+colors[1][0])/2|0,(colors[0][1]+colors[1][1])/2|0,(colors[0][2]+colors[1][2])/2|0];
    colors[3]=[0,0,0];
  }
  return colors;
}

function colorIndices(raw, off) {
  const idx = new Uint8Array(16);
  for (let i = 0; i < 4; i++) { const b=raw[off+i]; idx[i*4]=b&3; idx[i*4+1]=(b>>2)&3; idx[i*4+2]=(b>>4)&3; idx[i*4+3]=(b>>6)&3; }
  return idx;
}

// ─── RGBA → PNG data URL (via OffscreenCanvas) ──────────────────────────────

async function rgbaToPngDataUrl(rgba, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  // FileReaderSync is available in workers
  const reader = new FileReaderSync();
  return reader.readAsDataURL(blob);
}

// ─── ListWz Block Decryption ─────────────────────────────────────────────────

let _wzKey = null;
function getWzKey() {
  if (_wzKey) return _wzKey;
  _wzKey = generateWzKeyBytes(new Uint8Array([0x4D, 0x23, 0xC7, 0x2B]), 65536);
  return _wzKey;
}

function decryptListWzBlocks(data) {
  const key = getWzKey();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const output = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const blockSize = view.getInt32(pos, true); pos += 4;
    if (blockSize <= 0 || pos + blockSize > data.length) break;
    for (let i = 0; i < blockSize; i++) output.push(data[pos + i] ^ key[i % key.length]);
    pos += blockSize;
  }
  return new Uint8Array(output);
}

// ─── WZ Key Generation (AES-256-ECB) ────────────────────────────────────────

const _SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);
const _RCON = new Uint8Array([0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36]);
const _USERKEY = new Uint8Array([
  0x13,0x00,0x00,0x00,0x08,0x00,0x00,0x00,0x06,0x00,0x00,0x00,0xB4,0x00,0x00,0x00,
  0x1B,0x00,0x00,0x00,0x0F,0x00,0x00,0x00,0x33,0x00,0x00,0x00,0x52,0x00,0x00,0x00,
]);

function _gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) { if (b&1) p^=a; const hi=a&0x80; a=(a<<1)&0xFF; if(hi) a^=0x1B; b>>=1; }
  return p;
}

function _expandKey256(key) {
  const W = new Uint32Array(60);
  for (let i = 0; i < 8; i++) W[i]=(key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3];
  for (let i = 8; i < 60; i++) {
    let t = W[i-1];
    if (i%8===0) t=((_SBOX[(t>>16)&0xFF]<<24)|(_SBOX[(t>>8)&0xFF]<<16)|(_SBOX[t&0xFF]<<8)|_SBOX[(t>>24)&0xFF])^(_RCON[(i/8|0)-1]<<24);
    else if (i%8===4) t=(_SBOX[(t>>24)&0xFF]<<24)|(_SBOX[(t>>16)&0xFF]<<16)|(_SBOX[(t>>8)&0xFF]<<8)|_SBOX[t&0xFF];
    W[i]=W[i-8]^t;
  }
  return W;
}

function _aesEncryptBlock(block, W) {
  for (let c=0;c<4;c++){const w=W[c];block[4*c]^=(w>>>24)&0xFF;block[4*c+1]^=(w>>>16)&0xFF;block[4*c+2]^=(w>>>8)&0xFF;block[4*c+3]^=w&0xFF;}
  for (let round=1;round<=14;round++){
    for(let i=0;i<16;i++)block[i]=_SBOX[block[i]];
    let t=block[1];block[1]=block[5];block[5]=block[9];block[9]=block[13];block[13]=t;
    t=block[2];block[2]=block[10];block[10]=t;t=block[6];block[6]=block[14];block[14]=t;
    t=block[15];block[15]=block[11];block[11]=block[7];block[7]=block[3];block[3]=t;
    if(round<14){for(let c=0;c<4;c++){const s0=block[4*c],s1=block[4*c+1],s2=block[4*c+2],s3=block[4*c+3];
      block[4*c]=_gmul(s0,2)^_gmul(s1,3)^s2^s3;block[4*c+1]=s0^_gmul(s1,2)^_gmul(s2,3)^s3;
      block[4*c+2]=s0^s1^_gmul(s2,2)^_gmul(s3,3);block[4*c+3]=_gmul(s0,3)^s1^s2^_gmul(s3,2);}}
    for(let c=0;c<4;c++){const w=W[round*4+c];block[4*c]^=(w>>>24)&0xFF;block[4*c+1]^=(w>>>16)&0xFF;block[4*c+2]^=(w>>>8)&0xFF;block[4*c+3]^=w&0xFF;}
  }
}

function generateWzKeyBytes(iv, size) {
  const expanded = _expandKey256(_USERKEY);
  const keys = new Uint8Array(size);
  for (let i = 0; i < size; i += 16) {
    const block = new Uint8Array(16);
    if (i === 0) { for (let j = 0; j < 16; j++) block[j] = iv[j % 4]; }
    else { block.set(keys.subarray(i - 16, i)); }
    _aesEncryptBlock(block, expanded);
    keys.set(block, i);
  }
  return keys;
}
