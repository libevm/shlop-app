/**
 * wz-canvas-decode.js — Decode raw WZ canvas data to PNG data URLs.
 *
 * All heavy work (inflate, pixel decode, PNG encode, listWz decrypt) runs in a
 * Web Worker pool to keep the main thread free during map loads (hundreds of
 * images decoded per map change).
 *
 * Workers: client/web/wz-decode-worker.js
 */

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
      const { id, dataUrl, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(dataUrl);
    };
    w.onerror = (e) => {
      // Reject all pending for this worker
      for (const [, p] of pending) p.reject(new Error(e.message));
      pending.clear();
    };
    _pool.push({ worker: w, pending });
  }
  return _pool;
}

function _dispatch(basedata, width, height, wzrawformat) {
  const pool = _getPool();
  const id = _nextId++;
  const slot = pool[_nextWorker % pool.length];
  _nextWorker++;
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage({ id, basedata, width, height, wzrawformat });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Decode a raw WZ canvas node to a PNG data URL.
 * Runs entirely off the main thread via Web Workers.
 *
 * @param {object} node - canvas node with { basedata, wzrawformat, width, height }
 * @returns {Promise<string|null>} data:image/png;base64,... or null on failure
 */
export async function decodeRawWzCanvas(node) {
  if (!node.basedata) return null;
  const width = parseInt(node.width, 10) || 0;
  const height = parseInt(node.height, 10) || 0;
  if (width === 0 || height === 0) return null;

  try {
    return await _dispatch(
      node.basedata,
      width,
      height,
      node.wzrawformat != null ? parseInt(node.wzrawformat, 10) : -1
    );
  } catch (err) {
    console.warn(`[wz-canvas-decode] Failed to decode ${width}x${height} fmt=${node.wzrawformat}:`, err);
    return null;
  }
}

/**
 * Check whether a canvas node has raw WZ data (vs PNG).
 * Detects both:
 *   1. Explicitly tagged with wzrawformat attribute
 *   2. Untagged but basedata starts with a zlib header (0x78 = CMF byte)
 *      Base64 2-char prefixes: eJ (78 9c), eN (78 da), eA (78 01), eF (78 5e)
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
 * Get a PNG data URL for any canvas node — handles both raw WZ and PNG base64.
 * For PNG base64 nodes, returns synchronously wrapped in a resolved promise.
 * For raw WZ nodes, decodes asynchronously via worker pool.
 *
 * @param {object} node - canvas node with { basedata, wzrawformat?, width, height }
 * @returns {Promise<string|null>} data:image/png;base64,...
 */
export async function canvasToDataUrl(node) {
  if (!node || !node.basedata) return null;
  if (isRawWzCanvas(node)) return decodeRawWzCanvas(node);
  return `data:image/png;base64,${node.basedata}`;
}
