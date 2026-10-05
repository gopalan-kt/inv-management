#!/usr/bin/env node
// One-time seed: creates the dummy organization ("SEL") with a "Bar" section and
// imports the legacy catalog from ex-code/data.js (11 categories, 135 items).
//
// Usage:
//   npm run import [-- path/to/data.js] [--force]
//
// Idempotent: refuses to run if the org already exists (use --force to recreate the
// database from scratch — this DELETES the existing database file).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DB_PATH } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const DEFAULT_DATA_FILE = path.join(ROOT, 'ex-code', 'data.js');

// Categories import without colors — the app's grey default. Colors are meant
// to be set deliberately in the Catalog (the legacy per-category palette lives
// in ex-code/script.js if it's ever wanted back).

const ORG = { name: 'Sheesh Eatry & Longue', slug: 'sel' };
const DEFAULT_SECTION = 'Bar';

function parseLegacyData(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: data file not found: ${filePath}`);
    console.error('Usage: npm run import [-- path/to/data.js] [--force]');
    process.exit(1);
  }

  const src = fs.readFileSync(filePath, 'utf8');
  // data.js is `const inventoryData = <json>;` — the JSON body is valid after
  // stripping the assignment prefix and the trailing semicolon.
  const json = src.slice(src.indexOf('=') + 1).trim().replace(/;+\s*$/, '');

  let data;
  try {
    data = JSON.parse(json);
  } catch (err) {
    console.error(`Error: could not parse ${filePath} as JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.error(`Error: ${filePath} does not contain a non-empty category array`);
    process.exit(1);
  }
  return data;
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const fileArg = args.find((a) => !a.startsWith('--'));
const dataFile = fileArg ? path.resolve(fileArg) : DEFAULT_DATA_FILE;

if (force) {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = DB_PATH + suffix;
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`Deleted ${f}`);
    }
  }
}

const db = openDb();

const existing = db.prepare('SELECT id FROM organizations WHERE slug = ?').get(ORG.slug);
if (existing) {
  console.error(`Organization "${ORG.name}" (slug "${ORG.slug}") already exists.`);
  console.error('Nothing to do. Use --force to recreate the database from scratch.');
  process.exit(1);
}

const data = parseLegacyData(dataFile);

const importAll = db.transaction(() => {
  const orgId = db
    .prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)')
    .run(ORG.name, ORG.slug).lastInsertRowid;

  const sectionId = db
    .prepare('INSERT INTO sections (org_id, name, sort_order) VALUES (?, ?, 0)')
    .run(orgId, DEFAULT_SECTION).lastInsertRowid;

  const insertCategory = db.prepare(
    'INSERT INTO categories (org_id, section_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO items (org_id, category_id, name, sort_order) VALUES (?, ?, ?, ?)'
  );

  let itemCount = 0;
  data.forEach((cat, catIdx) => {
    const categoryId = insertCategory.run(
      orgId, sectionId, cat.category, null, catIdx
    ).lastInsertRowid;

    cat.items.forEach((item, itemIdx) => {
      insertItem.run(orgId, categoryId, item.name, itemIdx);
      itemCount += 1;
    });
  });

  return { orgId, sectionId, categories: data.length, itemCount };
});

const { categories, itemCount } = importAll();

console.log(`Imported into org "${ORG.name}":`);
console.log(`  section "${DEFAULT_SECTION}"`);
console.log(`  ${categories} categories, ${itemCount} items`);
console.log(`Database: ${DB_PATH}`);
