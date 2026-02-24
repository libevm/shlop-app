#!/usr/bin/env bun
/**
 * wz2xml — CLI tool to export .wz files to Classic XML directories.
 *
 * Usage:
 *   bun run wz2xml <source> <dest>
 *
 * <source>  Path to a .wz file or a directory of .wz files
 * <dest>    Output directory (created if it doesn't exist)
 *
 * Canvas basedata is raw WZ compressed bytes (base64), tagged with wzrawformat.
 * Sound basedata/basehead are raw bytes (base64). No PNG conversion.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, resolve, extname } from "node:path";

// WZ engine — pure JS, no DOM deps, works in Bun
import { parseWzFile } from "../client/wzeditor/wz/wz-file.js";
import { parseImageFromReader } from "../client/wzeditor/wz/wz-image.js";
import { WzBinaryReader } from "../client/wzeditor/wz/wz-binary-reader.js";
import { generateWzKey } from "../client/wzeditor/wz/wz-crypto.js";
import { getIvByMapleVersion } from "../client/wzeditor/wz/wz-constants.js";
import { WzNode } from "../client/wzeditor/wz/wz-node.js";
import { serializeImage, escapeFileName } from "../client/wzeditor/wz/wz-xml-serializer.js";

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
  console.log(`
wz2xml — Export .wz files to Classic XML directories

Usage:
  bun run wz2xml <source> <dest>

  <source>  Path to a .wz file or directory containing .wz files
  <dest>    Output directory (created if needed)

Canvas basedata is raw WZ compressed bytes (base64, tagged with wzrawformat).
Sound basehead/basedata are raw bytes (base64). No PNG conversion.
`);
  process.exit(args.length < 2 ? 1 : 0);
}

const sourcePath = resolve(args[0]);
const destPath = resolve(args[1]);

if (!existsSync(sourcePath)) {
  console.error(`Error: source not found: ${sourcePath}`);
  process.exit(1);
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

const PROGRESS_WIDTH = 40;
let _lastProgressLine = "";

function progressBar(done, total, label) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * PROGRESS_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(PROGRESS_WIDTH - filled);
  const pctStr = (pct * 100).toFixed(1).padStart(5);
  const line = `  [${bar}] ${pctStr}% ${done}/${total}  ${label}`;
  if (line !== _lastProgressLine) {
    process.stdout.write(`\r${line}`);
    _lastProgressLine = line;
  }
}

function progressDone() {
  process.stdout.write("\n");
  _lastProgressLine = "";
}

// ─── WZ → XML Export ─────────────────────────────────────────────────────────

/**
 * Base64-encode a Uint8Array (chunked to avoid stack overflow).
 */
function uint8ToBase64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

/**
 * Decrypt listWz block-encrypted data → plain zlib stream.
 * ListWz format: repeating [int32 blockSize] [blockSize XOR-encrypted bytes]
 */
function decryptListWzBlocks(data, wzKey) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const output = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 4 > data.length) break;
    const blockSize = view.getInt32(pos, true);
    pos += 4;
    if (blockSize <= 0 || pos + blockSize > data.length) break;
    wzKey.ensureKeySize(blockSize);
    for (let i = 0; i < blockSize; i++) {
      output.push(data[pos + i] ^ wzKey.at(i));
    }
    pos += blockSize;
  }
  return new Uint8Array(output);
}

/**
 * Walk a parsed image's nodes and set raw base64 for canvas/sound from the WZ buffer.
 * Detects listWz encrypted blocks and decrypts them to plain zlib.
 */
function extractRawBase64(node, wzBuffer, wzKey) {
  const stack = [...node.children];
  while (stack.length) {
    const n = stack.pop();

    if (n.type === "canvas" && !n.basedata && n._pngInfo) {
      try {
        const info = n._pngInfo;
        let bytes = new Uint8Array(wzBuffer, info.dataOffset, info.dataLength);

        // Check if standard zlib (78 xx header) or listWz encrypted blocks
        const header = bytes.length >= 2 ? (bytes[0] | (bytes[1] << 8)) : 0;
        const isStdZlib = (header === 0x9C78 || header === 0xDA78 || header === 0x0178 || header === 0x5E78);
        if (!isStdZlib && bytes.length > 4) {
          // listWz encrypted blocks — decrypt to plain zlib
          bytes = decryptListWzBlocks(bytes, wzKey);
        }

        n.basedata = uint8ToBase64(bytes);
        n.wzrawformat = info.format;
      } catch { /* skip */ }
    }

    if (n.type === "sound" && !n.basedata && n._soundInfo) {
      try {
        const si = n._soundInfo;
        n.basehead = uint8ToBase64(new Uint8Array(wzBuffer, si.headerOffset, si.headerLength));
        n.basedata = uint8ToBase64(new Uint8Array(wzBuffer, si.dataOffset, si.dataLength));
      } catch { /* skip */ }
    }

    for (const child of n.children) stack.push(child);
  }
}

/**
 * Export a single .wz file to a directory of XML files.
 */
function exportWzFile(wzPath, outputDir) {
  const fileName = basename(wzPath);
  console.log(`\n📦 ${fileName}`);

  // Read file
  const fileData = readFileSync(wzPath);
  const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
  console.log(`   ${(buffer.byteLength / 1048576).toFixed(1)} MB`);

  // Parse header + directory tree
  const result = parseWzFile(buffer, fileName, "AUTO", -1, (msg) => {
    process.stdout.write(`\r   ${msg}                    `);
  });
  process.stdout.write("\r");
  console.log(`   ${result.mapleVersion} v${result.version}${result.is64Bit ? " 64-bit" : ""} — ${result.root.countImages()} images`);

  // Build wzKey + reader for image parsing
  const wzKey = generateWzKey(getIvByMapleVersion(result.mapleVersion));

  // Collect all images with their output paths
  const imageQueue = [];
  function collectImages(node, dirPath) {
    for (const child of node.children) {
      if (child.type === "dir") {
        const subDir = join(dirPath, escapeFileName(child.name));
        collectImages(child, subDir);
      } else if (child.type === "image") {
        imageQueue.push({ node: child, dirPath });
      }
    }
  }

  const rootDir = join(outputDir, escapeFileName(fileName));
  collectImages(result.root, rootDir);

  const total = imageQueue.length;
  let done = 0;

  for (const { node: imgNode, dirPath } of imageQueue) {
    // Parse image from binary
    const src = imgNode._binarySource;
    const reader = new WzBinaryReader(buffer, wzKey);
    reader.hash = src.hash;
    reader.header = { fStart: src.headerFStart, fSize: 0, ident: "PKG1", copyright: "" };
    reader.pos = src.offset;

    let children;
    try {
      children = parseImageFromReader(reader, src.offset);
    } catch (err) {
      done++;
      progressBar(done, total, `⚠ ${imgNode.name} (parse error)`);
      continue;
    }

    // Build image node
    const exportNode = new WzNode(imgNode.name, "image");
    exportNode.parsed = true;
    for (const child of children) exportNode.addChild(child);

    // Extract raw base64 (decrypts listWz blocks if needed)
    extractRawBase64(exportNode, buffer, wzKey);

    // Serialize to XML
    const xml = serializeImage(exportNode, { includeBase64: true });

    // Write file
    mkdirSync(dirPath, { recursive: true });
    const xmlPath = join(dirPath, escapeFileName(imgNode.name) + ".xml");
    writeFileSync(xmlPath, xml);

    done++;
    progressBar(done, total, imgNode.name);
  }

  progressDone();
  console.log(`   ✓ ${done} images exported → ${rootDir}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const stat = statSync(sourcePath);
let wzFiles;

if (stat.isDirectory()) {
  wzFiles = readdirSync(sourcePath)
    .filter((f) => extname(f).toLowerCase() === ".wz")
    .sort()
    .map((f) => join(sourcePath, f));
  if (wzFiles.length === 0) {
    console.error(`No .wz files found in ${sourcePath}`);
    process.exit(1);
  }
  console.log(`Found ${wzFiles.length} .wz files in ${sourcePath}`);
} else if (stat.isFile() && extname(sourcePath).toLowerCase() === ".wz") {
  wzFiles = [sourcePath];
} else {
  console.error(`Error: ${sourcePath} is not a .wz file or directory`);
  process.exit(1);
}

mkdirSync(destPath, { recursive: true });

const startTime = Date.now();

let succeeded = 0;
let failed = 0;
for (const wzFile of wzFiles) {
  try {
    exportWzFile(wzFile, destPath);
    succeeded++;
  } catch (err) {
    failed++;
    console.error(`\n   ✗ ${basename(wzFile)}: ${err.message}`);
  }
}

if (failed > 0) {
  console.log(`\n⚠ ${failed} file(s) failed`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s → ${destPath}`);
