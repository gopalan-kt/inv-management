import { httpError } from '../errors.js';

export function getSection(db, orgId, sectionId) {
  const section = db
    .prepare('SELECT id, org_id, name, sort_order, active FROM sections WHERE id = ? AND org_id = ?')
    .get(sectionId, orgId);
  if (!section) throw httpError(404, 'NOT_FOUND', 'Section not found');
  return section;
}

export function listSections(db, orgId, { includeInactive = false } = {}) {
  return db
    .prepare(
      `SELECT id, name, sort_order, active
       FROM sections
       WHERE org_id = ? AND (active = 1 OR ?)
       ORDER BY sort_order, id`
    )
    .all(orgId, includeInactive ? 1 : 0);
}

export function createSection(db, orgId, { name }) {
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM sections WHERE org_id = ?')
    .get(orgId).max;
  const id = db
    .prepare('INSERT INTO sections (org_id, name, sort_order) VALUES (?, ?, ?)')
    .run(orgId, name, max + 1).lastInsertRowid;
  return getSection(db, orgId, id);
}

export function updateSection(db, orgId, sectionId, { name, sortOrder }) {
  getSection(db, orgId, sectionId);
  if (name !== undefined) {
    db.prepare('UPDATE sections SET name = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ? AND org_id = ?')
      .run(name, sectionId, orgId);
  }
  if (sortOrder !== undefined) {
    db.prepare('UPDATE sections SET sort_order = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ? AND org_id = ?')
      .run(sortOrder, sectionId, orgId);
  }
  return getSection(db, orgId, sectionId);
}

export function deleteSection(db, orgId, sectionId) {
  getSection(db, orgId, sectionId);
  const draft = db
    .prepare("SELECT 1 FROM orders WHERE org_id = ? AND section_id = ? AND status = 'draft'")
    .get(orgId, sectionId);
  if (draft) {
    throw httpError(409, 'SECTION_HAS_DRAFT', 'This section has a draft order — send or cancel it first');
  }
  db.prepare("UPDATE sections SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ?")
    .run(sectionId, orgId);
}

export function reorderSections(db, orgId, orderedIds) {
  const update = db.prepare("UPDATE sections SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND org_id = ?");
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id, orgId));
  })();
}

/** The count-screen payload: active categories with their active items, one request. */
export function getCatalog(db, orgId, sectionId) {
  const section = getSection(db, orgId, sectionId);
  const categories = db
    .prepare(
      `SELECT id, name, color
       FROM categories
       WHERE org_id = ? AND section_id = ? AND active = 1
       ORDER BY sort_order, id`
    )
    .all(orgId, sectionId);
  const items = db
    .prepare(
      `SELECT id, category_id, name, unit, max_stock AS maxStock
       FROM items
       WHERE org_id = ? AND active = 1
       ORDER BY sort_order, id`
    )
    .all(orgId);

  const byCategory = new Map(categories.map((cat) => [cat.id, { ...cat, items: [] }]));
  for (const item of items) {
    byCategory.get(item.category_id)?.items.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      maxStock: item.maxStock,
    });
  }
  return { id: section.id, name: section.name, categories: [...byCategory.values()] };
}

/** Org-wide catalog — the "All" view. Every active section with its catalog nested. */
export function orgCatalog(db, orgId) {
  const sections = db
    .prepare('SELECT id, name FROM sections WHERE org_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(orgId);
  const categories = db
    .prepare('SELECT id, section_id, name, color FROM categories WHERE org_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(orgId);
  const items = db
    .prepare('SELECT id, category_id, name, unit, max_stock AS maxStock FROM items WHERE org_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(orgId);

  const catsBySection = new Map();
  const itemsByCategory = new Map();
  for (const cat of categories) {
    const entry = { id: cat.id, name: cat.name, color: cat.color, items: [] };
    const list = catsBySection.get(cat.section_id) ?? [];
    list.push(entry);
    catsBySection.set(cat.section_id, list);
    itemsByCategory.set(cat.id, entry.items);
  }
  for (const item of items) {
    itemsByCategory.get(item.category_id)?.push({
      id: item.id, name: item.name, unit: item.unit, maxStock: item.maxStock,
    });
  }

  return sections.map((s) => ({ id: s.id, name: s.name, categories: catsBySection.get(s.id) ?? [] }));
}
