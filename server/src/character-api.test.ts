import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";

describe("character API", () => {
  let server: ReturnType<typeof import("bun")["serve"]>;
  let baseUrl: string;

  beforeAll(() => {
    const provider = new InMemoryDataProvider();
    const { start } = createServer(provider, {
      port: 0,
      debug: false,
      dbPath: ":memory:",
    });
    server = start();
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server?.stop();
  });

  const session1 = "test-session-aaa-111";
  const session2 = "test-session-bbb-222";

  function authHeaders(session: string) {
    return { Authorization: `Bearer ${session}`, "Content-Type": "application/json" };
  }

  // ── Auth ──

  test("returns 401 when no Authorization header", async () => {
    const res = await fetch(`${baseUrl}/api/character/load`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  // ── Create ──

  test("POST /api/character/create creates a default character", async () => {
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session1),
      body: JSON.stringify({ name: "TestPlayer", gender: false }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.identity.name).toBe("TestPlayer");
    expect(body.data.identity.gender).toBe(false);
    expect(body.data.stats.level).toBe(1);
    expect(body.data.equipment.length).toBe(4);
    expect(body.data.inventory.length).toBe(6);
    expect(body.data.version).toBe(1);
  });

  test("POST /api/character/create rejects duplicate name", async () => {
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session2),
      body: JSON.stringify({ name: "TestPlayer", gender: true }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NAME_TAKEN");
  });

  test("POST /api/character/create rejects invalid name", async () => {
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session2),
      body: JSON.stringify({ name: "A", gender: false }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/character/create allows same session to re-create", async () => {
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session1),
      body: JSON.stringify({ name: "TestPlayer", gender: true }),
    });
    // Same session re-reserving same name should succeed
    expect(res.status).toBe(201);
  });

  // ── Load ──

  test("GET /api/character/load returns saved character", async () => {
    const res = await fetch(`${baseUrl}/api/character/load`, {
      headers: authHeaders(session1),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.identity.name).toBe("TestPlayer");
  });

  test("GET /api/character/load returns 404 for unknown session", async () => {
    const res = await fetch(`${baseUrl}/api/character/load`, {
      headers: authHeaders("unknown-session"),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ── Save ──

  test("POST /api/character/save updates character data", async () => {
    const save = {
      identity: { name: "TestPlayer", gender: false, skin: 0, face_id: 20000, hair_id: 30000 },
      stats: { level: 5, job: "Beginner", exp: 10, max_exp: 30, hp: 80, max_hp: 80, mp: 15, max_mp: 15, speed: 100, jump: 100, meso: 500 },
      location: { map_id: "103000900", spawn_portal: "sp", facing: 1 },
      equipment: [{ slot_type: "Weapon", item_id: 1302000, item_name: "Sword" }],
      inventory: [],
      achievements: { mobs_killed: 10, maps_visited: ["100000001"], portals_used: 3, items_looted: 5, max_level_reached: 5, total_damage_dealt: 200, deaths: 0, play_time_ms: 60000 },
      version: 1,
      saved_at: new Date().toISOString(),
    };

    const res = await fetch(`${baseUrl}/api/character/save`, {
      method: "POST",
      headers: authHeaders(session1),
      body: JSON.stringify(save),
    });
    expect(res.status).toBe(200);

    // Verify the save persisted
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: authHeaders(session1),
    });
    const loadBody = await loadRes.json();
    expect(loadBody.data.stats.level).toBe(5);
    expect(loadBody.data.location.map_id).toBe("103000900");
  });

  test("POST /api/character/save rejects missing version", async () => {
    const res = await fetch(`${baseUrl}/api/character/save`, {
      method: "POST",
      headers: authHeaders(session1),
      body: JSON.stringify({ name: "no version" }),
    });
    expect(res.status).toBe(400);
  });

  // ── Save via sendBeacon (query param auth) ──

  test("POST /api/character/save accepts session via query param", async () => {
    const save = {
      identity: { name: "TestPlayer", gender: false, skin: 0, face_id: 20000, hair_id: 30000 },
      stats: { level: 7, job: "Beginner", exp: 0, max_exp: 50, hp: 100, max_hp: 100, mp: 20, max_mp: 20, speed: 100, jump: 100, meso: 0 },
      location: { map_id: "100000001", spawn_portal: null, facing: -1 },
      equipment: [], inventory: [],
      achievements: { mobs_killed: 0, maps_visited: [], portals_used: 0, items_looted: 0, max_level_reached: 7, total_damage_dealt: 0, deaths: 0, play_time_ms: 0 },
      version: 1,
    };

    const res = await fetch(`${baseUrl}/api/character/save?session=${session1}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(save),
    });
    expect(res.status).toBe(200);

    // Verify
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: authHeaders(session1),
    });
    const loadBody = await loadRes.json();
    expect(loadBody.data.stats.level).toBe(7);
  });

  // ── Name ──

  test("POST /api/character/name reserves a new name", async () => {
    // Create session2 character first
    await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session2),
      body: JSON.stringify({ name: "Player2", gender: true }),
    });

    const res = await fetch(`${baseUrl}/api/character/name`, {
      method: "POST",
      headers: authHeaders(session2),
      body: JSON.stringify({ name: "NewName2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("POST /api/character/name rejects taken name", async () => {
    const res = await fetch(`${baseUrl}/api/character/name`, {
      method: "POST",
      headers: authHeaders(session2),
      body: JSON.stringify({ name: "TestPlayer" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NAME_TAKEN");
  });

  // ── CORS preflight ──

  test("OPTIONS /api/character/load returns CORS headers", async () => {
    const res = await fetch(`${baseUrl}/api/character/load`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
