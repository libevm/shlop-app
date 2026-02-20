import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";
import { createDefaultCharacter, initDatabase } from "./db.ts";

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

    // The server creates its own in-memory DB. We need to create characters there.
    // Use the character API to create them.
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

  test("authenticates and receives map_state", async () => {
    await createCharacter(sessionA, "Alice2");

    const client = await openWS(wsUrl);
    client.send({ type: "auth", session_id: sessionA });

    const mapState = await client.waitForMessage("map_state");
    expect(mapState.type).toBe("map_state");
    expect(Array.isArray(mapState.players)).toBe(true);

    client.close();
  });

  test("two clients see each other", async () => {
    // Ensure characters exist with unique names
    await createCharacter("multi-a", "MultiA");
    await createCharacter("multi-b", "MultiB");

    // Connect client A
    const clientA = await openWS(wsUrl);
    clientA.send({ type: "auth", session_id: "multi-a" });
    await clientA.waitForMessage("map_state");

    // Connect client B (same default map)
    const clientB = await openWS(wsUrl);
    clientB.send({ type: "auth", session_id: "multi-b" });

    // Client B should get map_state with client A in it
    const bMapState = await clientB.waitForMessage("map_state");
    expect(bMapState.type).toBe("map_state");
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
    clientA.send({ type: "auth", session_id: "move-a" });
    await clientA.waitForMessage("map_state");

    const clientB = await openWS(wsUrl);
    clientB.send({ type: "auth", session_id: "move-b" });
    await clientB.waitForMessage("map_state");

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
    clientA.send({ type: "auth", session_id: "chat-a" });
    await clientA.waitForMessage("map_state");

    const clientB = await openWS(wsUrl);
    clientB.send({ type: "auth", session_id: "chat-b" });
    await clientB.waitForMessage("map_state");

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
    clientA.send({ type: "auth", session_id: "leave-a" });
    await clientA.waitForMessage("map_state");

    const clientB = await openWS(wsUrl);
    clientB.send({ type: "auth", session_id: "leave-b" });
    await clientB.waitForMessage("map_state");
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
    client.send({ type: "auth", session_id: "ping-a" });
    await client.waitForMessage("map_state");

    client.send({ type: "ping" });
    const pong = await client.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    client.close();
  });

  test("enter_map changes room and notifies", async () => {
    await createCharacter("room-a", "RoomA");
    await createCharacter("room-b", "RoomB");

    const clientA = await openWS(wsUrl);
    clientA.send({ type: "auth", session_id: "room-a" });
    await clientA.waitForMessage("map_state");

    const clientB = await openWS(wsUrl);
    clientB.send({ type: "auth", session_id: "room-b" });
    await clientB.waitForMessage("map_state");
    await clientA.waitForMessage("player_enter");

    // Client A enters a different map
    clientA.send({ type: "enter_map", map_id: "999999999" });

    // Client A should get map_state for new map
    const newMapState = await clientA.waitForMessage("map_state");
    expect(newMapState.type).toBe("map_state");
    const players = newMapState.players as Array<{ id: string }>;
    expect(players.length).toBe(0); // alone in new map

    // Client B should get player_leave
    const leaveMsg = await clientB.waitForMessage("player_leave");
    expect(leaveMsg.id).toBe("room-a");

    clientA.close();
    clientB.close();
  });
});
