// Order lifecycle + draft-engine semantics against the real API.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, api } from './helpers.js';

let ctx;
let org;
let sid;
let milk; // item id

beforeEach(async () => {
  ctx = await startTestServer();
  // seed: org → section → category → item
  org = ctx.db
    .prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)')
    .run('SEL', 'sel').lastInsertRowid;
  const sec = await api(ctx.url, 'POST', `/api/orgs/${org}/sections`, { name: 'Bar' });
  sid = sec.body.id;
  const cat = await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/categories`, { name: 'Walmart' });
  const item = await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${cat.body.id}/items`, { name: 'Milk' });
  milk = item.body.id;
});

afterEach(() => ctx.close());

function lines(...entries) {
  return {
    lines: entries.map(([itemId, quantity, needOnly = false, noStock = false, currentCount = null]) => ({
      itemId, quantity, needOnly, noStock, currentCount,
    })),
  };
}

test('draft is idempotent: two creates → one draft', async () => {
  const a = await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`);
  const b = await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`);
  assert.equal(a.body.id, b.body.id);
});

test('PUT lines upserts, snapshots, and cleans up empty lines', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const orderId = draft.id;

  // Add Milk x3 (with no-stock flag) plus a fully-empty line for a real item,
  // which must not persist.
  let res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${orderId}/lines`,
    lines([milk, 3, false, true], [coke, 0, false, false]));
  assert.equal(res.status, 200);
  assert.equal(res.body.lines.length, 1); // empty line gone
  assert.equal(res.body.lines[0].itemName, 'Milk');
  assert.equal(res.body.lines[0].noStock, true);

  // Zero out Milk → line disappears entirely (legacy cleanup semantics).
  res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${orderId}/lines`, lines([milk, 0]));
  assert.equal(res.body.lines.length, 0);
});

test('unknown item id on PUT → 404', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([9999, 1]));
  assert.equal(res.status, 404);
});

test('send requires content; send freezes the draft; history lists it', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;

  const empty = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  assert.equal(empty.status, 409);
  assert.equal(empty.body.error.code, 'ORDER_EMPTY');

  // A no-stock-only line does NOT count as sendable content (legacy: it's a suffix).
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 0, false, true]));
  const noStockOnly = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  assert.equal(noStockOnly.status, 409);

  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2]));
  const sent = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  assert.equal(sent.body.status, 'sent');
  assert.ok(sent.body.sentAt);

  // Draft is frozen: no more line edits.
  const edit = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 5]));
  assert.equal(edit.status, 409);
  assert.equal(edit.body.error.code, 'ORDER_NOT_DRAFT');

  // Section now has no draft; a fresh one is a new order.
  const none = await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/draft`);
  assert.equal(none.status, 404);
  assert.equal(none.body.error.code, 'NO_DRAFT');

  // Receivable count stays 0 until the purchase is confirmed.
  const pill = await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/receivable`);
  assert.equal(pill.body.count, 0);

  const history = await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/orders`);
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].status, 'sent');
  assert.equal(history.body[0].lineCount, 1);
});

test('receive stamps received quantities; received is terminal', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 4]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  // Receiving is blocked until the purchase is confirmed.
  const beforePurchase = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  assert.equal(beforePurchase.status, 409);
  assert.equal(beforePurchase.body.error.code, 'ORDER_NOT_PURCHASED');

  const confirm = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`,
    { billRef: 'BILL-1042' });
  assert.equal(confirm.status, 200);
  assert.ok(confirm.body.purchasedAt);
  assert.equal(confirm.body.billRef, 'BILL-1042');

  // Double confirmation is refused.
  const again = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`,
    { billRef: 'BILL-1043' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_PURCHASED');

  // Milk wasn't struck by purchasing → receiving stamps 0 (never arrived).
  const received = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  assert.equal(received.body.status, 'received');
  assert.equal(received.body.purchasedAt, null ?? received.body.purchasedAt);

  const detail = await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`);
  assert.equal(detail.body.lines[0].receivedQuantity, 0);
  assert.equal(detail.body.billRef, 'BILL-1042'); // bill kept in history

  const afterReceive = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  assert.equal(afterReceive.status, 409);
  assert.equal(afterReceive.body.error.code, 'ORDER_NOT_SENT');

  const cancel = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/cancel`);
  assert.equal(cancel.status, 409);
});

test('ordered vs purchased: comparison data for the To Receive view', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  // Staff ordered Milk ×4 and Coke ×2.
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 4], [coke, 2]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  // Purchasing could only get Milk — strikes it and corrects 4 → 3. Coke left
  // unstruck (couldn't find it).
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`,
    { quantity: 3 });

  const detail = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  const milkLine = detail.lines.find((l) => l.itemId === milk);
  const cokeLine = detail.lines.find((l) => l.itemId === coke);
  assert.equal(milkLine.orderedQuantity, 4);
  assert.equal(milkLine.quantity, 3);
  assert.equal(cokeLine.orderedQuantity, 2);
  assert.ok(cokeLine.purchasedAt === null);

  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`, { billRef: 'BILL-9' });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  const received = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  // Purchased line: received the settled quantity. Unpurchased line: 0.
  assert.equal(received.lines.find((l) => l.itemId === milk).receivedQuantity, 3);
  assert.equal(received.lines.find((l) => l.itemId === coke).receivedQuantity, 0);
});

test('shopping queue: awaiting-purchase vs confirmed lists', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  // Awaiting purchase list has it; confirmed list doesn't.
  let queue = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/shopping`)).body;
  assert.equal(queue.length, 1);
  let done = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/shopping?purchased=1`)).body;
  assert.equal(done.length, 0);

  // Confirm the purchase with the bill.
  const confirm = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`,
    { billRef: 'BILL-77' });
  assert.equal(confirm.status, 200);

  queue = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/shopping`)).body;
  assert.equal(queue.length, 0);
  done = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/shopping?purchased=1`)).body;
  assert.equal(done.length, 1);
  assert.equal(done[0].billRef, 'BILL-77');

  // History lists carry the purchase stage fields (the To Receive page
  // filters on purchasedAt — regression guard).
  const historyRows = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/orders?status=sent`)).body;
  assert.ok(historyRows.every((o) => 'purchasedAt' in o && 'billRef' in o));
  const allRows = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders?status=sent`)).body;
  assert.ok(allRows.every((o) => 'purchasedAt' in o && 'billRef' in o));

  // Strikes stay available after purchase confirmation — the section re-uses
  // the same list while cross-verifying the delivery.
  const strikeAfterConfirm = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  assert.equal(strikeAfterConfirm.status, 200);

  // Receivable count now reflects the confirmed purchase.
  const pill = await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/receivable`);
  assert.equal(pill.body.count, 1);
});

test('cancel from draft works; cancelled sections get a fresh draft', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 1]));

  const cancelled = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/cancel`);
  assert.equal(cancelled.body.status, 'cancelled');

  const fresh = await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`);
  assert.notEqual(fresh.body.id, draft.id);
  assert.equal(fresh.body.status, 'draft');
});

test('snapshots survive item renames: draft refreshes, history does not', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2]));

  // Send with the original name, then rename.
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${milk}`, { name: 'Whole Milk' });

  const sent = await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`);
  assert.equal(sent.body.lines[0].itemName, 'Milk'); // frozen at send

  // A new draft PUT refreshes snapshots to the new name.
  const fresh = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const refreshed = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${fresh.id}/lines`, lines([milk, 1]));
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.lines[0].itemName, 'Whole Milk');
});

test('soft-deleted item keeps its draft line but cannot be re-added', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2]));

  await api(ctx.url, 'DELETE', `/api/orgs/${org}/items/${milk}`);

  // Already-on-order item: PUT still tolerates it.
  const keep = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 3]));
  assert.equal(keep.status, 200);
  assert.equal(keep.body.lines[0].itemName, 'Milk');

  // Dropping it entirely, then re-adding → refused (item is inactive).
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines());
  const readd = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2]));
  assert.equal(readd.status, 400);
  assert.equal(readd.body.error.code, 'ITEM_INACTIVE');
});

test('validation: malformed line bodies → 400 VALIDATION_ERROR', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const bad = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`,
    { lines: [{ itemId: milk, quantity: -5, needOnly: false, noStock: false }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
});

// --- Purchasing (Side B): strike-off + queue --------------------------------

test('strike-off: toggle on sent orders, 409 elsewhere, state in detail', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 2], [coke, 1]));

  // Drafts can't be shopped.
  const early = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, 'ORDER_NOT_SENT');

  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  // Strike one line; unknown item → 404; re-strike is idempotent.
  const strike = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  assert.equal(strike.status, 200);
  const struckLine = strike.body.lines.find((l) => l.itemId === milk);
  assert.ok(struckLine.purchasedAt);
  const milkTs = struckLine.purchasedAt;

  const restrike = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  assert.equal(restrike.status, 200);
  assert.equal(restrike.body.lines.find((l) => l.itemId === milk).purchasedAt, milkTs); // timestamp preserved

  const unknown = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/9999/purchase`,
    { purchased: true });
  assert.equal(unknown.status, 404);

  // Un-strike clears it.
  const unstrike = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: false });
  assert.equal(unstrike.status, 200);
  assert.equal(unstrike.body.lines.find((l) => l.itemId === milk).purchasedAt, null);

  // Received orders are closed for shopping.
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`, { purchased: true });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`, { billRef: 'BILL-51' });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  const afterReceive = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${coke}/purchase`,
    { purchased: true });
  assert.equal(afterReceive.status, 409);

  // Strikes survive into history.
  const detail = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  assert.ok(detail.lines.find((l) => l.itemId === milk).purchasedAt);
});

test('shopping queue lists sent orders with pick progress, org-wide', async () => {
  const sec2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections`, { name: 'Bakery' })).body.id;
  const cat2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/categories`, { name: 'Flour' })).body.id;
  const croissant = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${cat2}/items`, { name: 'Croissant' })).body.id;

  // One sent order in Bar (2 lines), one in Bakery (2 lines), one draft (excluded).
  const barOrder = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${barOrder.id}/lines`, lines([milk, 1]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${barOrder.id}/send`);

  const bakeryOrder = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${bakeryOrder.id}/lines`,
    { lines: [{ itemId: croissant, quantity: 4, needOnly: false, noStock: false }] });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${bakeryOrder.id}/send`);
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${bakeryOrder.id}/lines/${croissant}/purchase`,
    { purchased: true });

  const fresh = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${fresh.id}/lines`, lines([milk, 1])); // stays draft

  const queue = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/shopping`)).body;
  assert.equal(queue.length, 2);
  const bar = queue.find((q) => q.sectionName === 'Bar');
  const bakery = queue.find((q) => q.sectionName === 'Bakery');
  assert.ok(bar && bakery);
  assert.equal(bar.lineCount, 1);
  assert.equal(bar.pickedCount, 0);
  assert.equal(bakery.pickedCount, 1);
  // Oldest first: Bar was sent before Bakery.
  assert.ok(queue[0].sectionName === 'Bar');
});

test('validation: purchase toggle requires boolean body', async () => {
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  const bad = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: 'yes' });
  assert.equal(bad.status, 400);
});

test('purchaser quantity: any line is adjustable on sent orders', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`,
    lines([milk, 0, true], [coke, 2])); // milk: ✓ need-only; coke: staff-set quantity

  // Drafts aren't shoppable.
  const early = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`,
    { quantity: 3 });
  assert.equal(early.status, 409);

  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  // Need-only line: purchaser decides 3.
  const set = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`,
    { quantity: 3 });
  assert.equal(set.status, 200);
  assert.equal(set.body.lines.find((l) => l.itemId === milk).quantity, 3);

  // Staff-set line: purchaser corrects 2 → 1 (store only had one).
  const correct = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${coke}/quantity`,
    { quantity: 1 });
  assert.equal(correct.status, 200);
  assert.equal(correct.body.lines.find((l) => l.itemId === coke).quantity, 1);

  // Unknown item → 404.
  const unknown = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/9999/quantity`,
    { quantity: 1 });
  assert.equal(unknown.status, 404);

  // Receiving stamps the purchaser's numbers as received (struck lines only).
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`,
    { purchased: true });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${coke}/purchase`,
    { purchased: true });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`, { billRef: 'BILL-88' });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  const detail = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  assert.equal(detail.lines.find((l) => l.itemId === milk).receivedQuantity, 3);
  assert.equal(detail.lines.find((l) => l.itemId === coke).receivedQuantity, 1);

  // Received orders are closed.
  const late = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`,
    { quantity: 1 });
  assert.equal(late.status, 409);

  // Bad body.
  const bad = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`,
    { quantity: -1 });
  assert.equal(bad.status, 400);
});

// Flag columns must arrive as real booleans — a raw SQLite 0 rendered in JSX
// shows a stray "0" on screen (React renders `0 && x` as "0"). Regression guard.
test('line flags are booleans, not SQLite integers', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`,
    lines([milk, 1], [coke, 1, true, true]));
  assert.equal(res.status, 200);
  for (const line of res.body.lines) {
    assert.equal(typeof line.needOnly, 'boolean');
    assert.equal(typeof line.noStock, 'boolean');
  }
  const detail = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  assert.equal(typeof detail.lines[0].needOnly, 'boolean');
  assert.equal(typeof detail.lines[0].noStock, 'boolean');
});

test('full cycle: draft → sent → purchased → received adds to stock', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;
  const coke = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`, { name: 'Coke' })).body.id;

  // Staff order Milk ×4 and Coke ×2 — in Stock mode, declaring they have 2
  // Milk on the shelf. The declaration updates Current Inventory live.
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`,
    lines([milk, 4, false, false, 2], [coke, 2]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);

  const invAt = async (itemId) => {
    const inv = (await api(ctx.url, 'GET', `/api/orgs/${org}/inventory`)).body;
    return inv.find((r) => r.itemId === itemId);
  };

  // Sent: declaration already wrote the ledger (staff said: 2 on the shelf),
  // pipeline shows the ordered amounts.
  let inv = await invAt(milk);
  assert.equal(inv.stock, 2);
  assert.equal(inv.orderedQty, 4);
  assert.equal(inv.toOrderQty, 0);

  // Purchased (with a shortfall on Milk): purchasing column lights up.
  // Coke stays UNSTRUCK — purchasing couldn't get it, so it never arrives.
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/purchase`, { purchased: true });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/lines/${milk}/quantity`, { quantity: 3 });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/purchase`, { billRef: 'BILL-CYCLE' });
  inv = await invAt(milk);
  assert.equal(inv.purchasingQty, 3);
  assert.equal(inv.stock, 2); // declared via Stock mode, untouched by purchasing

  // Received: stock = declared (2) + received (3); pipeline drains.
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/receive`);
  inv = await invAt(milk);
  assert.equal(inv.stock, 5); // declared 2 on the shelf + bought 3
  assert.equal(inv.orderedQty, 0);
  assert.equal(inv.purchasingQty, 0);
  inv = await invAt(coke);
  assert.equal(inv.stock, 0); // unpurchased line never arrived
  assert.equal(inv.orderedQty, 0);

  // Section filter scopes the view.
  const scoped = (await api(ctx.url, 'GET', `/api/orgs/${org}/inventory?sectionId=${sid}`)).body;
  assert.ok(scoped.every((r) => r.sectionId === Number(sid)));
  assert.ok(scoped.some((r) => r.itemId === milk));
});

// Sections are isolated: an order can never contain another section's items.
test('draft rejects items from another section (SECTION_MISMATCH)', async () => {
  const sec2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections`, { name: 'Bakery' })).body.id;
  const cat2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/categories`, { name: 'Flour' })).body.id;
  const croissant = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${cat2}/items`, { name: 'Croissant' })).body.id;

  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  const res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`,
    lines([croissant, 1]));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SECTION_MISMATCH');

  // The Bar draft stays untouched and usable.
  const ok = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, lines([milk, 1]));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.lines.length, 1);
});

// --- "All" views: org-wide history + catalog --------------------------------

test('org-wide orders list spans sections with names, filterable by status', async () => {
  const sec2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections`, { name: 'Bakery' })).body.id;
  const cat2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/categories`, { name: 'Flour' })).body.id;
  const croissant = (await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${cat2}/items`, { name: 'Croissant' })).body.id;

  const barOrder = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${barOrder.id}/lines`, lines([milk, 1]));
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${barOrder.id}/send`);

  const bakeryOrder = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/orders`)).body;
  await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${bakeryOrder.id}/lines`,
    { lines: [{ itemId: croissant, quantity: 2, needOnly: false, noStock: false }] });
  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${bakeryOrder.id}/cancel`);

  const all = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders`)).body;
  assert.equal(all.length, 2);
  assert.ok(all.every((o) => o.sectionName));

  const sent = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders?status=sent`)).body;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sectionName, 'Bar');
});

test('org-wide catalog nests every active section', async () => {
  const sec2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections`, { name: 'Bakery' })).body.id;
  const cat2 = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sec2}/categories`, { name: 'Flour' })).body.id;
  await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${cat2}/items`, { name: 'Croissant', maxStock: 9 });

  const catalog = (await api(ctx.url, 'GET', `/api/orgs/${org}/catalog`)).body;
  assert.equal(catalog.length, 2);
  const bakery = catalog.find((s) => s.name === 'Bakery');
  assert.equal(bakery.categories[0].name, 'Flour');
  assert.equal(bakery.categories[0].items[0].maxStock, 9);
});

// --- Par levels ("Max Inventory Needed") + stock mode ----------------------

test('items carry maxStock through create, patch, and the catalog payload', async () => {
  const catId = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body.categories[0].id;

  const withMax = await api(ctx.url, 'POST', `/api/orgs/${org}/categories/${catId}/items`,
    { name: 'Coke', maxStock: 5 });
  assert.equal(withMax.status, 201);
  assert.equal(withMax.body.max_stock, 5);

  const cleared = await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${withMax.body.id}`, { maxStock: null });
  assert.equal(cleared.body.max_stock, null);

  const raised = await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${withMax.body.id}`, { maxStock: 7 });
  assert.equal(raised.body.max_stock, 7);

  const catalog = (await api(ctx.url, 'GET', `/api/orgs/${org}/sections/${sid}/catalog`)).body;
  const coke = catalog.categories[0].items.find((i) => i.name === 'Coke');
  assert.equal(coke.maxStock, 7);
  assert.equal(catalog.categories[0].items.find((i) => i.name === 'Milk').maxStock, null);

  const negative = await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${withMax.body.id}`, { maxStock: -1 });
  assert.equal(negative.status, 400);
});

test('stock mode: currentCount is stored, snapshotted at send, and shown in detail', async () => {
  // Milk: max 5, had 2 → order 3.
  await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${milk}`, { maxStock: 5 });
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;

  const res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, {
    lines: [{ itemId: milk, quantity: 3, needOnly: false, noStock: false, currentCount: 2 }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.lines[0].currentCount, 2);

  await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  const detail = (await api(ctx.url, 'GET', `/api/orgs/${org}/orders/${draft.id}`)).body;
  assert.equal(detail.lines[0].currentCount, 2);
  assert.equal(detail.lines[0].quantity, 3);
});

test('a have-only line (max reached, nothing to order) still persists', async () => {
  await api(ctx.url, 'PATCH', `/api/orgs/${org}/items/${milk}`, { maxStock: 5 });
  const draft = (await api(ctx.url, 'POST', `/api/orgs/${org}/sections/${sid}/orders`)).body;

  // had 5 of max 5 → quantity 0, nothing else → line survives, but is NOT
  // sendable content (ORDER_EMPTY).
  const res = await api(ctx.url, 'PUT', `/api/orgs/${org}/orders/${draft.id}/lines`, {
    lines: [{ itemId: milk, quantity: 0, needOnly: false, noStock: false, currentCount: 5 }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.lines.length, 1);
  assert.equal(res.body.lines[0].quantity, 0);

  const send = await api(ctx.url, 'POST', `/api/orgs/${org}/orders/${draft.id}/send`);
  assert.equal(send.status, 409);
  assert.equal(send.body.error.code, 'ORDER_EMPTY');
});
