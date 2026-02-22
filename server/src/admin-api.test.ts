import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";

function solveChallenge(challenge: string, difficulty: number): string {
  const fullBytes = Math.floor(difficulty / 8);
  const remainBits = difficulty % 8;
  const mask = remainBits > 0 ? (0xff << (8 - remainBits)) & 0xff : 0;
  let nonce = 0;
  while (true) {
    const nonceStr = nonce.toString(16);
    const hash = createHash("sha256").update(challenge + nonceStr).digest();
    let valid = true;
    for (let b = 0; b < fullBytes; b++) {
      if (hash[b] !== 0) {
        valid = false;
        break;
      }
    }
    if (valid && remainBits > 0 && (hash[fullBytes] & mask) !== 0) valid = false;
    if (valid) return nonceStr;
    nonce++;
  }
}

async function getValidSession(baseUrl: string): Promise<string> {
  const chResp = await fetch(`${baseUrl}/api/pow/challenge`);
  const chData = (await chResp.json()) as { challenge: string; difficulty: number };
  const nonce = solveChallenge(chData.challenge, chData.difficulty);
  const vResp = await fetch(`${baseUrl}/api/pow/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: chData.challenge, nonce }),
  });
  const vData = (await vResp.json()) as { session_id: string };
  return vData.session_id;
}

describe("admin API", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl = "";
  let dbPath = "";
  let gmSession = "";
  let gmToken = "";

  const authHeaders = (session: string) => ({ Authorization: `Bearer ${session}`, "Content-Type": "application/json" });
  const adminHeaders = () => ({ Authorization: `Bearer ${gmToken}`, "Content-Type": "application/json" });

  beforeAll(async () => {
    process.env.POW_DIFFICULTY = "1";
    dbPath = join(tmpdir(), `shlop-admin-api-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    const provider = new InMemoryDataProvider();
    const { start } = createServer(provider, {
      port: 0,
      debug: false,
      dbPath,
      adminUiEnabled: true,
    });
    server = start();
    baseUrl = `http://127.0.0.1:${server.port}`;

    gmSession = await getValidSession(baseUrl);

    await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(gmSession),
      body: JSON.stringify({ name: "AdminGM", gender: false }),
    });

    await fetch(`${baseUrl}/api/character/claim`, {
      method: "POST",
      headers: authHeaders(gmSession),
      body: JSON.stringify({ password: "gm-pass-123" }),
    });

    const db = new Database(dbPath);
    db.query("UPDATE characters SET gm = 1 WHERE name COLLATE NOCASE = ?").run("AdminGM");
    db.close();

    const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "AdminGM", password: "gm-pass-123" }),
    });
    const loginBody = await loginRes.json();
    gmToken = loginBody.token;
  });

  afterAll(() => {
    delete process.env.POW_DIFFICULTY;
    server?.stop();
  });

  test("requires auth for admin routes", async () => {
    const res = await fetch(`${baseUrl}/api/admin/tables`);
    expect(res.status).toBe(401);
  });

  test("GM login succeeds and /auth/me works", async () => {
    expect(gmToken.length).toBeGreaterThan(10);
    const meRes = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: adminHeaders() });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.ok).toBe(true);
    expect(meBody.user.username).toBe("AdminGM");
  });

  test("non-GM login is rejected", async () => {
    const session = await getValidSession(baseUrl);
    await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ name: "RegularUser", gender: false }),
    });
    await fetch(`${baseUrl}/api/character/claim`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ password: "regular-pass" }),
    });

    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "RegularUser", password: "regular-pass" }),
    });
    expect(res.status).toBe(403);
  });

  test("bad password is rejected", async () => {
    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "AdminGM", password: "bad-pass" }),
    });
    expect(res.status).toBe(401);
  });

  test("table browse endpoint returns data", async () => {
    const res = await fetch(`${baseUrl}/api/admin/tables`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.tables)).toBe(true);
    expect(body.tables.includes("characters")).toBe(true);
  });

  test("read-only SQL guard rejects mutating query", async () => {
    const res = await fetch(`${baseUrl}/api/admin/query`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ sql: "UPDATE characters SET gm = 0" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("READ_ONLY_SQL");
  });

  test("CSV export works", async () => {
    const res = await fetch(`${baseUrl}/api/admin/table/characters/export.csv?limit=10&offset=0`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.includes("text/csv")).toBe(true);
    const text = await res.text();
    expect(text.includes("name")).toBe(true);
  });

  test("login endpoint is rate-limited after repeated failures", async () => {
    let got429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "AdminGM", password: "wrong" + i }),
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
