/**
 * Current Inventory: per-item stock plus the live pipeline quantities
 * (draft → sent → purchased) so the whole cycle is visible at a glance.
 * Optionally scoped to one section; otherwise the org-wide "All" view.
 */
export function currentInventory(db, orgId, sectionId = null) {
  const aggFilter = sectionId ? 'AND o.section_id = ?' : '';
  const aggArgs = sectionId ? [orgId, sectionId] : [orgId];
  const itemFilter = sectionId ? 'AND c.section_id = ?' : '';
  const itemArgs = sectionId ? [orgId, sectionId] : [orgId];

  return db
    .prepare(
      `WITH agg AS (
         SELECT oi.item_id,
                SUM(CASE WHEN o.status = 'draft' THEN oi.quantity ELSE 0 END) AS draftQty,
                SUM(CASE WHEN o.status = 'sent' THEN oi.quantity ELSE 0 END) AS sentQty,
                SUM(CASE WHEN o.status = 'sent' AND o.purchased_at IS NOT NULL THEN oi.quantity ELSE 0 END) AS purchasedQty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.org_id = ? ${aggFilter}
         GROUP BY oi.item_id
       )
       SELECT i.id AS itemId, i.name AS itemName, i.stock, c.name AS categoryName,
              s.name AS sectionName, s.id AS sectionId,
              COALESCE(agg.draftQty, 0) AS toOrderQty,
              COALESCE(agg.sentQty, 0) AS orderedQty,
              COALESCE(agg.purchasedQty, 0) AS purchasingQty
       FROM items i
       JOIN categories c ON c.id = i.category_id
       JOIN sections s ON s.id = c.section_id
       LEFT JOIN agg ON agg.item_id = i.id
       WHERE i.org_id = ? AND i.active = 1 ${itemFilter}
       ORDER BY s.sort_order, c.sort_order, i.sort_order, i.id`
    )
    .all(...aggArgs, ...itemArgs);
}
