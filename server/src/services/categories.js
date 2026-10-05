import { httpError } from '../errors.js';
import { getSection } from './sections.js';

export function getCategory(db, orgId, categoryId) {
  const category = db
    .prepare('SELECT id, org_id, section_id, name, color, sort_order, active FROM categories WHERE id = ? AND org_id = ?')
    .get(categoryId, orgId);
  if (!category) throw httpError(404, 'NOT_FOUND', 'Category not found');
  return category;
}

export function listCategories(db, orgId, sectionId, { includeInactive = false } = {}) {
  getSection(db, orgId, sectionId);
  return db
    .prepare(
      `SELECT id, name, color, sort_order, active
       FROM categories
       WHERE org_id = ? AND section_id = ? AND (active = 1 OR ?)
       ORDER BY sort_order, id`
    )
    .all(orgId, sectionId, includeInactive ? 1 : 0);
}

export function createCategory(db, orgId, sectionId, { name, color = null }) {
  getSection(db, orgId, sectionId);
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM categories WHERE org_id = ? AND section_id = ?')
    .get(orgId, sectionId).max;
  const id = db
    .prepare('INSERT INTO categories (org_id, section_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(orgId, sectionId, name, color, max + 1).lastInsertRowid;
  return getCategory(db, orgId, id);
}

export function updateCategory(db, orgId, categoryId, { name, color, sortOrder }) {
  getCategory(db, orgId, categoryId);
  const sets = [];
  const args = [];
  if (name !== undefined) { sets.push('name = ?'); args.push(name); }
  if (color !== undefined) { sets.push('color = ?'); args.push(color); }
  if (sortOrder !== undefined) { sets.push('sort_order = ?'); args.push(sortOrder); }
  if (sets.length > 0) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    args.push(categoryId, orgId);
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`).run(...args);
  }
  return getCategory(db, orgId, categoryId);
}

export function deleteCategory(db, orgId, categoryId) {
  getCategory(db, orgId, categoryId);
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM items WHERE org_id = ? AND category_id = ? AND active = 1')
    .get(orgId, categoryId);
  if (n > 0) {
    throw httpError(409, 'CATEGORY_HAS_ITEMS', `This category still has ${n} item(s) — move or delete them first`, {
      details: { itemCount: n },
    });
  }
  db.prepare("UPDATE categories SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ?")
    .run(categoryId, orgId);
}

export function reorderCategories(db, orgId, sectionId, orderedIds) {
  getSection(db, orgId, sectionId);
  const update = db.prepare("UPDATE categories SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ? AND section_id = ?");
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, orgId, sectionId));
  })();
}
