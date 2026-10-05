import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useSectionFilter } from '../hooks/useSectionFilter.jsx';

/** Current Inventory: what's on hand per item across the filtered scope —
 *  All Sections by default, or one section via the sidebar dropdown. */
export default function InventoryPage() {
  const { filter } = useSectionFilter();
  const sectionId = filter === 'all' ? null : Number(filter);

  const inventoryQuery = useQuery({
    queryKey: ['inventory', filter],
    queryFn: () => api(`/inventory${sectionId ? `?sectionId=${sectionId}` : ''}`),
  });

  const rows = inventoryQuery.data ?? [];

  // Group by section, then category.
  const blocks = [];
  for (const row of rows) {
    let s = blocks.find((b) => b.title === row.sectionName);
    if (!s) { s = { title: row.sectionName, categories: [] }; blocks.push(s); }
    let c = s.categories.find((x) => x.name === row.categoryName);
    if (!c) { c = { name: row.categoryName, rows: [] }; s.categories.push(c); }
    c.rows.push(row);
  }

  return (
    <main className="page">
      <h2 className="page-title">Current Inventory</h2>

      <div className="inv-table">
        <div className="inv-row inv-head">
          <span className="inv-name">Item</span>
          <span className="inv-col-label">In Stock</span>
        </div>

        {inventoryQuery.isLoading && <p className="placeholder" style={{ padding: 16 }}>Loading…</p>}

        {blocks.map((block) => (
          <div key={block.title}>
            <div className="inv-section">{block.title}</div>
            {block.categories.map((cat) => (
              <div key={cat.name}>
                <div className="inv-category">{cat.name}</div>
                {cat.rows.map((row) => (
                  <div className="inv-row" key={row.itemId}>
                    <span className="inv-name">{row.itemName}</span>
                    <span className={`inv-num stock${row.stock > 0 ? ' hot' : ''}`}>{row.stock}</span>
                  </div>
                ))}
                {cat.rows.length === 0 && <div className="empty-state">No items.</div>}
              </div>
            ))}
          </div>
        ))}

        {rows.length === 0 && !inventoryQuery.isLoading && (
          <div className="empty-state">No items to show.</div>
        )}
      </div>
    </main>
  );
}
