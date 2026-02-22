import { Database, type SQLQueryBindings } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import {
  appendLog,
  createAdminSession,
  getAdminSession,
  isGm,
  purgeExpiredAdminSessions,
  revokeAdminSession,
  touchAdminSession,
} from "./db.ts";

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

type AdminSession = {
  tokenHash: string;
  username: string;
  expiresAt: string;
};

export type AdminApiConfig = {
  dbPath: string;
  sessionTtlMs?: number;
  loginWindowMs?: number;
  loginMaxAttempts?: number;
};

type LoginAttempt = {
  count: number;
  resetAt: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function assertIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return value;
}

function qIdent(value: string): string {
  return `"${assertIdentifier(value)}"`;
}

function listTables(reader: Database): string[] {
  const rows = reader
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function getTableColumns(reader: Database, table: string): ColumnInfo[] {
  return reader.query(`PRAGMA table_info(${qIdent(table)})`).all() as ColumnInfo[];
}

function getPrimaryKeyColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
}

function buildWhereFromOriginal(columns: ColumnInfo[], original: Record<string, unknown>) {
  const pkCols = getPrimaryKeyColumns(columns);

  if (pkCols.length > 0 && pkCols.every((c) => Object.prototype.hasOwnProperty.call(original, c.name))) {
    const clauses: string[] = [];
    const params: SQLQueryBindings[] = [];
    for (const col of pkCols) {
      const value = original[col.name];
      if (value === null) {
        clauses.push(`${qIdent(col.name)} IS NULL`);
      } else {
        clauses.push(`${qIdent(col.name)} = ?`);
        params.push(value as SQLQueryBindings);
      }
    }
    return { clause: clauses.join(" AND "), params };
  }

  if (Object.prototype.hasOwnProperty.call(original, "__rowid")) {
    return { clause: "rowid = ?", params: [original.__rowid] };
  }

  throw new Error("Cannot identify row. Table has no usable PK and __rowid is missing.");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function plusTtlIso(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined
    ? ""
    : (typeof value === "object" ? JSON.stringify(value) : String(value));
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function extractClientIp(request: Request): string {
  const fwdFor = request.headers.get("x-forwarded-for");
  return fwdFor ? fwdFor.split(",")[0].trim() : "";
}

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1].trim();
  return token.length > 0 ? token : null;
}

async function requireAdminAuth(db: Database, request: Request, ttlMs: number): Promise<AdminSession | Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing bearer token" } }, 401);
  }

  const tokenHash = hashToken(token);
  const session = getAdminSession(db, tokenHash);
  if (!session) {
    return json({ ok: false, error: { code: "SESSION_EXPIRED", message: "Admin session expired" } }, 401);
  }

  if (!isGm(db, session.username)) {
    revokeAdminSession(db, tokenHash);
    return json({ ok: false, error: { code: "GM_ONLY", message: "GM privileges required" } }, 403);
  }

  const expiresAt = plusTtlIso(ttlMs);
  touchAdminSession(db, tokenHash, expiresAt);
  return { tokenHash, username: session.username, expiresAt };
}

export function createAdminApi(db: Database, cfg: AdminApiConfig): (request: Request, url: URL) => Promise<Response | null> {
  const sessionTtlMs = Math.max(60_000, cfg.sessionTtlMs ?? 8 * 60 * 60 * 1000);
  const loginWindowMs = Math.max(10_000, cfg.loginWindowMs ?? 5 * 60 * 1000);
  const loginMaxAttempts = Math.max(2, cfg.loginMaxAttempts ?? 8);
  const loginAttempts = new Map<string, LoginAttempt>();

  const usingMemoryDb = cfg.dbPath === ":memory:";

  const writer = usingMemoryDb ? db : new Database(cfg.dbPath, { create: true });
  writer.exec("PRAGMA journal_mode = WAL");
  writer.exec("PRAGMA busy_timeout = 1000");
  writer.exec("PRAGMA synchronous = NORMAL");

  const reader = usingMemoryDb ? db : new Database(cfg.dbPath, { readonly: true });
  reader.exec("PRAGMA busy_timeout = 1000");
  if (!usingMemoryDb) reader.exec("PRAGMA query_only = 1");

  // Cleanup loop for expired admin sessions + login rate-limit windows
  setInterval(() => {
    purgeExpiredAdminSessions(db);
    const now = Date.now();
    for (const [key, attempt] of loginAttempts) {
      if (attempt.resetAt <= now) loginAttempts.delete(key);
    }
  }, 10 * 60 * 1000);

  return async (request: Request, url: URL): Promise<Response | null> => {
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith("/api/admin/")) return null;

    if (method === "OPTIONS") {
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

    if (method === "POST" && path === "/api/admin/auth/login") {
      try {
        const body = (await request.json()) as { username?: string; password?: string };
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!username || !password) {
          return json({ ok: false, error: { code: "INVALID_BODY", message: "username and password are required" } }, 400);
        }

        const ip = extractClientIp(request) || "unknown";
        const attemptKey = `${ip}:${username.toLowerCase()}`;
        const now = Date.now();
        const currentAttempt = loginAttempts.get(attemptKey);
        if (currentAttempt && currentAttempt.resetAt > now && currentAttempt.count >= loginMaxAttempts) {
          const retryAfterSec = Math.max(1, Math.ceil((currentAttempt.resetAt - now) / 1000));
          return json({
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: `Too many login attempts. Try again in ${retryAfterSec}s.`,
            },
          }, 429);
        }

        const cred = db
          .prepare("SELECT password_hash FROM credentials WHERE name COLLATE NOCASE = ?")
          .get(username) as { password_hash: string } | null;

        if (!cred) {
          const base = currentAttempt && currentAttempt.resetAt > now
            ? currentAttempt
            : { count: 0, resetAt: now + loginWindowMs };
          loginAttempts.set(attemptKey, { count: base.count + 1, resetAt: base.resetAt });
          return json({ ok: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } }, 401);
        }

        const valid = await Bun.password.verify(password, cred.password_hash);
        if (!valid) {
          const base = currentAttempt && currentAttempt.resetAt > now
            ? currentAttempt
            : { count: 0, resetAt: now + loginWindowMs };
          loginAttempts.set(attemptKey, { count: base.count + 1, resetAt: base.resetAt });
          return json({ ok: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } }, 401);
        }

        if (!isGm(db, username)) {
          const base = currentAttempt && currentAttempt.resetAt > now
            ? currentAttempt
            : { count: 0, resetAt: now + loginWindowMs };
          loginAttempts.set(attemptKey, { count: base.count + 1, resetAt: base.resetAt });
          return json({ ok: false, error: { code: "GM_ONLY", message: "GM privileges required" } }, 403);
        }

        const token = `${crypto.randomUUID()}-${randomBytes(24).toString("hex")}`;
        const tokenHash = hashToken(token);
        const expiresAt = plusTtlIso(sessionTtlMs);
        createAdminSession(
          db,
          username,
          tokenHash,
          expiresAt,
          ip,
          request.headers.get("user-agent") ?? "",
        );

        loginAttempts.delete(attemptKey);
        appendLog(db, username, "admin-ui login", ip);

        return json({ ok: true, token, username, expires_at: expiresAt });
      } catch {
        return json({ ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } }, 400);
      }
    }

    // All other /api/admin routes require auth
    const adminAuth = await requireAdminAuth(db, request, sessionTtlMs);
    if (adminAuth instanceof Response) return adminAuth;

    if (method === "POST" && path === "/api/admin/auth/logout") {
      revokeAdminSession(db, adminAuth.tokenHash);
      appendLog(db, adminAuth.username, "admin-ui logout");
      return json({ ok: true });
    }

    if (method === "GET" && path === "/api/admin/auth/me") {
      return json({ ok: true, user: { username: adminAuth.username, expires_at: adminAuth.expiresAt } });
    }

    if (method === "GET" && path === "/api/admin/tables") {
      return json({ ok: true, tables: listTables(reader) });
    }

    const schemaMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/schema$/);
    if (method === "GET" && schemaMatch) {
      try {
        const table = decodeURIComponent(schemaMatch[1]);
        const columns = getTableColumns(reader, table);
        const foreignKeys = reader.query(`PRAGMA foreign_key_list(${qIdent(table)})`).all();
        const indexes = reader.query(`PRAGMA index_list(${qIdent(table)})`).all();
        return json({ ok: true, table, columns, foreignKeys, indexes });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const rowsMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/rows$/);
    if (method === "GET" && rowsMatch) {
      try {
        const table = decodeURIComponent(rowsMatch[1]);
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "100")));
        const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));
        const search = (url.searchParams.get("search") || "").trim();

        const columns = getTableColumns(reader, table);
        const cols = columns.map((c) => qIdent(c.name)).join(", ");

        const whereParts: string[] = [];
        const params: SQLQueryBindings[] = [];
        if (search) {
          const searchClauses = columns.map((c) => `CAST(${qIdent(c.name)} AS TEXT) LIKE ?`);
          whereParts.push(`(${searchClauses.join(" OR ")})`);
          for (let i = 0; i < columns.length; i++) params.push(`%${search}%`);
        }

        const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";
        const rows = reader
          .query(`SELECT rowid AS __rowid, ${cols} FROM ${qIdent(table)}${whereSql} LIMIT ? OFFSET ?`)
          .all(...params, limit, offset) as Array<Record<string, unknown>>;

        const totalRow = reader
          .query(`SELECT COUNT(*) as count FROM ${qIdent(table)}${whereSql}`)
          .get(...params) as { count: number } | null;

        return json({ ok: true, table, total: totalRow?.count ?? 0, rows });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const exportMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/export\.csv$/);
    if (method === "GET" && exportMatch) {
      try {
        const table = decodeURIComponent(exportMatch[1]);
        const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || "1000")));
        const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));
        const columns = getTableColumns(reader, table);
        const colNames = columns.map((c) => c.name);
        const cols = columns.map((c) => qIdent(c.name)).join(", ");
        const rows = reader
          .query(`SELECT ${cols} FROM ${qIdent(table)} LIMIT ? OFFSET ?`)
          .all(limit, offset) as Array<Record<string, unknown>>;

        const header = colNames.map(csvEscape).join(",");
        const body = rows
          .map((row) => colNames.map((name) => csvEscape(row[name])).join(","))
          .join("\n");
        const csv = `${header}\n${body}`;

        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${table}.csv"`,
          },
        });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const countMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/count$/);
    if (method === "GET" && countMatch) {
      try {
        const table = decodeURIComponent(countMatch[1]);
        const totalRow = reader.query(`SELECT COUNT(*) as count FROM ${qIdent(table)}`).get() as { count: number } | null;
        return json({ ok: true, table, total: totalRow?.count ?? 0 });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const insertMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/insert$/);
    if (method === "POST" && insertMatch) {
      try {
        const table = decodeURIComponent(insertMatch[1]);
        const body = (await request.json()) as { values?: Record<string, unknown> };
        const values = body.values || {};
        const columns = getTableColumns(reader, table);
        const allowed = new Set(columns.map((c) => c.name));
        const keys = Object.keys(values).filter((k) => allowed.has(k));

        if (keys.length === 0) {
          writer.query(`INSERT INTO ${qIdent(table)} DEFAULT VALUES`).run();
        } else {
          const keySql = keys.map((k) => qIdent(k)).join(", ");
          const qSql = keys.map(() => "?").join(", ");
          const params = keys.map((k) => values[k] as SQLQueryBindings);
          writer.query(`INSERT INTO ${qIdent(table)} (${keySql}) VALUES (${qSql})`).run(...params);
        }

        const inserted = writer.query("SELECT last_insert_rowid() as rowid").get() as { rowid: number } | null;
        return json({ ok: true, rowid: inserted?.rowid ?? null });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const updateMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/update$/);
    if (method === "POST" && updateMatch) {
      try {
        const table = decodeURIComponent(updateMatch[1]);
        const body = (await request.json()) as { original?: Record<string, unknown>; changes?: Record<string, unknown> };
        const original = body.original || {};
        const changes = body.changes || {};

        const columns = getTableColumns(reader, table);
        const allowed = new Set(columns.map((c) => c.name));
        const keys = Object.keys(changes).filter((k) => allowed.has(k));
        if (keys.length === 0) {
          return json({ ok: true, changed: 0 });
        }

        const setSql = keys.map((k) => `${qIdent(k)} = ?`).join(", ");
        const setParams = keys.map((k) => changes[k] as SQLQueryBindings);
        const where = buildWhereFromOriginal(columns, original);

        writer.query(`UPDATE ${qIdent(table)} SET ${setSql} WHERE ${where.clause}`).run(...setParams, ...where.params);
        const changed = writer.query("SELECT changes() as n").get() as { n: number } | null;
        return json({ ok: true, changed: changed?.n ?? 0 });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    const deleteMatch = path.match(/^\/api\/admin\/table\/([^/]+)\/delete$/);
    if (method === "POST" && deleteMatch) {
      try {
        const table = decodeURIComponent(deleteMatch[1]);
        const body = (await request.json()) as { original?: Record<string, unknown> };
        const original = body.original || {};
        const columns = getTableColumns(reader, table);
        const where = buildWhereFromOriginal(columns, original);
        writer.query(`DELETE FROM ${qIdent(table)} WHERE ${where.clause}`).run(...where.params);
        const changed = writer.query("SELECT changes() as n").get() as { n: number } | null;
        return json({ ok: true, changed: changed?.n ?? 0 });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    if (method === "POST" && path === "/api/admin/query") {
      try {
        const body = (await request.json()) as { sql?: string };
        const sql = (body.sql || "").trim();
        const normalized = sql.toUpperCase();
        const allowed = normalized.startsWith("SELECT") || normalized.startsWith("PRAGMA") || normalized.startsWith("EXPLAIN");
        if (!allowed) {
          return json({ ok: false, error: { code: "READ_ONLY_SQL", message: "Only SELECT / PRAGMA / EXPLAIN are allowed" } }, 400);
        }
        const rows = reader.query(sql).all();
        return json({ ok: true, rows, count: rows.length });
      } catch (e) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: String(e) } }, 400);
      }
    }

    return json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, 404);
  };
}
