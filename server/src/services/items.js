import { httpError } from '../errors.js';
import { getCategory } from './categories.js';

function getItem(db, orgId, itemId) {
  const item = db
    .prepare(
      `SELECT i.id, i.org_id, i.category_id, i.name, i.unit, i.max_stock, i.sort_order, i.active,
              c.section_id AS section_id
       FROM items i
       JOIN categories c ON c.id = i.category_id
       WHERE i.id = ? AND i.org_id = ?`
    )
    .get(itemId, orgId);
  if (!item) throw httpError(404, 'NOT_FOUND', 'Item not found');
  return item;
}

export function createItem(db, orgId, categoryId, { name, unit = null, maxStock = null }) {
  getCategory(db, orgId, categoryId);
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM items WHERE org_id = ? AND category_id = ?')
    .get(orgId, categoryId).max;
  const id = db
    .prepare('INSERT INTO items (org_id, category_id, name, unit, max_stock, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orgId, categoryId, name, unit, maxStock, max + 1).lastInsertRowid;
  return getItem(db, orgId, id);
}

export function updateItem(db, orgId, itemId, { name, unit, categoryId, sortOrder, maxStock }) {
  const item = getItem(db, orgId, itemId);

  if (categoryId !== undefined && categoryId !== item.category_id) {
    const target = getCategory(db, orgId, categoryId);
    // Items are section-scoped through their category — no cross-section moves.
    if (target.section_id !== item.section_id) {
      throw httpError(400, 'CROSS_SECTION_MOVE', 'Items can only move to a category in the same section');
    }
  }

  const sets = [];
  const args = [];
  if (name !== undefined) { sets.push('name = ?'); args.push(name); }
  if (unit !== undefined) { sets.push('unit = ?'); args.push(unit); }
  if (maxStock !== undefined) { sets.push('max_stock = ?'); args.push(maxStock); }
  if (categoryId !== undefined) { sets.push('category_id = ?'); args.push(categoryId); }
  if (sortOrder !== undefined) { sets.push('sort_order = ?'); args.push(sortOrder); }
  if (sets.length > 0) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    args.push(itemId, orgId);
    db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).run(...args);
  }
  return getItem(db, orgId, itemId);
}

export function deleteItem(db, orgId, itemId) {
  getItem(db, orgId, itemId);
  db.prepare("UPDATE items SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ?")
    .run(itemId, orgId);
}

export function reorderItems(db, orgId, categoryId, orderedIds) {
  getCategory(db, orgId, categoryId);
  const update = db.prepare("UPDATE items SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ? AND category_id = ?");
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, orgId, categoryId));
  })();
}
