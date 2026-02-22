#!/usr/bin/env bun
/**
 * Create (or update) a GM account with password credentials.
 *
 * Usage:
 *   bun run create-gm <username> <password> [--db <path>]
 */
import { initDatabase, characterExists, createDefaultCharacter, setGm } from "./db.ts";

const args = process.argv.slice(2);
let name = "";
let password = "";
let dbPath = "./data/maple.db";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--db" && args[i + 1]) {
    dbPath = args[++i];
    continue;
  }
  if (!name) {
    name = args[i];
    continue;
  }
  if (!password) {
    password = args[i];
    continue;
  }
}

if (!name || !password) {
  console.error("Usage: bun run create-gm <username> <password> [--db <path>]");
  process.exit(1);
}

if (password.length < 4) {
  console.error("Password must be at least 4 characters.");
  process.exit(1);
}

if (name.length < 2 || name.length > 12 || !/^[a-zA-Z0-9 ]+$/.test(name)) {
  console.error("Username must be 2-12 chars and contain only letters, numbers, and spaces.");
  process.exit(1);
}

const db = initDatabase(dbPath);

let created = false;
if (!characterExists(db, name)) {
  createDefaultCharacter(db, crypto.randomUUID(), name, false);
  created = true;
}

const passwordHash = await Bun.password.hash(password, "bcrypt");
db.prepare(
  `INSERT INTO credentials (name, password_hash, claimed_at)
   VALUES (?, ?, datetime('now'))
   ON CONFLICT(name)
   DO UPDATE SET password_hash = excluded.password_hash`
).run(name, passwordHash);

setGm(db, name, true);

console.log(`${created ? "Created" : "Updated"} GM account: ${name}`);
console.log(`Database: ${dbPath}`);
