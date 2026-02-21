#!/usr/bin/env bun
/**
 * Toggle GM flag for a character.
 * Usage: bun run make-gm <username>
 */
import { initDatabase, isGm, setGm, characterExists } from "./db.ts";

const name = process.argv[2];
if (!name) {
  console.error("Usage: bun run make-gm <username>");
  process.exit(1);
}

const db = initDatabase("./data/maple.db");

if (!characterExists(db, name)) {
  console.error(`Character '${name}' not found.`);
  process.exit(1);
}

const wasGm = isGm(db, name);
setGm(db, name, !wasGm);
console.log(`${name}: GM ${wasGm ? "revoked" : "granted"}`);
