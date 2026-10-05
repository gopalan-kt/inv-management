import { groupByCategory } from '../lib/group.js';

function ShoppingLine({ line, onToggle, onBumpQuantity }) {
  const struck = !!line.purchasedAt;
  return (
    <div
      className={`shop-line${struck ? ' picked' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      title={struck ? 'Tap to un-strike' : 'Tap when this is in your cart'}
    >
      <span className="shop-check">{struck ? '✓' : ''}</span>
      <span className="shop-name">
        {line.itemName}
        {line.noStock && <span className="order-card-meta"> (no stock)</span>}
        {line.currentCount != null && line.currentCount > 0 && (
          <span className="order-card-meta"> (had {line.currentCount})</span>
        )}
      </span>
      <span
        className="shop-stepper"
        onClick={(e) => e.stopPropagation()}
        title="Adjust the quantity you actually bought"
      >
        <button className="shop-qty-btn" onClick={() => onBumpQuantity(-1)}>−</button>
        <span className="shop-qty-num">{line.quantity > 0 ? line.quantity : '–'}</span>
        <button className="shop-qty-btn" onClick={() => onBumpQuantity(1)}>+</button>
      </span>
    </div>
  );
}

/** The interactive shopping notepad: strike-off bullets + quantity steppers,
 *  grouped by snapshot category. Shared by the Shopping Cart cards and the
 *  order detail page — the exact same list everywhere. */
export default function ShoppingNotepad({ order, onTogglePicked, onBumpQuantity }) {
  const groups = groupByCategory(order.lines);

  return (
    <div className="detail-lines">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="detail-category">{g.name}</div>
          {g.lines.map((line) => (
            <ShoppingLine
              key={line.itemId}
              line={line}
              onToggle={() => onTogglePicked(line)}
              onBumpQuantity={(delta) => onBumpQuantity(line, delta)}
            />
          ))}
          {g.lines.length === 0 && <div className="detail-line">—</div>}
        </div>
      ))}
      {order.lines.length === 0 && <div className="empty-state">No items on this order.</div>}
    </div>
  );
}
