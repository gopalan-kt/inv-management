#!/usr/bin/env node
// Demo helper: give every active item a random "Max Inventory Needed" (1–9)
// so the Stock-mode switch has real numbers to compute against.
// Re-runnable — each run re-randomizes. Usage: npm run seed-max

import { openDb } from '../src/db.js';

const MIN = 1;
const MAX = 9;

const db = openDb();
const items = db.prepare('SELECT id FROM items WHERE active = 1').all();
const update = db.prepare(
  "UPDATE items SET max_stock = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
);

db.transaction(() => {
  for (const item of items) {
    update.run(MIN + Math.floor(Math.random() * (MAX - MIN + 1)), item.id);
  }
})();

console.log(`Assigned random Max Inventory (${MIN}–${MAX}) to ${items.length} items.`);
