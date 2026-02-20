/**
 * Character API middleware — handles /api/character/* routes.
 *
 * Endpoints:
 * - POST /api/character/create  → create character with name + gender
 * - GET  /api/character/load    → load character data
 * - POST /api/character/save    → save character data
 * - POST /api/character/name    → reserve a name
 */
import type { Database } from "bun:sqlite";
import {
  saveCharacterData,
  loadCharacterData,
  reserveName,
  createDefaultCharacter,
} from "./db.ts";

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractSessionId(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1].trim();
  return token.length > 0 ? token : null;
}

// ─── Handler ────────────────────────────────────────────────────────

export async function handleCharacterRequest(
  request: Request,
  url: URL,
  db: Database,
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === "OPTIONS" && path.startsWith("/api/character/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Only handle /api/character/* routes
  if (!path.startsWith("/api/character/")) return null;

  // Extract session ID from header or query param (sendBeacon can't set headers)
  const sessionId = extractSessionId(request) || url.searchParams.get("session");
  if (!sessionId) {
    return jsonResponse(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } },
      401,
    );
  }

  // ── POST /api/character/create ──
  if (method === "POST" && path === "/api/character/create") {
    let body: { name?: string; gender?: boolean };
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
        400,
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const gender = body.gender === true;

    if (name.length < 2 || name.length > 12) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_NAME", message: "Name must be 2-12 characters" } },
        400,
      );
    }

    if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_NAME", message: "Name contains invalid characters" } },
        400,
      );
    }

    // Check if name is available
    const nameResult = reserveName(db, sessionId, name);
    if (!nameResult.ok) {
      return jsonResponse(
        { ok: false, error: { code: "NAME_TAKEN", message: "That name is already taken" } },
        409,
      );
    }

    // Create default character
    const save = createDefaultCharacter(db, sessionId, name, gender);
    return jsonResponse({ ok: true, data: save }, 201);
  }

  // ── GET /api/character/load ──
  if (method === "GET" && path === "/api/character/load") {
    const data = loadCharacterData(db, sessionId);
    if (!data) {
      return jsonResponse(
        { ok: false, error: { code: "NOT_FOUND", message: "No character found for this session" } },
        404,
      );
    }
    return jsonResponse({ ok: true, data });
  }

  // ── POST /api/character/save ──
  if (method === "POST" && path === "/api/character/save") {
    let body: unknown;

    // Support both JSON and sendBeacon (which sends text/plain)
    const contentType = request.headers.get("Content-Type") || "";
    try {
      if (contentType.includes("application/json") || contentType.includes("text/plain")) {
        body = await request.json();
      } else {
        // Try parsing as JSON regardless
        const text = await request.text();
        body = JSON.parse(text);
      }
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
        400,
      );
    }

    if (!body || typeof body !== "object" || !("version" in body)) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_BODY", message: "Missing version field" } },
        400,
      );
    }

    saveCharacterData(db, sessionId, JSON.stringify(body));
    return jsonResponse({ ok: true });
  }

  // ── POST /api/character/name ──
  if (method === "POST" && path === "/api/character/name") {
    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
        400,
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 12) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_NAME", message: "Name must be 2-12 characters" } },
        400,
      );
    }

    const result = reserveName(db, sessionId, name);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: { code: "NAME_TAKEN", message: "That name is already taken" } },
        409,
      );
    }
    return jsonResponse({ ok: true });
  }

  // Unknown /api/character/ route
  return null;
}
