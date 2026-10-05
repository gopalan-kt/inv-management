import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useDraft } from '../hooks/useDraft.js';
import { useToast } from '../components/Toast.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { ChevronDownIcon } from '../components/Icons.jsx';
import { USE_CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '../lib/appearance.js';

const MANUAL_MODE_KEY = 'sel_manual_mode_v1';
const COLLAPSE_KEY = 'sel_cat_expand_v1';

function loadExpandedCats() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')); }
  catch { return new Set(); }
}

function persistExpandedCats(set) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
}

export default function CountPage({ sectionId }) {
  const sid = Number(sectionId);
  const showToast = useToast();
  const [confirmSend, setConfirmSend] = useState(false);
  // Switch OFF = Stock Mode (the default way to count: enter what's on the
  // shelf, need is derived from Max). Switch ON = Manual Entry: type
  // quantities by hand. Each device remembers its own toggle.
  const [manualMode, setManualMode] = useState(() => localStorage.getItem(MANUAL_MODE_KEY) === '1');
  const stockMode = !manualMode;

  const changeManualMode = (on) => {
    setManualMode(on);
    try { localStorage.setItem(MANUAL_MODE_KEY, on ? '1' : '0'); } catch { /* private mode */ }
  };

  const catalogQuery = useQuery({
    queryKey: ['catalog', sid],
    queryFn: () => api(`/sections/${sid}/catalog`),
    enabled: sid > 0,
  });
  const receivableQuery = useQuery({
    queryKey: ['receivable', sid],
    queryFn: () => api(`/sections/${sid}/receivable`),
    enabled: sid > 0,
  });

  const { linesMap, tap, clearCategory, clearAll, buildDisplayLines, resetAfterSend, ensureDraft, isLoading } = useDraft(sid);

  // Collapsible categories: collapsed by default, remembered per category, and
  // auto-expanded once for categories that already have draft lines.
  const [expandedCats, setExpandedCats] = useState(loadExpandedCats);
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current || isLoading || !catalogQuery.data) return;
    autoExpandedRef.current = true;
    if (linesMap.size === 0) return;
    setExpandedCats((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const cat of catalogQuery.data.categories) {
        if (!next.has(cat.id) && cat.items.some((item) => linesMap.has(item.id))) {
          next.add(cat.id);
          changed = true;
        }
      }
      if (changed) persistExpandedCats(next);
      return changed ? next : prev;
    });
  }, [isLoading, catalogQuery.data]);

  const toggleCategory = (id) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpandedCats(next);
      return next;
    });
  };

  const sendMutation = useMutation({
    mutationFn: (orderId) => api(`/orders/${orderId}/send`, { method: 'POST' }),
    onSuccess: () => {
      showToast('Order sent to purchasing');
      resetAfterSend();
    },
    onError: (err) => showToast(err.message),
  });

  const doSend = async () => {
    try {
      // Force-sync current local state first: the debounced PUT from a
      // just-made tap may not have fired yet. Idempotent, so this is
      // always safe right before sending.
      const orderId = await ensureDraft();
      await api(`/orders/${orderId}/lines`, {
        method: 'PUT',
        body: {
          lines: buildDisplayLines(catalog).map((l) => ({
            itemId: l.itemId, quantity: l.quantity, needOnly: l.needOnly, noStock: l.noStock,
          })),
        },
      });
      await sendMutation.mutateAsync(orderId);
    } catch (err) {
      showToast(err.message);
    }
  };

  if (sid <= 0) return null;
  if (catalogQuery.isLoading || isLoading) return <p className="placeholder">Loading…</p>;
  if (catalogQuery.isError) return <p className="placeholder">Failed to load catalog: {catalogQuery.error.message}</p>;

  const catalog = catalogQuery.data;
  const lineCount = linesMap.size;
  const receiveCount = receivableQuery.data?.count ?? 0;

  return (
    <>
      <main className="inventory-container">
        {receiveCount > 0 && (
          <p style={{ textAlign: 'center', marginTop: 0 }}>
            <Link to="/to-receive" className="receive-pill">
              📦 {receiveCount} order{receiveCount > 1 ? 's' : ''} to receive
            </Link>
          </p>
        )}

        <div className="mode-row">
          <span className="mode-label">{manualMode ? 'Manual Entry' : 'Stock Mode'}</span>
          <button
            className="switch"
            role="switch"
            aria-checked={manualMode}
            aria-label="Toggle manual entry: when on, quantities are entered by hand instead of derived from Max"
            onClick={() => changeManualMode(!manualMode)}
          >
            <span className="knob" />
          </button>
        </div>

        {catalog.categories.length === 0 && (
          <div className="empty-state">
            No categories yet — add some in the <Link to="/catalog">Catalog</Link>.
          </div>
        )}

        {catalog.categories.map((cat) => (
          <CategoryGroup
            key={cat.id}
            category={cat}
            linesMap={linesMap}
            stockMode={stockMode}
            open={expandedCats.has(cat.id)}
            onToggle={() => toggleCategory(cat.id)}
            tap={tap}
            onClear={() => clearCategory(cat.items.map((i) => i.id))}
          />
        ))}

        {/* Actions live at the end of the list (not a fixed bar) so they never
            cover the sidebar's bottom controls. */}
        <div className="detail-actions">
          <div className="order-card-meta" style={{ textAlign: 'center' }}>
            {lineCount} item{lineCount === 1 ? '' : 's'} in the draft
          </div>
          <button className="btn btn-danger" disabled={lineCount === 0} onClick={clearAll}>
            Clear All
          </button>
          <button
            className="btn btn-primary"
            disabled={lineCount === 0}
            onClick={() => setConfirmSend(true)}
          >
            Send Order
          </button>
        </div>

        {confirmSend && (
          <ConfirmModal
            title="Send to Purchasing"
            message={`Send ${lineCount} item${lineCount === 1 ? '' : 's'} to purchasing?`}
            confirmLabel="Send Order"
            onConfirm={() => { setConfirmSend(false); doSend(); }}
            onClose={() => setConfirmSend(false)}
          />
        )}
      </main>
    </>
  );
}

// Category colors are controlled globally in lib/appearance.js (one switch for
// the whole app).

function CategoryGroup({ category, linesMap, stockMode, open, onToggle, tap, onClear }) {
  const hasItems = category.items.length > 0;
  const draftCount = category.items.filter((i) => linesMap.has(i.id)).length;

  return (
    <div className="category-group">
      <div
        className="category-header"
        style={USE_CATEGORY_COLORS ? { backgroundColor: category.color || DEFAULT_CATEGORY_COLOR } : undefined}
        onClick={hasItems ? onToggle : undefined}
        role={hasItems ? 'button' : undefined}
        aria-expanded={hasItems ? open : undefined}
      >
        {hasItems && (
          <span className={`cat-chevron${open ? ' open' : ''}`}>
            <ChevronDownIcon />
          </span>
        )}
        <span className="category-title">{category.name}</span>
        {draftCount > 0 && (
          <span className="cat-draft-chip" title="Items in the current draft">
            {draftCount}
          </span>
        )}
        <button className="clear-category-btn" onClick={(e) => { e.stopPropagation(); onClear(); }}>
          Clear
        </button>
      </div>

      {open && (
        <>
          <div className="stock-head">
            <span className="stock-head-spacer" />
            <span className="stock-head-spacer tick-slot" />
            <span className="stock-head-label in-stock">{stockMode ? 'In Stock' : 'To Order'}</span>
            {stockMode && <span className="stock-head-label to-order">To Order</span>}
            <span className="stock-head-spacer ns-slot" />
          </div>
          {category.items.map((item) => (
            <ItemRow
              key={item.id}
              item={{ ...item, categoryName: category.name }}
              line={linesMap.get(item.id)}
              stockMode={stockMode}
              tap={tap}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ItemRow({ item, line, stockMode, tap }) {
  const quantity = line?.quantity ?? 0;
  const needOnly = line?.needOnly ?? false;
  const noStock = line?.noStock ?? false;
  const isActive = quantity > 0 || needOnly;
  const hasMax = item.maxStock != null;

  // The stepper edits To Order directly in Manual mode; in Stock mode it edits
  // what you HAVE and To Order is derived (Max − Have). Everything else — tick,
  // no-stock, Max Inv. label, headings — is identical in both modes.
  const setHave = (have) => tap(item, (l) => ({
    ...l,
    currentCount: have,
    quantity: hasMax ? Math.max(0, item.maxStock - have) : l.quantity,
  }));
  const setQuantity = (q) => tap(item, (l) => ({ ...l, quantity: q }));

  const stepperValue = stockMode ? (line?.currentCount ?? 0) : quantity;
  const step = (v) => (stockMode ? setHave(Math.max(0, v)) : setQuantity(Math.max(0, v)));

  const have = line?.currentCount ?? 0;
  const prospective = hasMax ? Math.max(0, item.maxStock - have) : null;

  return (
    <div className="item-row">
      <div className={`item-name${isActive ? ' is-active' : ''}${noStock ? ' no-stock' : ''}`}>
        {item.name}
      </div>
      {hasMax && <span className="max-inv">Max Inv. {item.maxStock}</span>}
      <div className="item-controls">
        <button
          className={`check-btn${needOnly ? ' active' : ''}`}
          onClick={() => tap(item, (l) => ({ ...l, needOnly: !l.needOnly }))}
        >✓</button>
        <button className="qty-btn minus"
          onClick={() => step(stepperValue - 1)}>−</button>
        <span className="item-count">{stepperValue}</span>
        <button className="qty-btn plus"
          onClick={() => step(stepperValue + 1)}>+</button>
        {stockMode && (
          <span className={`need-chip${line ? '' : ' ghost'}`} title={hasMax ? `Max ${item.maxStock}` : 'No max set'}>
            {hasMax ? (line ? quantity : prospective) : '—'}
          </span>
        )}
        <button
          className={`nostock-btn${noStock ? ' active' : ''}`}
          onClick={() => tap(item, (l) => ({ ...l, noStock: !l.noStock }))}
        >−</button>
      </div>
    </div>
  );
}
