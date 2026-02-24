/**
 * wz-canvas-decode.js — Decode WZ canvas data to ImageBitmaps / data URLs.
 *
 * All heavy work runs in a Web Worker pool. Binary data is transferred
 * zero-copy to workers via ArrayBuffer transfer (no structured clone).
 *
 * Primary path: decodeRawWzCanvas / canvasToImageBitmap → ImageBitmap
 * Secondary path: canvasToDataUrl → string (for HTML <img> elements)
 *
 * Workers: client/web/wz-decode-worker.js
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode base64 string → Uint8Array (fast, one-shot). */
function b64toBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── Worker Pool ─────────────────────────────────────────────────────────────

const POOL_SIZE = Math.min(navigator.hardwareConcurrency || 4, 8);
let _pool = null;
let _nextId = 0;
let _nextWorker = 0;

function _getPool() {
  if (_pool) return _pool;
  _pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker("/wz-decode-worker.js");
    const pending = new Map();     // id → { resolve, reject }
    w.onmessage = (e) => {
      const { id, dataUrl, bitmap, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(bitmap ?? dataUrl);
    };
    w.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message));
      pending.clear();
    };
    _pool.push({ worker: w, pending });
  }
  return _pool;
}

/**
 * Dispatch raw WZ binary data to a worker.
 * ArrayBuffer is transferred zero-copy (not cloned).
 */
function _dispatchRawWz(bytes, width, height, wzrawformat, mode) {
  const pool = _getPool();
  const id = _nextId++;
  const slot = pool[_nextWorker++ % pool.length];
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage(
      { id, bytes, width, height, wzrawformat, kind: "rawWz", mode: mode || "bitmap" },
      [bytes.buffer]
    );
  });
}

/**
 * Dispatch PNG binary data to a worker.
 * ArrayBuffer is transferred zero-copy (not cloned).
 */
function _dispatchPng(bytes, mode) {
  const pool = _getPool();
  const id = _nextId++;
  const slot = pool[_nextWorker++ % pool.length];
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage(
      { id, bytes, kind: "png", mode: mode || "bitmap" },
      [bytes.buffer]
    );
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Decode a raw WZ canvas node to an ImageBitmap.
 * base64 → binary on main thread, then transferred zero-copy to worker.
 * Worker does inflate + pixel decode + ImageBitmap, transferred zero-copy back.
 *
 * @param {object} node - canvas node with { basedata, wzrawformat, width, height }
 * @returns {Promise<ImageBitmap|null>}
 */
export async function decodeRawWzCanvas(node) {
  if (!node?.basedata) return null;
  const width = parseInt(node.width, 10) || 0;
  const height = parseInt(node.height, 10) || 0;
  if (width === 0 || height === 0) return null;
  const wzrawformat = node.wzrawformat != null ? parseInt(node.wzrawformat, 10) : -1;
  try {
    const bytes = b64toBytes(node.basedata);
    return await _dispatchRawWz(bytes, width, height, wzrawformat, "bitmap");
  } catch (err) {
    console.warn(`[wz-canvas-decode] Raw WZ decode failed ${width}x${height} fmt=${node.wzrawformat}:`, err);
    return null;
  }
}

/**
 * Decode PNG base64 data to an ImageBitmap via worker pool.
 * base64 → binary on main thread, transferred zero-copy to worker.
 * Worker does native PNG decode via createImageBitmap.
 *
 * @param {string} basedata - base64-encoded PNG data
 * @returns {Promise<ImageBitmap|null>}
 */
export async function decodePngToImageBitmap(basedata) {
  if (!basedata) return null;
  try {
    const bytes = b64toBytes(basedata);
    return await _dispatchPng(bytes, "bitmap");
  } catch (err) {
    console.warn(`[wz-canvas-decode] PNG decode failed:`, err);
    return null;
  }
}

/**
 * Check whether a canvas node has raw WZ data (vs PNG).
 */
export function isRawWzCanvas(node) {
  if (!node || !node.basedata) return false;
  if (node.wzrawformat != null) return true;
  const b = node.basedata;
  if (b.length < 2) return false;
  const prefix = b[0] + b[1];
  return prefix === "eJ" || prefix === "eN" || prefix === "eA" || prefix === "eF";
}

/**
 * Get a URL string for any canvas node (for HTML <img> src).
 * For canvas rendering, prefer canvasToImageBitmap() instead.
 *
 * @param {object} node - canvas node with { basedata, wzrawformat?, width, height }
 * @returns {Promise<string|null>} URL string suitable for img.src
 */
export async function canvasToDataUrl(node) {
  if (!node || !node.basedata) return null;
  if (isRawWzCanvas(node)) {
    const width = parseInt(node.width, 10) || 0;
    const height = parseInt(node.height, 10) || 0;
    if (width === 0 || height === 0) return null;
    const wzrawformat = node.wzrawformat != null ? parseInt(node.wzrawformat, 10) : -1;
    try {
      const bytes = b64toBytes(node.basedata);
      return await _dispatchRawWz(bytes, width, height, wzrawformat, "dataUrl");
    } catch (err) {
      console.warn(`[wz-canvas-decode] Failed to decode to dataUrl:`, err);
      return null;
    }
  }
  return `data:image/png;base64,${node.basedata}`;
}

/**
 * Decode any canvas node to an ImageBitmap — handles both raw WZ and PNG base64.
 * ALL decode work runs in the worker pool (main thread only does base64 → binary).
 *
 * @param {object} node - canvas node with { basedata, wzrawformat?, width, height }
 * @returns {Promise<ImageBitmap|null>}
 */
export async function canvasToImageBitmap(node) {
  if (!node || !node.basedata) return null;
  if (isRawWzCanvas(node)) return decodeRawWzCanvas(node);
  return decodePngToImageBitmap(node.basedata);
}
