# WZ Editor

Browser-based WZ file editor. Runs via `bun run client:wzeditor` on port 5175. All parsing, editing, and serialization is client-side — the server only serves static files.

## What It Does

- Opens `.wz` binary files (auto-detects GMS/EMS/BMS encryption and version, supports 64-bit format)
- Opens Harepacker-exported XML (classic directory, single file, `<xmldump>` — all three formats auto-detected)
- Browse the full tree: directories, images, all property types (int, short, long, float, double, string, vector, canvas, sound, uol, null, convex, sub)
- Preview images (8 pixel formats including DXT3/DXT5), play sounds, animate sprite sequences with playback controls
- Edit values, add/remove/rename nodes, sort children, copy/paste/cut with undo/redo
- Search by name/value with regex and case-sensitive options
- Export as Classic XML directory (parallel worker pool + 16 concurrent file writers; canvas stores raw WZ bytes as base64, not PNG)
- Save as repacked `.wz` binary
- Quick-save modified XML images in-place via File System Access API

## File Map

```
client/wzeditor/                 22 files, ~6,400 lines
├── index.html                   Layout, toolbar, status bar, progress bar
├── wzeditor.js                  App entry: state, tree, properties, preview, export/save, undo, copy/paste
├── styles.css                   Dark theme (Catppuccin Mocha)
├── wz/                          Pure JS engine (no DOM, Worker-safe)
│   ├── wz-node.js               Unified WzNode model
│   ├── wz-binary-reader.js      DataView wrapper with WZ-specific reads
│   ├── wz-binary-writer.js      Repack WzNode tree → .wz binary
│   ├── wz-constants.js          Encryption IVs, AES key, offset constant
│   ├── wz-crypto.js             Pure-JS AES-256-ECB for WZ key schedule
│   ├── wz-tool.js               Version hash, 64-bit detection
│   ├── wz-file.js               Parse .wz header + directory tree
│   ├── wz-image.js              Parse image properties (all types)
│   ├── wz-png.js                8 pixel formats → RGBA → PNG data URL
│   ├── wz-sound.js              Sound bytes → Blob URL
│   ├── wz-xml-parser.js         Harepacker XML → WzNode (Format A/B/C)
│   ├── wz-xml-serializer.js     WzNode → Classic XML, directory export
│   ├── wz-worker.js             Web Worker for heavy parsing
│   └── wz-export-worker.js      Web Worker for parallel export (parse + raw base64 + XML serialize)
└── ui/
    ├── wz-context-menu.js       Type-aware right-click menus
    ├── wz-search.js             Search panel with regex/case/field options
    ├── wz-dialogs.js            Promise-based modals
    ├── wz-undo.js               Undo/redo stack + action factories
    └── wz-xml-view.js           Raw XML viewer with clipboard copy

tools/dev/serve-wzeditor.mjs     Static file server with COOP/COEP headers (~70 lines)
tools/wz2xml.mjs                CLI: bun run wz2xml <source> <dest> — batch export .wz → XML dirs (~200 lines)
```

## CLI Export Tool

`bun run wz2xml <source> <dest>` — headless batch exporter (no browser needed).

- `<source>` — single `.wz` file or directory of `.wz` files
- `<dest>` — output directory (created if needed)
- Uses the same WZ engine as the editor (pure JS, auto-detect encryption/version)
- Canvas `basedata` = raw WZ compressed bytes, tagged with `wzrawformat`
- Sound `basehead`/`basedata` = raw bytes (base64)
- No PNG conversion — just base64 of the raw WZ data
- Progress bar per `.wz` file, graceful error handling (one bad file doesn't stop the batch)
- Performance: ~15s for entire v83 GMS dataset (~900 MB, 16,800 images)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Navigate tree |
| Enter / Click | Expand/collapse |
| Delete | Remove node |
| F2 | Rename |
| Ctrl+S | Save modified |
| Ctrl+E | Export all XML |
| Ctrl+I | Import XML |
| Ctrl+F | Toggle search |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+C / Ctrl+V / Ctrl+X | Copy / Paste / Cut |

## Key Design Choices

- **Zero npm dependencies** for core — all browser-native APIs (File, DataView, DOMParser, OffscreenCanvas, File System Access, SharedArrayBuffer, Web Workers)
- **COOP/COEP headers** on the static server enable SharedArrayBuffer for the export worker pool
- **Pure-JS AES-256-ECB** because Web Crypto lacks ECB mode (~150 lines)
- **Lazy image parsing** — only parses image contents on expand (double-click)
- **Virtual-scroll tree** — renders only visible rows for large WZ files (Map.wz = 2,847 images)
- **Parallel export pipeline** — Worker pool (SharedArrayBuffer, up to `hardwareConcurrency` workers, max 8; falls back to 1 worker with cloned buffer if no SAB) parses images from binary, extracts raw base64 for canvas/sound, and serializes XML entirely off the main thread. 16 concurrent file writes via semaphore. Canvas `basedata` is raw WZ compressed bytes (not PNG) for speed — tagged with `wzrawformat="N"` attribute so consumers can detect and decode. Main thread only writes files and updates progress.
- **`prepareImageForExport` fallback** — for modified or XML-loaded images that can't use the worker pool: walks descendants and base64-encodes raw WZ bytes (canvas/sound) on the main thread. No pixel decode or PNG encode. Sets `node.wzrawformat` for serializer.
- **`wzrawformat` attribute** — canvas elements exported with raw WZ compressed bytes include `wzrawformat="N"` (pixel format ID: 1=BGRA4444, 2=BGRA8888, 513=RGB565, 1026=DXT3, 2050=DXT5, etc.). All consumers (WZ editor XML parser, game client `wz-xml-adapter.js`, server `wz-xml.ts`) parse and propagate this attribute. Game client uses `wz-canvas-decode.js` → `wz-decode-worker.js` (Web Worker pool) to inflate + pixel-decode + PNG-encode off the main thread when `wzrawformat` is present.
- **`beforeunload` guard** during export to prevent accidental data loss
- **Unmodified images bypass serialization** in WZ repack — original binary bytes are copied directly
