import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useSections } from '../components/AppShell.jsx';
import { useSectionFilter } from '../hooks/useSectionFilter.jsx';
import { formatDateTime } from '../lib/format.js';

/**
 * The "All Sections" view of To Order: an overview across sections. Counting
 * itself stays per-section (drafts belong to a section), so this is the
 * launchpad — each section shows its current draft state and links into it.
 */
export default function AllSectionsPage() {
  const navigate = useNavigate();
  const { setFilter } = useSectionFilter();
  const sections = useSections();
  const draftsQuery = useQuery({
    queryKey: ['orders', 'all', 'draft'],
    queryFn: () => api('/orders?status=draft'),
  });

  const open = (id) => {
    setFilter(String(id));
    navigate('/to-order');
  };

  return (
    <main className="page">
      <h2 className="page-title">All Sections</h2>
      <p className="order-card-meta" style={{ marginTop: -8, marginBottom: 16 }}>
        Pick a section to count its order — drafts are kept per section.
      </p>

      {sections.isLoading && <p className="placeholder">Loading…</p>}

      {(sections.data ?? []).map((s) => {
        const draft = (draftsQuery.data ?? []).find((d) => d.sectionId === s.id && d.lineCount > 0);
        return (
          <button key={s.id} className="order-card" onClick={() => open(s.id)}>
            <div className="order-card-top">
              <span className="order-card-date">{s.name}</span>
              {draft
                ? <span className="status-chip status-draft">draft: {draft.lineCount} item{draft.lineCount === 1 ? '' : 's'}</span>
                : <span className="status-chip status-draft">no draft</span>}
            </div>
            {draft && (
              <div className="order-card-meta">draft started {formatDateTime(draft.createdAt)}</div>
            )}
          </button>
        );
      })}

      {(sections.data?.length ?? 0) === 0 && !sections.isLoading && (
        <div className="empty-state">
          No sections yet — create one from the section switcher (＋).
        </div>
      )}
    </main>
  );
}
