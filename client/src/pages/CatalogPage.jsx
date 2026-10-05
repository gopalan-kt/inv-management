import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import PromptModal from '../components/PromptModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { useSections } from '../components/AppShell.jsx';
import { USE_CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '../lib/appearance.js';

// The legacy per-category palette, offered as swatches when coloring categories.
const SWATCHES = [
  '#B8E6FE', '#C6D2FF', '#BEDBFF', '#FFC9C9', '#D8F999', '#96F7E4',
  '#FFF085', '#FCCEE8', '#FFCCD3', '#FE9A37', '#D6D3D1',
];

// Standalone catalog (/catalog) remembers its own section selection — it is
// deliberately independent of the sidebar's section switcher.
const CATALOG_SECTION_KEY = 'sel_catalog_section_v1';

export default function CatalogPage() {
  const { sectionId } = useParams();
  const sid = Number(sectionId) || null;
  const location = useLocation();
  const allMode = location.pathname.startsWith('/all');
  const standalone = location.pathname === '/catalog';
  const queryClient = useQueryClient();
  const showToast = useToast();

  const sections = useSections();
  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(CATALOG_SECTION_KEY));
      return Number.isInteger(stored) && stored > 0 ? stored : null;
    } catch { return null; }
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [modal, setModal] = useState(null); // { type, ... }

  // "All" context: read-only browse of every section's catalog. Editing stays
  // per-section — pick one in the switcher. (Rendered after all hooks below.)
  const orgCatalogQuery = useQuery({
    queryKey: ['catalog', 'all'],
    queryFn: () => api('/catalog'),
    enabled: allMode,
  });

  useEffect(() => {
    if (standalone) return; // the URL has no say in standalone mode
    if (sid && sections.data?.some((s) => s.id === sid)) setSelectedSectionId(sid);
  }, [sid, sections.data, standalone]);

  // Standalone: drop a stored selection that no longer exists.
  useEffect(() => {
    if (standalone && selectedSectionId && sections.data?.length
      && !sections.data.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(sections.data[0].id);
    }
  }, [standalone, selectedSectionId, sections.data]);

  useEffect(() => {
    if (standalone && selectedSectionId) {
      try { localStorage.setItem(CATALOG_SECTION_KEY, String(selectedSectionId)); } catch { /* private mode */ }
    }
  }, [standalone, selectedSectionId]);

  // Default selections once data lands.
  useEffect(() => {
    if (!selectedSectionId && sections.data?.length) setSelectedSectionId(sections.data[0].id);
  }, [sections.data, selectedSectionId]);

  const activeSectionId = selectedSectionId ?? sid ?? sections.data?.[0]?.id ?? null;

  const categoriesQuery = useQuery({
    queryKey: ['categories', activeSectionId],
    queryFn: () => api(`/sections/${activeSectionId}/categories`),
    enabled: activeSectionId > 0,
  });

  useEffect(() => {
    if (!selectedCategoryId && categoriesQuery.data?.length) setSelectedCategoryId(categoriesQuery.data[0].id);
  }, [categoriesQuery.data, selectedCategoryId]);

  // Items for the selected category come from the catalog endpoint of the
  // selected section (nested payload), so the manager shares the count screen's
  // cache.
  const catalogQuery = useQuery({
    queryKey: ['catalog', activeSectionId],
    queryFn: () => api(`/sections/${activeSectionId}/catalog`),
    enabled: activeSectionId > 0,
  });

  const onError = (err) => showToast(err.message);
  const after = (...keys) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));

  const sectionMut = {
    create: useMutation({
      mutationFn: (name) => api('/sections', { method: 'POST', body: { name } }),
      onSuccess: (s) => { setSelectedSectionId(s.id); setSelectedCategoryId(null); after(['sections']); showToast('Section added'); },
      onError,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }) => api(`/sections/${id}`, { method: 'PATCH', body: { name } }),
      onSuccess: () => after(['sections', 'catalog']),
      onError,
    }),
    remove: useMutation({
      mutationFn: (id) => api(`/sections/${id}`, { method: 'DELETE' }),
      onSuccess: () => {
        setSelectedSectionId(null); setSelectedCategoryId(null);
        after(['sections', 'catalog', 'categories']);
        showToast('Section removed');
      },
      onError,
    }),
  };

  const categoryMut = {
    create: useMutation({
      mutationFn: ({ name, color }) => api(`/sections/${activeSectionId}/categories`, { method: 'POST', body: { name, color } }),
      onSuccess: () => { after(['catalog', activeSectionId], ['categories', activeSectionId]); showToast('Category added'); },
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, name, color }) => api(`/categories/${id}`, { method: 'PATCH', body: { name, color } }),
      onSuccess: () => after(['catalog', activeSectionId], ['categories', activeSectionId]),
      onError,
    }),
    remove: useMutation({
      mutationFn: (id) => api(`/categories/${id}`, { method: 'DELETE' }),
      onSuccess: () => { setSelectedCategoryId(null); after(['catalog', activeSectionId], ['categories', activeSectionId]); showToast('Category removed'); },
      onError,
    }),
  };

  const itemMut = {
    create: useMutation({
      mutationFn: ({ categoryId, name, maxStock }) => api(`/categories/${categoryId}/items`, { method: 'POST', body: { name, maxStock } }),
      onSuccess: () => after(['catalog', activeSectionId]),
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, name, maxStock }) => api(`/items/${id}`, { method: 'PATCH', body: { name, maxStock } }),
      onSuccess: () => after(['catalog', activeSectionId]),
      onError,
    }),
    remove: useMutation({
      mutationFn: (id) => api(`/items/${id}`, { method: 'DELETE' }),
      onSuccess: () => after(['catalog', activeSectionId]),
      onError,
    }),
  };

  if (sections.isLoading) return <p className="placeholder">Loading…</p>;

  if (allMode) {
    return <AllCatalogView query={orgCatalogQuery} />;
  }

  const sectionList = sections.data ?? [];
  const section = sectionList.find((s) => s.id === activeSectionId);
  const categories = categoriesQuery.data ?? [];
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const items = catalogQuery.data?.categories.find((c) => c.id === selectedCategoryId)?.items ?? [];

  return (
    <main className="page">
      <h2 className="page-title">Catalog</h2>

      <div className="catalog-sections-row">
        {sectionList.map((s) => (
          <button
            key={s.id}
            className={`section-pill${s.id === activeSectionId ? ' active' : ''}`}
            onClick={() => { setSelectedSectionId(s.id); setSelectedCategoryId(null); }}
          >
            {s.name}
          </button>
        ))}
        <button className="add-pill" onClick={() => setModal({ type: 'section-new' })}>＋ Section</button>
        {section && (
          <>
            <button className="icon-btn" title="Rename section"
              onClick={() => setModal({ type: 'section-rename', section })}>✎</button>
            <button className="icon-btn delete-btn" title="Remove section"
              onClick={() => setModal({ type: 'section-remove', section })}>🗑</button>
          </>
        )}
      </div>

      {!section && (
        <div className="empty-state">Create your first section above (e.g. “Bar”, “Bakery”).</div>
      )}

      {section && (
        <div className="catalog-panes">
          <section>
            <div className="pane-title-row">
              <h3>Categories in {section.name}</h3>
              <button className="add-pill" onClick={() => setModal({ type: 'category-new' })}>＋ Add</button>
            </div>
            {categories.length === 0 && <div className="empty-state">No categories yet.</div>}
            <div className="pane-list">
              {categories.map((cat) => (
                <div key={cat.id} className={`pane-row${cat.id === selectedCategoryId ? ' selected' : ''}`}>
                  <span className="color-dot" style={{ background: cat.color || '#EBF5FF' }} />
                  <button
                    className="pane-label"
                    style={{ all: 'unset', cursor: 'pointer', flex: 1 }}
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    {cat.name}
                  </button>
                  <button className="icon-btn" title="Edit"
                    onClick={() => setModal({ type: 'category-edit', category: cat })}>✎</button>
                  <button className="icon-btn delete-btn" title="Remove"
                    onClick={() => setModal({ type: 'category-remove', category: cat })}>🗑</button>
                </div>
              ))}
            </div>
          </section>

          {selectedCategory && (
            <section>
              <div className="pane-title-row">
                <h3>Items in {selectedCategory.name}</h3>
                <button className="add-pill" onClick={() => setModal({ type: 'item-new' })}>＋ Add</button>
              </div>
              {items.length === 0 && <div className="empty-state">No items yet.</div>}
              <div className="pane-list">
                {items.map((item) => (
                  <div key={item.id} className="pane-row">
                    <span className="pane-label">{item.name}</span>
                    {item.maxStock != null && <span className="mini-chip" title="Max inventory needed">Max {item.maxStock}</span>}
                    <button className="icon-btn" title="Rename"
                      onClick={() => setModal({ type: 'item-edit', item })}>✎</button>
                    <button className="icon-btn delete-btn" title="Remove"
                      onClick={() => setModal({ type: 'item-remove', item })}>🗑</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {modal?.type === 'section-new' && (
        <PromptModal
          title="New Section" label="Section name" confirmLabel="Create"
          onConfirm={(name) => { sectionMut.create.mutate(name); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'section-rename' && (
        <PromptModal
          title="Rename Section" label="Section name" initialName={modal.section.name}
          onConfirm={(name) => { sectionMut.rename.mutate({ id: modal.section.id, name }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'category-new' && (
        <PromptModal
          title="New Category" label="Category name" swatches={SWATCHES} confirmLabel="Create"
          onConfirm={(name, color) => { categoryMut.create.mutate({ name, color }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'category-edit' && (
        <PromptModal
          title="Edit Category" label="Category name" initialName={modal.category.name}
          swatches={SWATCHES} initialColor={modal.category.color}
          onConfirm={(name, color) => { categoryMut.update.mutate({ id: modal.category.id, name, color }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'item-new' && (
        <PromptModal
          title={`New Item in ${selectedCategory.name}`} label="Item name" confirmLabel="Create"
          numberField="Max inventory needed (optional)" initialNumber={null}
          onConfirm={(name, _color, maxStock) => { itemMut.create.mutate({ categoryId: selectedCategory.id, name, maxStock }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'item-edit' && (
        <PromptModal
          title="Edit Item" label="Item name" initialName={modal.item.name}
          numberField="Max inventory needed (optional)" initialNumber={modal.item.maxStock}
          onConfirm={(name, _color, maxStock) => { itemMut.update.mutate({ id: modal.item.id, name, maxStock }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'section-remove' && (
        <ConfirmModal
          title="Remove Section"
          message={<>Remove section <b>{modal.section.name}</b>? Its categories stay hidden but order history is kept.</>}
          confirmLabel="Remove" danger
          onConfirm={() => { sectionMut.remove.mutate(modal.section.id); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'category-remove' && (
        <ConfirmModal
          title="Remove Category"
          message={<>Remove category <b>{modal.category.name}</b>? It will be hidden; items must be moved or removed first.</>}
          confirmLabel="Remove" danger
          onConfirm={() => { categoryMut.remove.mutate(modal.category.id); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'item-remove' && (
        <ConfirmModal
          title="Remove Item"
          message={<>Remove <b>{modal.item.name}</b>? Existing orders keep their history.</>}
          confirmLabel="Remove" danger
          onConfirm={() => { itemMut.remove.mutate(modal.item.id); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

/** "All" catalog: every section's categories and items, read-only. */
function AllCatalogView({ query }) {
  return (
    <main className="page">
      <h2 className="page-title">All Sections</h2>
      <div className="empty-state" style={{ marginTop: -8, marginBottom: 16 }}>
        Browsing every section. Pick a section in the switcher above to make changes.
      </div>

      {query.isLoading && <p className="placeholder">Loading…</p>}

      {(query.data ?? []).map((section) => (
        <section key={section.id} style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 8px' }}>{section.name}</h3>
          {section.categories.length === 0 && <div className="empty-state">No categories yet.</div>}
          {section.categories.map((cat) => (
            <div key={cat.id} className="catalog-block">
              <div
                className="detail-category"
                style={USE_CATEGORY_COLORS ? { background: cat.color || DEFAULT_CATEGORY_COLOR } : undefined}
              >
                {cat.name}
              </div>
              <div className="pane-list">
                {cat.items.map((item) => (
                  <div key={item.id} className="pane-row">
                    <span className="pane-label">{item.name}</span>
                    {item.maxStock != null && <span className="mini-chip">Max {item.maxStock}</span>}
                  </div>
                ))}
                {cat.items.length === 0 && <div className="empty-state">No items yet.</div>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
