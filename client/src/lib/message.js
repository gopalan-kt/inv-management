// WhatsApp message generator — ported 1:1 from the legacy app (ex-code/script.js).
// Quirks that are intentional and locked by golden tests:
//   - order header is "Items Needed:" (colon) but received header is "Items Received" (no colon)
//   - separator after each category group is exactly 24 dashes (order mode only)
//   - quantity beats need-only when both are set
//   - a no-stock-only line renders nothing (it's a suffix, not content)
//   - no items → "No items selected."

export const SEPARATOR = '-'.repeat(24);

const noStockSuffix = (noStock) => (noStock ? ' (_No Stock_)' : '');

/**
 * @param {{ sectionName: string, mode: 'order'|'received',
 *           lines: Array<{itemName: string, categoryName: string, quantity: number,
 *                         needOnly: boolean, noStock: boolean}> }} params
 *        `lines` must already be in display order (category order, then item order).
 */
export function generateMessage({ sectionName, mode, lines }) {
  const parts = [`*${sectionName} Inventory*`];
  parts.push(mode === 'received' ? 'Items Received' : 'Items Needed:');
  parts.push('');

  if (mode === 'received') {
    // Flat list, no category headers, no separators (legacy behavior).
    for (const line of lines) {
      const suffix = noStockSuffix(line.noStock);
      if (line.quantity > 0) parts.push(`${line.itemName} - ${line.quantity}${suffix}`);
      else if (line.needOnly) parts.push(`Need ${line.itemName}${suffix}`);
    }
  } else {
    const groups = new Map(); // categoryName → text lines, insertion-ordered
    for (const line of lines) {
      const suffix = noStockSuffix(line.noStock);
      let text = null;
      if (line.quantity > 0) text = `${line.itemName} - ${line.quantity}${suffix}`;
      else if (line.needOnly) text = `Need ${line.itemName}${suffix}`;
      if (text === null) continue;
      if (!groups.has(line.categoryName)) groups.set(line.categoryName, []);
      groups.get(line.categoryName).push(text);
    }
    for (const [category, groupLines] of groups) {
      parts.push(`*${category}*`);
      parts.push(...groupLines);
      parts.push(SEPARATOR);
    }
  }

  if (parts.length === 3) return 'No items selected.';
  return parts.join('\n');
}
