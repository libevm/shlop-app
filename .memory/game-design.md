# MapleStory Web Client Completion — Game Design Document (Amended v2)

**Project:** Finish the existing TypeScript MapleStory web client
**Current constraint:** Decomposed WZ→JSON assets are **multi-GB** and currently **only loadable monolithically**
**Primary goal:** Systematically restructure the JSON data and introduce a **standardized query API** so the client requests **only what it needs**
**Implementation constraint:** Keep it simple; both client and server are JavaScript/TypeScript
**Repo requirement:** Separate into two directories: `client/` and `server/`

---

## 1. Scope (What we will build)

### 1.1 Required runtime features

* Map rendering (backgrounds, tiles, objects)
* Character rendering (body/equips as needed by the current TS port)
* Chat bubbles + text rendering
* Sounds + music playback
* Effects (skills/hits/particles as supported by the current assets)
* Physics + collision (platforming)

### 1.2 Required platform feature

* **Asset pack logic**: turn monolithic JSON into a queryable dataset.

### 1.3 Non-goals

* Faithful 1:1 C++ parity
* Porting legacy/dead systems unless they are required for the features above

---

## 2. Repository Layout (Simple)

```
repo/
  client/
    src/
    public/
    package.json
  server/
    src/
    package.json
  tools/
    build-assets/
    package.json
```

* `client/`: browser runtime
* `server/`: asset API + static hosting (or sits behind a CDN)
* `tools/build-assets/`: offline pipeline to transform multi-GB JSON into queryable storage + indexes

---

## 3. Core Problem Statement

### 3.1 Current situation

* Assets are multi-GB JSON
* The TS client can only load them as a monolith (too slow, too big, too much memory)
* The client needs a way to ask: “give me only the map data for map X,” “give me the sprite frames for mob Y,” etc.

### 3.2 Required outcome

A system that supports:

* small requests
* predictable endpoints
* stable IDs and schemas
* incremental loading and caching
* minimal server complexity

---

## 4. Asset Restructuring Strategy (Systematic)

Because the current JSON can only be loaded monolithically, the first deliverable is an **offline transformation pipeline** that produces:

1. **A standardized API schema** (what the client can request)
2. **Indexes** (how the server finds the right data fast)
3. **Sharded storage** (how data is stored so it can be returned in small pieces)

This must be data-driven, derived from examining:

* the existing decomposed JSON structure
* the TS client’s current access patterns (which keys are read, in what order)

---

## 5. Standardized Asset Query API

The client must not fetch arbitrary file paths. It must call stable endpoints that return predictable shapes.

### 5.1 API Concepts

* **Namespaces**: `maps`, `mobs`, `npcs`, `characters`, `effects`, `audio`, `ui`
* **Documents**: small JSON fragments with a defined schema
* **References**: IDs or paths to other documents

### 5.2 Minimal API Endpoints (v1)

These are intentionally few and generic:

#### A) Resolve an entity by type/id

`GET /api/v1/asset/:type/:id`

Examples:

* `/api/v1/asset/map/100000000`
* `/api/v1/asset/mob/9300012`
* `/api/v1/asset/npc/9010000`
* `/api/v1/asset/effect/1121008`

#### B) Fetch a specific sub-document (“section”)

`GET /api/v1/asset/:type/:id/:section`

Examples:

* `/api/v1/asset/map/100000000/tiles`
* `/api/v1/asset/map/100000000/objects`
* `/api/v1/asset/map/100000000/background`
* `/api/v1/asset/mob/9300012/anim`
* `/api/v1/asset/mob/9300012/frames`

#### C) Bulk fetch (reduce chatter)

`POST /api/v1/batch`
Body:

```json
{
  "requests": [
    {"type":"map","id":"100000000","section":"tiles"},
    {"type":"map","id":"100000000","section":"objects"},
    {"type":"mob","id":"9300012","section":"anim"}
  ]
}
```

#### D) Texture/audio binary retrieval (if you store them separately)

* `GET /api/v1/blob/:hash`

---

## 6. “Map-First” Loading Model (Simple, Practical)

### 6.1 Why map-first

Maps are the strongest “scene boundary”:

* entering a map defines most immediate needs (background, tiles, objects, BGM)
* spawns inside the map define additional incremental needs (mob/npc sprites)
* this minimizes preloading complexity

### 6.2 Client load phases

When entering a map:

1. Request map core definition (or a map “index” document)
2. Request tile/background/object sections
3. Render map with placeholders for any missing object sprites
4. As spawns arrive or are parsed:

   * request those mob/npc sprite sections
5. Play BGM once audio is ready

---

## 7. Asset Transformation Pipeline (Tools)

### 7.1 Inputs

* The existing decomposed WZ JSON in its current monolithic form

### 7.2 Outputs

A new dataset optimized for queries:

* **Canonical documents**:

  * `map/<mapId>.json` (or broken into sections)
  * `mob/<mobId>.json`
  * etc.
* **Indexes**:

  * lookup tables from ID → storage location
  * optional reverse index from map → referenced mob/npc ids (prefetch hints)
* **Blobs**:

  * optional separate storage for large repeated payloads (frames, textures, audio) keyed by hash

### 7.3 Systematic splitting rules

The pipeline must discover boundaries based on:

* which JSON subtrees are used together
* which subtrees are large and should be separated (frames, raw geometry, long lists)
* reuse patterns (shared sprites, shared sounds)

### 7.4 Concrete splitting options (choose after inspecting data)

The pipeline should support multiple strategies, selectable by config:

**Option 1: Path-based sharding**

* Split by top-level directories/keys (good if JSON resembles WZ tree layout)

**Option 2: ID-based sharding**

* Extract per-id documents (best if the data has stable IDs)

**Option 3: Section-based sharding**

* Split each entity into sections (`meta`, `anim`, `frames`, `sounds`, etc.)

**Option 4: Hybrid**

* Map documents are sectioned; sprites are per-id; huge arrays are blobbed by hash

The chosen strategy is finalized only after inspecting:

* data structure
* TS client access patterns

---

## 8. Server Design (Simple)

### 8.1 Server goals

* Serve the transformed documents and blobs
* Minimal logic: mostly static file serving + index lookup
* Enable caching (ETags, immutable content hashes)

### 8.2 Implementation approach

* Node.js server (Express/Fastify)
* Data stored on disk:

  * `data/docs/...`
  * `data/blobs/...`
  * `data/index.json`

Server flow for `GET /api/v1/asset/:type/:id/:section?`:

1. Load index entry: find filename(s)
2. Read JSON file from disk (or cached in memory for small indexes)
3. Return response with cache headers

### 8.3 Caching

* Use content-hash filenames where possible:

  * `mob/9300012.frames.<hash>.json`
* Cache headers:

  * hashed assets: long-lived immutable
  * index files: short-lived or versioned

---

## 9. Client Loader (Simple)

### 9.1 Loader responsibilities

* Provide a single API:

  * `getMap(mapId)`
  * `getMapSection(mapId, section)`
  * `getMob(mobId)` etc.
* Dependency resolution:

  * if a map object references a sprite, request it lazily
* Placeholder rendering:

  * do not block the entire map on missing sprites

### 9.2 In-memory cache

* Store fetched documents
* Simple eviction:

  * keep current map + recent map + player assets
  * evict least recently used mobs/effects

---

## 10. Physics + Collision (Minimal Required)

* Platform collision from map data
* Gravity, jump, movement acceleration
* Ladder/rope states
* Map bounds

Physics uses the map collision layer extracted by the pipeline.

---

## 11. Effects + Audio (Minimal Required)

* Effect timelines driven by JSON definitions
* Sound triggers tied to animations/effects
* BGM driven by map document

---

## 12. Milestones

### M1 — Inspect Data + TS Loader Patterns

* Determine current monolithic structure
* Identify what the client queries first (maps vs sprites)
* Decide sharding strategy (Option 1/2/3/4)

### M2 — Build Asset Transformation Pipeline

* Produce docs + index + blobs
* Verify the smallest playable map can be loaded without the full dataset

### M3 — Implement Server API

* `GET asset`, `POST batch`, `GET blob`
* Add caching headers

### M4 — Refactor Client Loader

* Replace direct monolith reads with API calls
* Add lazy dependencies + placeholders

### M5 — Add Physics + Collision

* Parse collision data from map docs
* Implement movement

### M6 — Add Effects + Audio

* Map BGM
* Skill/hit FX + SFX triggers

---

## 13. Deliverables

* `tools/build-assets/` pipeline producing:

  * queryable docs
  * index files
  * optional blob store
* `server/` API for querying assets
* `client/` loader refactor to use API + cache
* Physics, effects, audio, chat bubble systems integrated

---

## 14. Notes on “Finalize After Inspection”

This design intentionally defers the exact split boundaries until inspection, because:

* some JSON trees split cleanly by ID
* others are deep WZ-style path graphs
* some have heavy reuse that benefits from blob hashing

The pipeline must support multiple strategies, and the selection is made after reading:

* the decomposed JSON layout
* the existing TS asset access patterns

---

