import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const host = process.env.CLIENT_WEB_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.CLIENT_WEB_PORT ?? "5173");

const repoRoot = normalize(join(import.meta.dir, "..", ".."));
const webRoot = join(repoRoot, "client", "web");
const resourcesRoot = join(repoRoot, "resources");

function getContentType(path) {
  const ext = extname(path).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function safeJoin(base, relativePath) {
  const resolved = normalize(join(base, relativePath));
  if (!resolved.startsWith(base)) {
    throw new Error("Unsafe path");
  }
  return resolved;
}

function serveFile(path) {
  if (!existsSync(path)) {
    return new Response("Not found", { status: 404 });
  }

  const body = readFileSync(path);
  return new Response(body, {
    headers: {
      "content-type": getContentType(path),
      "cache-control": "no-store",
    },
  });
}

function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return serveFile(join(webRoot, "index.html"));
  }

  if (url.pathname.startsWith("/resources/")) {
    const relativePath = url.pathname.slice("/resources/".length);
    return serveFile(safeJoin(resourcesRoot, relativePath));
  }

  const relativePath = url.pathname.slice(1);
  return serveFile(safeJoin(webRoot, relativePath));
}

function startServer(startPort, attempts = 10) {
  let port = startPort;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return Bun.serve({
        hostname: host,
        port,
        fetch(request) {
          try {
            return handleRequest(request);
          } catch {
            return new Response("Bad request", { status: 400 });
          }
        },
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error);

      if (code === "EADDRINUSE" || message.includes("EADDRINUSE")) {
        port += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Unable to bind client web server after ${attempts} attempts.`);
}

const server = startServer(requestedPort);
console.log(`🕹️  Client web server running at http://${host}:${server.port}`);
console.log("Default map route: /?mapId=100020000");
