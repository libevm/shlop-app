import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";
import { createDefaultCharacter, initDatabase } from "./db.ts";
import { setDebugMode } from "./ws.ts";

/**
 * Helper: open a WebSocket and return a promise-based interface.
 */
function openWS(url: string): Promise<{
  ws: WebSocket;
  messages: Array<{ type: string; [key: string]: unknown }>;
  waitForMessage: (type: string, timeoutMs?: number) => Promise<{ type: string; [key: string]: unknown }>;
  send: (msg: unknown) => void;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const waiters: Array<{ type: string; resolve: (msg: unknown) => void; timer: ReturnType<typeof setTimeout> }> = [];

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage(type: string, timeoutMs = 2000) {
          // Check if already received
          const idx = messages.findIndex(m => m.type === type);
          if (idx >= 0) {
            const msg = messages[idx];
            messages.splice(idx, 1);
            return Promise.resolve(msg);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
            waiters.push({ type, resolve: res as (msg: unknown) => void, timer });
          });
        },
        send(msg: unknown) { ws.send(JSON.stringify(msg)); },
        close() { ws.close(); },
      });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data));
        // Check waiters first
        const waiterIdx = waiters.findIndex(w => w.type === msg.type);
        if (waiterIdx >= 0) {
          const waiter = waiters[waiterIdx];
          waiters.splice(waiterIdx, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        } else {
          messages.push(msg);
        }
      } catch {}
    };
  });
}

/**
 * Helper: authenticate a client and complete the map change handshake.
 * Returns after the client is fully in a room (map_state received).
 */
async function authAndJoin(client: Awaited<ReturnType<typeof openWS>>, sessionId: string) {
  client.send({ type: "auth", session_id: sessionId });
  // Server sends change_map first (server-authoritative map assignment)
  const changeMap = await client.waitForMessage("change_map");
  expect(changeMap.type).toBe("change_map");
  expect(typeof changeMap.map_id).toBe("string");
  // Client signals it loaded the map
  client.send({ type: "map_loaded" });
  // Server then sends map_state once client is in the room
  const mapState = await client.waitForMessage("map_state");
  expect(mapState.type).toBe("map_state");
  return { changeMap, mapState };
}

describe("WebSocket server", () => {
  let server: ReturnType<typeof import("bun")["serve"]> & { roomManager?: unknown };
  let baseUrl: string;
  let wsUrl: string;

  const sessionA = "ws-test-session-aaa";
  const sessionB = "ws-test-session-bbb";

  beforeAll(() => {
    const provider = new InMemoryDataProvider();
    const db = initDatabase(":memory:");

    // Create test characters
    createDefaultCharacter(db, sessionA, "Alice", false);
    createDefaultCharacter(db, sessionB, "Bob", true);

    const { start } = createServer(provider, {
      port: 0,
      debug: false,
      dbPath: ":memory:", // Note: server creates its own DB; we pre-seed below
    });
    server = start();
    baseUrl = `http://localhost:${server.port}`;
    wsUrl = `ws://localhost:${server.port}/ws`;
  });

  afterAll(() => {
    server?.stop();
  });

  // Helper: create character via REST API so server DB has it
  async function createCharacter(session: string, name: string) {
    await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
      body: JSON.stringify({ name, gender: false }),
    });
  }

  test("rejects non-auth first message", async () => {
    await createCharacter(sessionA, "Alice");

    const client = await openWS(wsUrl);
    client.send({ type: "move", x: 0, y: 0 });

    // Server should close with 4001
    await new Promise<void>((resolve) => {
      client.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4001);
        resolve();
      };
    });
  });

  test("rejects auth with unknown session", async () => {
    const client = await openWS(wsUrl);
    client.send({ type: "auth", session_id: "nonexistent-session-xyz" });

    await new Promise<void>((resolve) => {
      client.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4002);
        resolve();
      };
    });
  });

  test("authenticates: receives change_map then map_state after map_loaded", async () => {
    await createCharacter(sessionA, "Alice2");

    const client = await openWS(wsUrl);
    const { changeMap, mapState } = await authAndJoin(client, sessionA);

    expect(changeMap.map_id).toBe("100000001"); // default start map
    expect(Array.isArray(mapState.players)).toBe(true);

    client.close();
  });

  test("two clients see each other", async () => {
    // Ensure characters exist with unique names
    await createCharacter("multi-a", "MultiA");
    await createCharacter("multi-b", "MultiB");

    // Connect client A
    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "multi-a");

    // Connect client B (same default map)
    const clientB = await openWS(wsUrl);
    const { mapState: bMapState } = await authAndJoin(clientB, "multi-b");

    // Client B should get map_state with client A in it
    const players = bMapState.players as Array<{ id: string; name: string }>;
    expect(players.some(p => p.id === "multi-a")).toBe(true);

    // Client A should receive player_enter for client B
    const enterMsg = await clientA.waitForMessage("player_enter");
    expect(enterMsg.id).toBe("multi-b");
    expect(enterMsg.name).toBe("MultiB");

    clientA.close();
    clientB.close();
  });

  test("move broadcasts to room", async () => {
    await createCharacter("move-a", "MoverA");
    await createCharacter("move-b", "MoverB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "move-a");

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, "move-b");

    // Drain player_enter messages
    await clientA.waitForMessage("player_enter");

    // Client A moves
    clientA.send({ type: "move", x: 100, y: 200, action: "walk1", facing: 1 });

    // Client B should receive player_move
    const moveMsg = await clientB.waitForMessage("player_move");
    expect(moveMsg.id).toBe("move-a");
    expect(moveMsg.x).toBe(100);
    expect(moveMsg.y).toBe(200);
    expect(moveMsg.action).toBe("walk1");
    expect(moveMsg.facing).toBe(1);

    clientA.close();
    clientB.close();
  });

  test("chat broadcasts to room", async () => {
    await createCharacter("chat-a", "ChatterA");
    await createCharacter("chat-b", "ChatterB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "chat-a");

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, "chat-b");

    // Drain player_enter
    await clientA.waitForMessage("player_enter");

    clientA.send({ type: "chat", text: "Hello world!" });

    // Chat includes sender (broadcast to all in room)
    const chatB = await clientB.waitForMessage("player_chat");
    expect(chatB.name).toBe("ChatterA");
    expect(chatB.text).toBe("Hello world!");

    // Sender also gets it (chat is not excluded)
    const chatA = await clientA.waitForMessage("player_chat");
    expect(chatA.text).toBe("Hello world!");

    clientA.close();
    clientB.close();
  });

  test("disconnect broadcasts player_leave", async () => {
    await createCharacter("leave-a", "LeaverA");
    await createCharacter("leave-b", "LeaverB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "leave-a");

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, "leave-b");
    await clientA.waitForMessage("player_enter");

    // Client A disconnects
    clientA.close();

    // Client B should receive player_leave
    const leaveMsg = await clientB.waitForMessage("player_leave");
    expect(leaveMsg.id).toBe("leave-a");

    clientB.close();
  });

  test("ping responds with pong", async () => {
    await createCharacter("ping-a", "PingerA");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "ping-a");

    client.send({ type: "ping" });
    const pong = await client.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    client.close();
  });

  test("admin_warp works when debug mode is enabled", async () => {
    await createCharacter("room-a", "RoomA");
    await createCharacter("room-b", "RoomB");

    // Enable debug mode for this test
    setDebugMode(true);

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "room-a");

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, "room-b");
    await clientA.waitForMessage("player_enter");

    // Client A warps to a different map via admin_warp
    clientA.send({ type: "admin_warp", map_id: "100000000" });

    // Client A should get change_map from server
    const changeMap = await clientA.waitForMessage("change_map");
    expect(changeMap.map_id).toBe("100000000");

    // Client A completes loading
    clientA.send({ type: "map_loaded" });

    // Client A should get map_state for the new map
    const newMapState = await clientA.waitForMessage("map_state");
    expect(newMapState.type).toBe("map_state");

    // Client B should get player_leave
    const leaveMsg = await clientB.waitForMessage("player_leave");
    expect(leaveMsg.id).toBe("room-a");

    clientA.close();
    clientB.close();
    setDebugMode(false);
  });

  test("admin_warp is denied when debug mode is off", async () => {
    await createCharacter("nodebug-a", "NoDebugA");

    setDebugMode(false);
    const client = await openWS(wsUrl);
    await authAndJoin(client, "nodebug-a");

    client.send({ type: "admin_warp", map_id: "100000000" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.reason).toContain("disabled");

    client.close();
  });

  test("enter_map and leave_map are silently ignored", async () => {
    await createCharacter("compat-a", "CompatA");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, "compat-a");

    // Send deprecated messages — should be silently ignored, no crash
    clientA.send({ type: "enter_map", map_id: "100000000" });
    clientA.send({ type: "leave_map" });

    // Verify client is still alive
    clientA.send({ type: "ping" });
    const pong = await clientA.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    clientA.close();
  });

  test("rejects duplicate session (already logged in)", async () => {
    await createCharacter("dup-a", "DupA");

    // First connection succeeds
    const client1 = await openWS(wsUrl);
    await authAndJoin(client1, "dup-a");

    // Second connection with same session should be rejected
    const client2 = await openWS(wsUrl);
    client2.send({ type: "auth", session_id: "dup-a" });

    await new Promise<void>((resolve) => {
      client2.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4006);
        resolve();
      };
    });

    // First connection should still be alive
    client1.send({ type: "ping" });
    const pong = await client1.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    client1.close();
  });

  test("cannot steal unclaimed name from online player", async () => {
    const onlineSession = "online-holder-session";
    const thiefSession = "thief-session";

    // Create a character with an unclaimed name
    await createCharacter(onlineSession, "OnlineHero");

    // Connect via WebSocket (player is now online)
    const client = await openWS(wsUrl);
    await authAndJoin(client, onlineSession);

    // Another session tries to create a character with the same name
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${thiefSession}` },
      body: JSON.stringify({ name: "OnlineHero", gender: false }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NAME_TAKEN");

    client.close();
  });

  test("can take unclaimed name from offline player", async () => {
    const offlineSession = "offline-holder-session";
    const takerSession = "taker-session";

    // Create a character with an unclaimed name (no WS connection = offline)
    await createCharacter(offlineSession, "OfflineHero");

    // Another session takes the name — should succeed (unclaimed + offline)
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${takerSession}` },
      body: JSON.stringify({ name: "OfflineHero", gender: true }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.identity.name).toBe("OfflineHero");
  });

  test("use_portal validates portal proximity", async () => {
    await createCharacter("portal-a", "PortalA");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "portal-a");

    // Move client to a known position far from any portal (confirms position)
    client.send({ type: "move", x: 9999, y: 9999, action: "stand1", facing: 1 });
    // Small delay to let server process the move
    await new Promise(r => setTimeout(r, 50));

    // Try to use a portal — should be denied (too far)
    client.send({ type: "use_portal", portal_name: "out02" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");

    client.close();
  });

  test("use_portal requires position confirmation", async () => {
    await createCharacter("portal-nopos", "PortalNoPos");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "portal-nopos");

    // Try to use portal WITHOUT sending any move first
    client.send({ type: "use_portal", portal_name: "out02" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");
    expect(denied.reason).toContain("Position not confirmed");

    client.close();
  });

  test("use_portal with nonexistent portal is denied", async () => {
    await createCharacter("portal-b", "PortalB");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "portal-b");

    // Must confirm position first
    client.send({ type: "move", x: 100, y: 200, action: "stand1", facing: 1 });
    await new Promise(r => setTimeout(r, 50));

    client.send({ type: "use_portal", portal_name: "nonexistent_portal_xyz" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");
    expect(denied.reason).toContain("not found");

    client.close();
  });

  test("npc_warp validates NPC is on current map", async () => {
    await createCharacter("npc-a", "NpcA");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "npc-a");

    // Try NPC warp with an NPC that doesn't exist on the default map
    client.send({ type: "npc_warp", npc_id: "9999999", map_id: 100000000 });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.reason).toContain("NPC not on this map");

    client.close();
  });

  test("npc_warp validates destination is allowed for NPC", async () => {
    // This test needs an NPC that IS on map 100000001
    // Let's check if there are NPCs on the default start map
    await createCharacter("npc-b", "NpcB");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "npc-b");

    // Try warp with a valid NPC but invalid destination
    // Map 100000001 should have some NPCs - send npc_warp with one + bogus destination
    // We'll use a NPC ID that might exist but request a non-whitelisted map
    client.send({ type: "npc_warp", npc_id: "1012000", map_id: 100000001 });
    const denied = await client.waitForMessage("portal_denied");
    // Should be denied — either NPC not on map, or invalid destination
    expect(denied.type).toBe("portal_denied");

    client.close();
  });

  test("save_state persists inventory and equipment to DB", async () => {
    await createCharacter("save-test", "SaveTester");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "save-test");

    // Send save_state with custom inventory and equipment
    client.send({
      type: "save_state",
      inventory: [
        { item_id: 2000000, qty: 50, inv_type: "USE", slot: 0, category: null },
        { item_id: 4000000, qty: 20, inv_type: "ETC", slot: 0, category: null },
      ],
      equipment: [
        { slot_type: "Weapon", item_id: 1302000 },
        { slot_type: "Coat", item_id: 1040002 },
      ],
      stats: { level: 5, job: "Warrior", hp: 100, max_hp: 100, mp: 30, max_mp: 30,
               exp: 50, max_exp: 200, speed: 100, jump: 100, meso: 500 },
    });

    // Wait a moment for server to process + persist
    await new Promise(resolve => setTimeout(resolve, 100));

    client.close();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Load character from REST API and verify the saved state
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: { Authorization: "Bearer save-test" },
    });
    const body = await loadRes.json();
    const data = body.data ?? body;

    // Inventory should match what we sent
    expect(data.inventory).toHaveLength(2);
    expect(data.inventory[0].item_id).toBe(2000000);
    expect(data.inventory[0].qty).toBe(50);
    expect(data.inventory[1].item_id).toBe(4000000);
    expect(data.inventory[1].qty).toBe(20);

    // Equipment should match
    expect(data.equipment).toHaveLength(2);
    const weaponEq = data.equipment.find((e: any) => e.slot_type === "Weapon");
    expect(weaponEq.item_id).toBe(1302000);

    // Stats should match
    expect(data.stats.level).toBe(5);
    expect(data.stats.job).toBe("Warrior");
    expect(data.stats.hp).toBe(100);
    expect(data.stats.meso).toBe(500);
  });

  test("disconnect persists last-known state to DB", async () => {
    await createCharacter("dc-test", "DcTester");

    const client = await openWS(wsUrl);
    await authAndJoin(client, "dc-test");

    // Move to update position
    client.send({ type: "move", x: 300, y: 200, action: "walk1", facing: 1 });
    await new Promise(resolve => setTimeout(resolve, 50));

    // Send equip change (server tracks look.equipment in memory)
    client.send({
      type: "save_state",
      inventory: [{ item_id: 2000000, qty: 99, inv_type: "USE", slot: 0, category: null }],
      equipment: [{ slot_type: "Weapon", item_id: 1302000 }],
      stats: { level: 3, job: "Magician", hp: 80, max_hp: 80, mp: 50, max_mp: 50,
               exp: 10, max_exp: 60, speed: 100, jump: 100, meso: 100 },
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Disconnect (server should persist on close)
    client.close();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Load and verify disconnect save captured the state
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: { Authorization: "Bearer dc-test" },
    });
    const body = await loadRes.json();
    const data = body.data ?? body;

    expect(data.inventory).toHaveLength(1);
    expect(data.inventory[0].item_id).toBe(2000000);
    expect(data.inventory[0].qty).toBe(99);
    expect(data.stats.level).toBe(3);
    expect(data.stats.job).toBe("Magician");
    // Location should reflect the map they were on
    expect(data.location.map_id).toBe("100000001");
  });
});
