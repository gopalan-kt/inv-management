import { httpError } from '../errors.js';
import { getSection } from './sections.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// ---------------------------------------------------------------------------
// Reads

function getOrder(db, orgId, orderId) {
  const order = db
    .prepare(
      `SELECT o.*, s.name AS section_name
       FROM orders o
       JOIN sections s ON s.id = o.section_id
       WHERE o.id = ? AND o.org_id = ?`
    )
    .get(orderId, orgId);
  if (!order) throw httpError(404, 'NOT_FOUND', 'Order not found');
  return order;
}

function getLines(db, orderId) {
  // History renders in snapshot order — frozen at send time, so it never changes.
  // Flag columns leave SQLite as integers; coerce to real booleans here so no
  // consumer ever renders a raw 0 (React renders `0 && x` as "0").
  return db
    .prepare(
      `SELECT id, item_id AS itemId, item_name AS itemName, item_unit AS itemUnit,
              category_name AS categoryName, quantity, ordered_quantity AS orderedQuantity,
              need_only, no_stock,
              current_count AS currentCount, received_quantity AS receivedQuantity,
              purchased_at AS purchasedAt
       FROM order_items
       WHERE order_id = ?
       ORDER BY category_sort, item_sort, id`
    )
    .all(orderId)
    .map(({ need_only, no_stock, ...row }) => ({
      ...row,
      needOnly: !!need_only,
      noStock: !!no_stock,
    }));
}

function serialize(order) {
  return {
    id: order.id,
    sectionId: order.section_id,
    sectionName: order.section_name,
    status: order.status,
    createdAt: order.created_at,
    sentAt: order.sent_at,
    purchasedAt: order.purchased_at,
    billRef: order.bill_ref,
    receivedAt: order.received_at,
    cancelledAt: order.cancelled_at,
  };
}

/** The section's current draft, or null. Route turns null into 404 NO_DRAFT. */
export function findDraft(db, orgId, sectionId) {
  const order = db
    .prepare("SELECT * FROM orders WHERE org_id = ? AND section_id = ? AND status = 'draft'")
    .get(orgId, sectionId);
  return order ? { ...serialize(order), lines: getLines(db, order.id) } : null;
}

/**
 * Orders awaiting delivery confirmation: the purchase is confirmed
 * (purchased_at set) but the section hasn't received yet. This is what the
 * count screen's "N to receive" pill counts.
 */
export function countAwaitingReceive(db, orgId, sectionId) {
  getSection(db, orgId, sectionId);
  return db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE org_id = ? AND section_id = ? AND status = 'sent' AND purchased_at IS NOT NULL")
    .get(orgId, sectionId).n;
}

export function getOrderWithLines(db, orgId, orderId) {
  const order = getOrder(db, orgId, orderId);
  return { ...serialize(order), lines: getLines(db, order.id) };
}

export function listOrdersForSection(db, orgId, sectionId, { status, limit = 50 } = {}) {
  getSection(db, orgId, sectionId);
  const filters = ['org_id = ?', 'section_id = ?'];
  const args = [orgId, sectionId];
  if (status) {
    filters.push('status = ?');
    args.push(status);
  }
  args.push(limit);
  const rows = db
    .prepare(
      `SELECT o.id, o.section_id AS sectionId, o.status, o.created_at AS createdAt,
              o.sent_at AS sentAt, o.purchased_at AS purchasedAt, o.bill_ref AS billRef,
              o.received_at AS receivedAt, o.cancelled_at AS cancelledAt,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS lineCount,
              (SELECT COUNT(*) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.purchased_at IS NOT NULL) AS pickedCount
       FROM orders o
       WHERE ${filters.join(' AND ')}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`
    )
    .all(...args);
  return rows;
}

/** Org-wide history — the "All" view. Every order, newest first, with its section. */
export function listOrdersOrgWide(db, orgId, { status, limit = 100 } = {}) {
  const filters = ['o.org_id = ?'];
  const args = [orgId];
  if (status) {
    filters.push('o.status = ?');
    args.push(status);
  }
  args.push(limit);
  return db
    .prepare(
      `SELECT o.id, o.section_id AS sectionId, s.name AS sectionName, o.status,
              o.created_at AS createdAt, o.sent_at AS sentAt,
              o.purchased_at AS purchasedAt, o.bill_ref AS billRef,
              o.received_at AS receivedAt, o.cancelled_at AS cancelledAt,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS lineCount,
              (SELECT COUNT(*) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.purchased_at IS NOT NULL) AS pickedCount
       FROM orders o
       JOIN sections s ON s.id = o.section_id
       WHERE ${filters.join(' AND ')}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`
    )
    .all(...args);
}

// ---------------------------------------------------------------------------
// Draft lifecycle

/**
 * Idempotently ensure a draft exists for the section. Returns the draft.
 * Safe under concurrency: the partial unique index (one draft per section) plus
 * ON CONFLICT DO NOTHING plus a re-select.
 */
export function ensureDraft(db, orgId, sectionId) {
  getSection(db, orgId, sectionId);
  db.prepare(
    `INSERT INTO orders (org_id, section_id) VALUES (?, ?)
     ON CONFLICT (section_id) WHERE status = 'draft' DO NOTHING`
  ).run(orgId, sectionId);
  return findDraft(db, orgId, sectionId);
}

/**
 * Replace the draft's full line state (the one write endpoint for the count
 * screen). Upserts incoming lines with refreshed snapshots, deletes lines that
 * dropped out, and deletes fully-empty lines — mirroring the legacy behavior
 * where zeroed items leave the list. All in one transaction.
 */
export function putLines(db, orgId, orderId, lines) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'draft') {
    throw httpError(409, 'ORDER_NOT_DRAFT', 'Only draft orders can be edited');
  }

  const resolveItem = db.prepare(
    `SELECT i.id, i.name, i.unit, i.active, i.sort_order AS itemSort,
            c.name AS categoryName, c.sort_order AS categorySort,
            c.section_id AS itemSectionId
     FROM items i
     JOIN categories c ON c.id = i.category_id
     WHERE i.id = ? AND i.org_id = ?`
  );
  const existingItemIds = new Set(
    db.prepare('SELECT item_id FROM order_items WHERE order_id = ?').all(orderId).map((r) => r.item_id)
  );

  // Every referenced item must belong to this org, be active, and belong to
  // the ORDER'S OWN SECTION — an order can never mix sections. (Exception:
  // items already on this order survive soft-deletion mid-draft; the line and
  // its snapshot persist.)
  const resolved = lines.map((line) => {
    const item = resolveItem.get(line.itemId, orgId);
    if (!item) throw httpError(404, 'NOT_FOUND', `Item ${line.itemId} not found`);
    if (item.itemSectionId !== order.section_id) {
      throw httpError(409, 'SECTION_MISMATCH', `Item "${item.name}" belongs to another section — each order contains its own section's items`);
    }
    if (!item.active && !existingItemIds.has(line.itemId)) {
      throw httpError(400, 'ITEM_INACTIVE', `Item ${line.itemId} is no longer available`);
    }
    return item;
  });

  const upsert = db.prepare(
    `INSERT INTO order_items (org_id, order_id, item_id, item_name, item_unit, category_name,
                              item_sort, category_sort, quantity, need_only, no_stock,
                              current_count, ordered_quantity, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})
     ON CONFLICT (order_id, item_id) DO UPDATE SET
       item_name = excluded.item_name,
       item_unit = excluded.item_unit,
       category_name = excluded.category_name,
       item_sort = excluded.item_sort,
       category_sort = excluded.category_sort,
       quantity = excluded.quantity,
       ordered_quantity = excluded.ordered_quantity,
       need_only = excluded.need_only,
       no_stock = excluded.no_stock,
       current_count = excluded.current_count,
       updated_at = excluded.updated_at`
  );

  db.transaction(() => {
    resolved.forEach((item, i) => {
      const line = lines[i];
      upsert.run(
        orgId, orderId, item.id, item.name, item.unit, item.categoryName,
        item.itemSort, item.categorySort,
        line.quantity, line.needOnly ? 1 : 0, line.noStock ? 1 : 0,
        line.currentCount ?? null,
        line.quantity // ordered_quantity snapshot — the section's original ask
      );
    });

    // Stock-mode declarations ("we have N on the shelf") update the ledger
    // live — the count screen doubles as a stocktake. Receiving then adds on
    // top, so In Stock always reflects the last declared truth + deliveries.
    const declareStock = db.prepare(
      `UPDATE items SET stock = ?, updated_at = ${NOW} WHERE id = ? AND org_id = ?`
    );
    resolved.forEach((item, i) => {
      const line = lines[i];
      if (line.currentCount != null) declareStock.run(line.currentCount, item.id, orgId);
    });

    const keepIds = lines.map((l) => l.itemId);
    if (keepIds.length === 0) {
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
    } else {
      const placeholders = keepIds.map(() => '?').join(', ');
      db.prepare(`DELETE FROM order_items WHERE order_id = ? AND item_id NOT IN (${placeholders})`)
        .run(orderId, ...keepIds);
    }

    // Empty lines don't exist — same as the legacy app deleting zeroed keys.
    // A line carrying only a stock-mode entry (current_count) still counts as
    // existing: it's data the user entered, even if nothing needs ordering.
    db.prepare(
      `DELETE FROM order_items
       WHERE order_id = ?
         AND quantity = 0 AND need_only = 0 AND no_stock = 0
         AND (current_count IS NULL OR current_count = 0)`
    ).run(orderId);

    db.prepare(`UPDATE orders SET updated_at = ${NOW} WHERE id = ? AND org_id = ?`).run(orderId, orgId);
  })();

  return { ...serialize(getOrder(db, orgId, orderId)), lines: getLines(db, orderId) };
}

function transition(db, orgId, orderId, from, to, timestampColumn) {
  const order = getOrder(db, orgId, orderId);
  if (!from.includes(order.status)) {
    const expected = from.join(' or ');
    throw httpError(409, `ORDER_NOT_${expected.toUpperCase().replace(/ /g, '_')}`,
      `Only ${expected} orders can be marked ${to}`);
  }
  db.prepare(
    `UPDATE orders SET status = ?, ${timestampColumn} = ${NOW}, updated_at = ${NOW}
     WHERE id = ? AND org_id = ?`
  ).run(to, orderId, orgId);
  return getOrder(db, orgId, orderId);
}

export function sendOrder(db, orgId, orderId) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'draft') {
    throw httpError(409, 'ORDER_NOT_DRAFT', 'Only draft orders can be sent');
  }
  const hasContent = db
    .prepare('SELECT 1 FROM order_items WHERE order_id = ? AND (quantity > 0 OR need_only = 1) LIMIT 1')
    .get(orderId);
  if (!hasContent) {
    throw httpError(409, 'ORDER_EMPTY', 'The order has nothing to send');
  }
  return serialize(transition(db, orgId, orderId, ['draft'], 'sent', 'sent_at'));
}

export function receiveOrder(db, orgId, orderId) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'sent') {
    throw httpError(409, 'ORDER_NOT_SENT', 'Only sent orders can be marked received');
  }
  if (!order.purchased_at) {
    throw httpError(409, 'ORDER_NOT_PURCHASED', 'Confirm the purchase (with the bill) before marking received');
  }
  // Received counts only apply to lines that were actually purchased — an
  // unpurchased line never arrived, so it stamps as 0.
  db.prepare(
    `UPDATE order_items
     SET received_quantity = CASE WHEN purchased_at IS NOT NULL THEN quantity ELSE 0 END
     WHERE order_id = ?`
  ).run(orderId);
  // The cycle closes: received goods add to the section's stock.
  db.prepare(
    `UPDATE items
     SET stock = stock + (
       SELECT COALESCE(oi.received_quantity, 0)
       FROM order_items oi
       WHERE oi.order_id = ? AND oi.item_id = items.id
     )
     WHERE org_id = ?
       AND id IN (SELECT item_id FROM order_items WHERE order_id = ? AND received_quantity > 0)`
  ).run(orderId, orgId, orderId);
  transition(db, orgId, orderId, ['sent'], 'received', 'received_at');
  return getOrderWithLines(db, orgId, orderId);
}

/**
 * Purchase staff confirm the buy: strike progress freezes, the bill/receipt
 * reference is recorded, and the order moves to the section's "to receive"
 * queue. One-way: a confirmed purchase is only undone by cancelling.
 */
export function confirmPurchase(db, orgId, orderId, { billRef = null } = {}) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'sent') {
    throw httpError(409, 'ORDER_NOT_SENT', 'Only sent orders can be confirmed as purchased');
  }
  if (order.purchased_at) {
    throw httpError(409, 'ALREADY_PURCHASED', 'This purchase is already confirmed');
  }
  db.prepare(
    `UPDATE orders SET purchased_at = ${NOW}, bill_ref = ?, updated_at = ${NOW} WHERE id = ? AND org_id = ?`
  ).run(billRef, orderId, orgId);
  return serialize(getOrder(db, orgId, orderId));
}

export function cancelOrder(db, orgId, orderId) {
  return serialize(transition(db, orgId, orderId, ['draft', 'sent'], 'cancelled', 'cancelled_at'));
}

// ---------------------------------------------------------------------------
// Purchasing (Side B)

/**
 * Strike-off state for the notepad. The SAME list is struck by whoever is
 * working it: purchase staff while buying, the section while cross-verifying
 * the delivery. Only requires status 'sent' — strikes freeze on receive.
 */
export function setLinePurchased(db, orgId, orderId, itemId, purchased) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'sent') {
    throw httpError(409, 'ORDER_NOT_SENT', 'Only sent orders can be shopped');
  }

  let result;
  if (purchased) {
    // Idempotent: striking an already-struck line keeps the original timestamp.
    result = db.prepare(
      `UPDATE order_items
       SET purchased_at = ${NOW}, updated_at = ${NOW}
       WHERE order_id = ? AND item_id = ? AND purchased_at IS NULL`
    ).run(orderId, itemId);
  } else {
    result = db.prepare(
      `UPDATE order_items
       SET purchased_at = NULL, updated_at = ${NOW}
       WHERE order_id = ? AND item_id = ? AND purchased_at IS NOT NULL`
    ).run(orderId, itemId);
  }

  if (result.changes === 0) {
    // Either the item isn't on this order, or the state was already as asked —
    // distinguish so real misses 404 instead of silently doing nothing.
    const known = db.prepare(
      'SELECT 1 FROM order_items WHERE order_id = ? AND item_id = ?'
    ).get(orderId, itemId);
    if (!known) throw httpError(404, 'NOT_FOUND', 'Item is not on this order');
  }

  return getOrderWithLines(db, orgId, orderId);
}

/**
 * Purchase staff adjust a line's quantity while shopping — either finalizing a
 * need-marked line (the quantity was their call) or correcting a staff-entered
 * number to what the store actually had/they actually bought. Only requires
 * status 'sent'; freezes on receive.
 */
export function setLineQuantity(db, orgId, orderId, itemId, quantity) {
  const order = getOrder(db, orgId, orderId);
  if (order.status !== 'sent') {
    throw httpError(409, 'ORDER_NOT_SENT', 'Quantities can only be set while the order is being shopped');
  }
  const known = db
    .prepare('SELECT 1 FROM order_items WHERE order_id = ? AND item_id = ?')
    .get(orderId, itemId);
  if (!known) throw httpError(404, 'NOT_FOUND', 'Item is not on this order');
  db.prepare(
    `UPDATE order_items SET quantity = ?, updated_at = ${NOW} WHERE order_id = ? AND item_id = ?`
  ).run(quantity, orderId, itemId);
  return getOrderWithLines(db, orgId, orderId);
}

/** The purchasing queue: every sent order in the org, oldest first. */
export function listShopping(db, orgId, { purchased = false } = {}) {
  return db
    .prepare(
      `SELECT o.id, o.section_id AS sectionId, s.name AS sectionName,
              o.created_at AS createdAt, o.sent_at AS sentAt,
              o.purchased_at AS purchasedAt, o.bill_ref AS billRef,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS lineCount,
              (SELECT COUNT(*) FROM order_items oi
               WHERE oi.order_id = o.id AND oi.purchased_at IS NOT NULL) AS pickedCount
       FROM orders o
       JOIN sections s ON s.id = o.section_id
       WHERE o.org_id = ? AND o.status = 'sent' AND o.purchased_at IS ${purchased ? 'NOT NULL' : 'NULL'}
       ORDER BY o.${purchased ? 'purchased_at' : 'sent_at'} ASC, o.id ASC`
    )
    .all(orgId);
}
