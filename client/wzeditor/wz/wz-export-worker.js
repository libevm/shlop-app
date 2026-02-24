/**
 * Web Worker for parallel WZ export.
 *
 * Handles the heavy CPU work of parsing image nodes from binary data,
 * extracting raw base64 for canvas/sound nodes, and serializing to XML.
 *
 * Messages:
 *   { cmd: 'init', buffer: ArrayBuffer|SharedArrayBuffer, mapleVersion: string }
 *   { cmd: 'processBatch', id, images: [{ offset, hash, headerFStart, name }] }
 */

import { WzNode } from './wz-node.js';
import { parseImageFromReader } from './wz-image.js';
import { WzBinaryReader } from './wz-binary-reader.js';
import { generateWzKey } from './wz-crypto.js';
import { getIvByMapleVersion } from './wz-constants.js';
import { serializeImage } from './wz-xml-serializer.js';

let wzBuffer = null;
let wzKey = null;

self.onmessage = function(e) {
    const { cmd, id } = e.data;

    switch (cmd) {
        case 'init': {
            wzBuffer = e.data.buffer;
            wzKey = generateWzKey(getIvByMapleVersion(e.data.mapleVersion));
            self.postMessage({ id, type: 'ready' });
            break;
        }

        case 'processBatch': {
            const { images } = e.data;
            const results = [];

            for (const img of images) {
                try {
                    const xml = processOneImage(img);
                    results.push({ name: img.name, xml, error: null });
                } catch (err) {
                    results.push({ name: img.name, xml: null, error: err.message });
                }
            }

            self.postMessage({ id, type: 'batchResult', results });
            break;
        }

        default:
            self.postMessage({ id, type: 'error', message: `Unknown command: ${cmd}` });
    }
};

/**
 * Parse a single image from binary, extract raw base64, serialize to XML.
 */
function processOneImage(img) {
    const reader = new WzBinaryReader(wzBuffer, wzKey);
    reader.hash = img.hash;
    reader.header = { fStart: img.headerFStart, fSize: 0, ident: 'PKG1', copyright: '' };
    reader.pos = img.offset;

    const children = parseImageFromReader(reader, img.offset);

    // Create temporary image node
    const imageNode = new WzNode(img.name, 'image');
    imageNode.parsed = true;
    for (const child of children) imageNode.addChild(child);

    // Extract raw base64 for canvas/sound nodes
    extractRawBase64(imageNode);

    // Serialize to XML
    return serializeImage(imageNode, { includeBase64: true });
}

/**
 * Walk the node tree and set base64 data from raw WZ bytes.
 * Canvas: base64 of raw compressed pixel data (no inflate/decode/PNG encode).
 * Sound: base64 of raw header + data bytes.
 */
function extractRawBase64(node) {
    const stack = [...node.children];
    while (stack.length) {
        const n = stack.pop();

        // Canvas: raw base64 of compressed WZ bytes (skip inflate + pixel decode + PNG encode)
        if (n.type === 'canvas' && !n.basedata && n._pngInfo) {
            try {
                const info = n._pngInfo;
                const bytes = new Uint8Array(wzBuffer, info.dataOffset, info.dataLength);
                n.basedata = uint8ToBase64(bytes);
                n.wzrawformat = info.format; // tag so consumers know this is raw WZ data, not PNG
            } catch (err) {
                // Ignore — canvas will be exported without basedata
            }
        }

        // Sound: raw base64 of header + data bytes
        if (n.type === 'sound' && !n.basedata && n._soundInfo) {
            try {
                const si = n._soundInfo;
                const headerBytes = new Uint8Array(wzBuffer, si.headerOffset, si.headerLength);
                n.basehead = uint8ToBase64(headerBytes);
                const dataBytes = new Uint8Array(wzBuffer, si.dataOffset, si.dataLength);
                n.basedata = uint8ToBase64(dataBytes);
            } catch (err) {
                // Ignore
            }
        }

        for (const child of n.children) stack.push(child);
    }
}

/** Convert Uint8Array to base64 string */
function uint8ToBase64(bytes) {
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 8192) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
    }
    return btoa(chunks.join(''));
}
