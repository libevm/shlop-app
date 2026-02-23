/**
 * WZ PNG pixel format decoder.
 * Converts raw WZ pixel data to RGBA8888 ImageData, then to PNG via OffscreenCanvas.
 *
 * Ported from MapleLib/WzLib/WzProperties/WzPngProperty.cs + PngUtility.cs
 *
 * Supported formats:
 *   1    = BGRA4444 (16bpp)
 *   2    = BGRA8888 (32bpp)
 *   3    = DXT3 grayscale (compressed)
 *   257  = ARGB1555 (16bpp)  [rare]
 *   513  = RGB565 (16bpp)
 *   517  = RGB565 16x16 block (special)
 *   1026 = DXT3 (compressed)
 *   2050 = DXT5 (compressed)
 */

/**
 * Decompress raw WZ pixel data → RGBA8888 Uint8ClampedArray
 *
 * @param {Uint8Array} raw - decompressed pixel data (after zlib inflate)
 * @param {number} width
 * @param {number} height
 * @param {number} format - WZ PNG format ID
 * @returns {Uint8ClampedArray} RGBA8888 pixel data
 */
export function decodePixels(raw, width, height, format) {
    switch (format) {
        case 1: return decodeBGRA4444(raw, width, height);
        case 2: return decodeBGRA8888(raw, width, height);
        case 3:
        case 1026: return decodeDXT3(raw, width, height);
        case 257: return decodeARGB1555(raw, width, height);
        case 513: return decodeRGB565(raw, width, height);
        case 517: return decodeRGB565_Block(raw, width, height);
        case 2050: return decodeDXT5(raw, width, height);
        default:
            console.warn(`Unknown PNG format ${format}, treating as BGRA8888`);
            return decodeBGRA8888(raw, width, height);
    }
}

/**
 * Get the expected decompressed buffer size for a format
 */
export function getDecompressedSize(width, height, format) {
    switch (format) {
        case 1: return width * height * 2;
        case 2: return width * height * 4;
        case 3: return width * height * 4;
        case 257: return width * height * 2;
        case 513: return width * height * 2;
        case 517: return Math.ceil(width * height / 128);
        case 1026: return width * height * 4;
        case 2050: return width * height;
        default: return width * height * 4;
    }
}

// ─── Format 1: BGRA4444 ─────────────────────────────────────────────────────

function decodeBGRA4444(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const size = width * height * 2;
    for (let i = 0; i < size; i += 2) {
        const lo = raw[i];
        const hi = raw[i + 1];
        const b = lo & 0x0F; const g = (lo >> 4) & 0x0F;
        const r = hi & 0x0F; const a = (hi >> 4) & 0x0F;
        const j = i * 2;
        out[j]     = r | (r << 4);
        out[j + 1] = g | (g << 4);
        out[j + 2] = b | (b << 4);
        out[j + 3] = a | (a << 4);
    }
    return out;
}

// ─── Format 2: BGRA8888 ─────────────────────────────────────────────────────

function decodeBGRA8888(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const j = i * 4;
        out[j]     = raw[j + 2]; // R (from B position in BGRA)
        out[j + 1] = raw[j + 1]; // G
        out[j + 2] = raw[j];     // B (from R position in BGRA)
        out[j + 3] = raw[j + 3]; // A
    }
    return out;
}

// ─── Format 257: ARGB1555 ────────────────────────────────────────────────────

function decodeARGB1555(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const v = raw[i * 2] | (raw[i * 2 + 1] << 8);
        const a = ((v >> 15) & 1) * 255;
        const r = ((v >> 10) & 0x1F) * 255 / 31;
        const g = ((v >> 5) & 0x1F) * 255 / 31;
        const b = (v & 0x1F) * 255 / 31;
        const j = i * 4;
        out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
    }
    return out;
}

// ─── Format 513: RGB565 ─────────────────────────────────────────────────────

function decodeRGB565(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const v = raw[i * 2] | (raw[i * 2 + 1] << 8);
        const r = ((v >> 11) & 0x1F) * 255 / 31;
        const g = ((v >> 5) & 0x3F) * 255 / 63;
        const b = (v & 0x1F) * 255 / 31;
        const j = i * 4;
        out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
    }
    return out;
}

// ─── Format 517: RGB565 16x16 block ──────────────────────────────────────────

function decodeRGB565_Block(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    let lineIndex = 0;
    for (let j0 = 0; j0 < height / 16; j0++) {
        let dstIndex = lineIndex;
        for (let i0 = 0; i0 < width / 16; i0++) {
            const idx = (j0 * (width / 16) + i0) * 2;
            const pixel = raw[idx] | (raw[idx + 1] << 8);
            const r = ((pixel >> 11) & 0x1F) * 255 / 31;
            const g = ((pixel >> 5) & 0x3F) * 255 / 63;
            const b = (pixel & 0x1F) * 255 / 31;
            for (let j1 = 0; j1 < 16; j1++) {
                for (let i1 = 0; i1 < 16; i1++) {
                    const px = i0 * 16 + i1;
                    const py = j0 * 16 + j1;
                    if (px < width && py < height) {
                        const k = (py * width + px) * 4;
                        out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255;
                    }
                }
            }
            dstIndex += 16 * 4;
        }
        lineIndex += width * 16 * 4;
    }
    return out;
}

// ─── Format 3/1026: DXT3 ─────────────────────────────────────────────────────

function decodeDXT3(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const blockCountX = (width + 3) >> 2;
    const blockCountY = (height + 3) >> 2;

    for (let by = 0; by < blockCountY; by++) {
        for (let bx = 0; bx < blockCountX; bx++) {
            const blockIdx = (by * blockCountX + bx) * 16;
            // 8 bytes alpha, 2 bytes color0, 2 bytes color1, 4 bytes indices
            const alphas = extractDXT3Alpha(raw, blockIdx);
            const c0 = raw[blockIdx + 8] | (raw[blockIdx + 9] << 8);
            const c1 = raw[blockIdx + 10] | (raw[blockIdx + 11] << 8);
            const colors = expandColorTable565(c0, c1);
            const indices = extractColorIndices(raw, blockIdx + 12);

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const px = bx * 4 + i;
                    const py = by * 4 + j;
                    if (px >= width || py >= height) continue;
                    const ci = indices[j * 4 + i];
                    const c = colors[ci];
                    const k = (py * width + px) * 4;
                    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
                    out[k + 3] = alphas[j * 4 + i];
                }
            }
        }
    }
    return out;
}

function extractDXT3Alpha(raw, off) {
    const a = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        const b = raw[off + i];
        a[i * 2]     = ((b & 0x0F) * 17) | 0; // expand 4-bit to 8-bit
        a[i * 2 + 1] = (((b >> 4) & 0x0F) * 17) | 0;
    }
    return a;
}

// ─── Format 2050: DXT5 ───────────────────────────────────────────────────────

function decodeDXT5(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const blockCountX = (width + 3) >> 2;
    const blockCountY = (height + 3) >> 2;

    for (let by = 0; by < blockCountY; by++) {
        for (let bx = 0; bx < blockCountX; bx++) {
            const blockIdx = (by * blockCountX + bx) * 16;
            const alphas = extractDXT5Alpha(raw, blockIdx);
            const c0 = raw[blockIdx + 8] | (raw[blockIdx + 9] << 8);
            const c1 = raw[blockIdx + 10] | (raw[blockIdx + 11] << 8);
            const colors = expandColorTable565(c0, c1);
            const indices = extractColorIndices(raw, blockIdx + 12);

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const px = bx * 4 + i;
                    const py = by * 4 + j;
                    if (px >= width || py >= height) continue;
                    const ci = indices[j * 4 + i];
                    const c = colors[ci];
                    const k = (py * width + px) * 4;
                    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
                    out[k + 3] = alphas[j * 4 + i];
                }
            }
        }
    }
    return out;
}

function extractDXT5Alpha(raw, off) {
    const a0 = raw[off];
    const a1 = raw[off + 1];
    const aTable = new Uint8Array(8);
    aTable[0] = a0;
    aTable[1] = a1;
    if (a0 > a1) {
        for (let i = 1; i <= 6; i++) aTable[i + 1] = ((7 - i) * a0 + i * a1 + 3) / 7 | 0;
    } else {
        for (let i = 1; i <= 4; i++) aTable[i + 1] = ((5 - i) * a0 + i * a1 + 2) / 5 | 0;
        aTable[6] = 0;
        aTable[7] = 255;
    }

    // 6 bytes of 3-bit indices = 16 values
    const alphaIndices = new Uint8Array(16);
    // Read 48 bits (6 bytes) starting at off+2
    let bits = 0n;
    for (let i = 0; i < 6; i++) {
        bits |= BigInt(raw[off + 2 + i]) << BigInt(i * 8);
    }
    for (let i = 0; i < 16; i++) {
        alphaIndices[i] = Number((bits >> BigInt(i * 3)) & 7n);
    }

    const result = new Uint8Array(16);
    for (let i = 0; i < 16; i++) result[i] = aTable[alphaIndices[i]];
    return result;
}

// ─── Shared DXT helpers ──────────────────────────────────────────────────────

function expandColorTable565(c0, c1) {
    const r0 = (c0 >> 11) & 0x1F, g0 = (c0 >> 5) & 0x3F, b0 = c0 & 0x1F;
    const r1 = (c1 >> 11) & 0x1F, g1 = (c1 >> 5) & 0x3F, b1 = c1 & 0x1F;
    const toRGB = (r, g, b) => [r * 255 / 31 | 0, g * 255 / 63 | 0, b * 255 / 31 | 0];
    const colors = [
        toRGB(r0, g0, b0),
        toRGB(r1, g1, b1),
    ];
    if (c0 > c1) {
        colors[2] = [(2 * colors[0][0] + colors[1][0] + 1) / 3 | 0,
                     (2 * colors[0][1] + colors[1][1] + 1) / 3 | 0,
                     (2 * colors[0][2] + colors[1][2] + 1) / 3 | 0];
        colors[3] = [(colors[0][0] + 2 * colors[1][0] + 1) / 3 | 0,
                     (colors[0][1] + 2 * colors[1][1] + 1) / 3 | 0,
                     (colors[0][2] + 2 * colors[1][2] + 1) / 3 | 0];
    } else {
        colors[2] = [(colors[0][0] + colors[1][0]) / 2 | 0,
                     (colors[0][1] + colors[1][1]) / 2 | 0,
                     (colors[0][2] + colors[1][2]) / 2 | 0];
        colors[3] = [0, 0, 0];
    }
    return colors;
}

function extractColorIndices(raw, off) {
    const indices = new Uint8Array(16);
    for (let i = 0; i < 4; i++) {
        const b = raw[off + i];
        indices[i * 4]     = b & 3;
        indices[i * 4 + 1] = (b >> 2) & 3;
        indices[i * 4 + 2] = (b >> 4) & 3;
        indices[i * 4 + 3] = (b >> 6) & 3;
    }
    return indices;
}

// ─── Pure-JS PNG Encoder (fast, no Canvas/Blob/FileReader) ───────────────────

// CRC-32 table (ISO 3309 / ITU-T V.42, same as PNG spec)
const _crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    _crcTable[n] = c;
}
function _crc32(buf, start, len) {
    let crc = 0xFFFFFFFF;
    for (let i = start, end = start + len; i < end; i++) crc = _crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Base64 lookup
const _b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode Uint8Array to base64 string (fast, no btoa) */
function _toBase64(bytes) {
    const len = bytes.length;
    const pad = (3 - (len % 3)) % 3;
    const parts = [];
    for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i], b1 = i + 1 < len ? bytes[i + 1] : 0, b2 = i + 2 < len ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        parts.push(_b64[(n >> 18) & 63], _b64[(n >> 12) & 63],
                   i + 1 < len ? _b64[(n >> 6) & 63] : '=',
                   i + 2 < len ? _b64[n & 63] : '=');
    }
    return parts.join('');
}

/** Write a 4-byte big-endian uint32 */
function _writeU32BE(buf, off, v) {
    buf[off] = (v >>> 24) & 0xFF; buf[off + 1] = (v >>> 16) & 0xFF;
    buf[off + 2] = (v >>> 8) & 0xFF; buf[off + 3] = v & 0xFF;
}

/**
 * Encode RGBA pixels to PNG and return base64 string directly.
 * Pure JS — no OffscreenCanvas, no Blob, no FileReader.
 * Uses synchronous zlib deflate via a shared compression stream trick,
 * or falls back to uncompressed deflate (stored blocks) for speed.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {string} base64 PNG
 */
export function rgbaToPngBase64Fast(rgba, width, height) {
    const rowBytes = width * 4;

    // Build raw scanlines: filter=0 prefix + RGBA row data
    const rawSize = (rowBytes + 1) * height;
    const raw = new Uint8Array(rawSize);
    for (let y = 0; y < height; y++) {
        const off = y * (rowBytes + 1);
        raw[off] = 0; // filter byte: None
        raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), off + 1);
    }

    // Compress with deflate (stored blocks — fastest, ~0% compression but instant)
    // For WZ sprites this is fine — they're small, and speed matters more than size.
    const deflated = _deflateStored(raw);

    // Build PNG
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // 8 bytes
    const ihdr = _pngChunk(0x49484452, _buildIHDR(width, height)); // 25 bytes
    const idat = _pngChunk(0x49444154, deflated);
    const iend = _pngChunk(0x49454E44, new Uint8Array(0)); // 12 bytes

    const png = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
    let pos = 0;
    png.set(sig, pos); pos += sig.length;
    png.set(ihdr, pos); pos += ihdr.length;
    png.set(idat, pos); pos += idat.length;
    png.set(iend, pos);

    return _toBase64(png);
}

function _buildIHDR(width, height) {
    const buf = new Uint8Array(13);
    _writeU32BE(buf, 0, width);
    _writeU32BE(buf, 4, height);
    buf[8] = 8; buf[9] = 6; // 8-bit RGBA
    return buf;
}

function _pngChunk(type, data) {
    const chunk = new Uint8Array(12 + data.length);
    _writeU32BE(chunk, 0, data.length);
    _writeU32BE(chunk, 4, type);
    chunk.set(data, 8);
    const crc = _crc32(chunk, 4, 4 + data.length); // CRC covers type + data
    _writeU32BE(chunk, 8 + data.length, crc);
    return chunk;
}

/**
 * Deflate using stored blocks (no compression) wrapped in zlib container.
 * Max block size is 65535 bytes, so we split into blocks.
 */
function _deflateStored(raw) {
    const MAX_BLOCK = 65535;
    const nBlocks = Math.ceil(raw.length / MAX_BLOCK) || 1;
    // zlib header (2 bytes) + blocks * (5 header + data) + adler32 (4 bytes)
    const outSize = 2 + nBlocks * 5 + raw.length + 4;
    const out = new Uint8Array(outSize);
    let pos = 0;

    // zlib header: CMF=0x78, FLG=0x01 (deflate, window=32K, check bits)
    out[pos++] = 0x78; out[pos++] = 0x01;

    let remaining = raw.length;
    let srcPos = 0;
    while (remaining > 0) {
        const blockLen = Math.min(remaining, MAX_BLOCK);
        const isFinal = remaining <= MAX_BLOCK ? 1 : 0;
        out[pos++] = isFinal; // BFINAL + BTYPE=00 (stored)
        out[pos++] = blockLen & 0xFF; out[pos++] = (blockLen >> 8) & 0xFF;
        out[pos++] = (~blockLen) & 0xFF; out[pos++] = ((~blockLen) >> 8) & 0xFF;
        out.set(raw.subarray(srcPos, srcPos + blockLen), pos);
        pos += blockLen;
        srcPos += blockLen;
        remaining -= blockLen;
    }

    // Adler-32
    let a = 1, b = 0;
    for (let i = 0; i < raw.length; i++) {
        a = (a + raw[i]) % 65521;
        b = (b + a) % 65521;
    }
    _writeU32BE(out, pos, ((b << 16) | a) >>> 0);

    return out;
}

// ─── Convert RGBA pixels to PNG data URL ─────────────────────────────────────

/**
 * Convert RGBA8888 pixel data to a PNG data URL using OffscreenCanvas.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function rgbaToPngDataUrl(rgba, width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(rgba, width, height);
        ctx.putImageData(imgData, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } else {
        // Fallback: regular canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(rgba, width, height);
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
    }
}

/**
 * Convert RGBA to base64 PNG string (without data URL prefix)
 */
export async function rgbaToPngBase64(rgba, width, height) {
    const dataUrl = await rgbaToPngDataUrl(rgba, width, height);
    return dataUrl.split(',')[1];
}

// ─── Inflate helper ──────────────────────────────────────────────────────────

/**
 * Inflate (decompress) zlib/deflate data.
 * WZ compressed data is often truncated (no proper zlib checksum/terminator),
 * so we read until we get expectedSize bytes or the stream errors out.
 *
 * @param {Uint8Array} compressed - raw deflate data (no zlib header — caller strips it)
 * @param {number} expectedSize - expected decompressed size
 * @returns {Promise<Uint8Array>}
 */
export async function inflate(compressed, expectedSize) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream not available in this browser');
    }

    // Use deflate-raw since the caller already stripped the 2-byte zlib header
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();

    // Write data and close — don't await close() because truncated streams may error
    writer.write(compressed).catch(() => {});
    writer.close().catch(() => {});

    const reader = ds.readable.getReader();
    const result = new Uint8Array(expectedSize);
    let totalRead = 0;

    try {
        while (totalRead < expectedSize) {
            const { done, value } = await reader.read();
            if (done) break;
            const remaining = expectedSize - totalRead;
            const toCopy = Math.min(value.length, remaining);
            result.set(value.subarray(0, toCopy), totalRead);
            totalRead += toCopy;
        }
    } catch {
        // WZ data is often truncated — the decompressor may error after
        // producing all the bytes we need. That's OK.
    }

    // Cancel the reader to clean up
    try { reader.cancel().catch(() => {}); } catch {}

    if (totalRead < expectedSize) {
        // Return what we got — partial decode is better than nothing
        console.warn(`inflate: got ${totalRead}/${expectedSize} bytes`);
    }
    return result;
}
