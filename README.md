# Shlop

A MapleStory web client and game server, **entirely vibe coded** with AI.

Vanilla JS canvas client, Bun game server, SQLite persistence. No frameworks, no bundler in dev.

## Running

Requires **Bun** ≥ 1.3 and pre-extracted WZ XML assets in `resourcesv3/`.

```bash
bun install

# Terminal 1 — game server (port 5200)
bun run server

# Terminal 2 — client dev server (port 5173)
bun run client
```

That's it. Open `http://localhost:5173`.

### Production

```bash
bun run client:prod   # minified + gzipped, no hot-reload
```

### Admin Dashboard

```bash
bun run create-gm <username> <password>   # create GM account first
bun run client:admin-ui                    # opens on port 5174
```

### WZ Editor

```bash
bun run client:wzeditor          # opens on port 5175
```

Browser-based WZ file editor — open `.wz` binaries or Harepacker XML, browse/edit the tree, export as XML or repack as `.wz`. Fully client-side, no server logic. Export uses a worker pool for parallel parsing and 16 concurrent file writes.

### WZ → XML CLI Export

```bash
bun run wz2xml <source> <dest>
```

Headless batch exporter — convert `.wz` files to Classic XML directories without a browser. `<source>` can be a single `.wz` file or a directory containing multiple `.wz` files. `<dest>` is the output directory (created if needed). Exports canvas data as raw WZ compressed bytes (base64, tagged with `wzrawformat`) — no PNG conversion. Includes a progress bar per file.

```bash
# Single file
bun run wz2xml ~/wz_data/Character.wz ./out

# Entire directory of .wz files
bun run wz2xml ~/wz_data ./out
```

### GM Commands

In-game chat with a GM character:

- `/map <id>` — warp to map
- `/teleport <user> <map_id>` — teleport another player

## Layout

```
client/web/        Vanilla JS browser client (14 modules, canvas 2D)
server/src/        Bun game server (REST + WebSocket + SQLite)
client/admin-ui/   Admin dashboard (GM-only DB browser)
client/wzeditor/   Browser-based WZ file editor (open/edit/export/repack)
tools/wz2xml.mjs   CLI batch exporter: .wz → XML directories
resourcesv3/       Extracted WZ XML game assets (Classic XML format)
.memory/           Architecture docs (agent context)
```

## Tests

```bash
cd server && bun test src/
```

## Disclaimer

All graphics and sound assets are rights reserved to Nexon. This open source project is for research and educational purposes only, with no commercial intent.

## Acknowledgements

- [ryantpayton/MapleStory-Client](https://github.com/ryantpayton/MapleStory-Client) — C++ reference client used for physics, rendering, and protocol parity
- [Jeck-Sparrow-5/MapleWeb](https://github.com/Jeck-Sparrow-5/MapleWeb) — inspiration for a web-based MapleStory client
