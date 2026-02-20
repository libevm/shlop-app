import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";

const provider = new InMemoryDataProvider();
const { start } = createServer(provider, {
  port: 5200,
  debug: true,
  dbPath: "./data/maple.db",
});
const server = start();
console.log(`🍄 MapleWeb game server on http://localhost:${server.port}`);
console.log(`   Character API: /api/character/*`);
console.log(`   WebSocket:     ws://localhost:${server.port}/ws`);
console.log(`   Health:        /health`);
