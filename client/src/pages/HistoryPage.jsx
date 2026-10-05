import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useSectionFilter } from '../hooks/useSectionFilter.jsx';
import { formatDateTime } from '../lib/format.js';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function HistoryPage() {
  const navigate = useNavigate();
  const { filter } = useSectionFilter();
  const all = filter === 'all';
  const sid = Number(filter);
  const [status, setStatus] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['orders', all ? 'all' : sid, status],
    queryFn: () => api(all ? `/orders${status ? `?status=${status}` : ''}` : `/sections/${sid}/orders${status ? `?status=${status}` : ''}`),
    enabled: all || sid > 0,
  });

  return (
    <main className="page">
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`section-pill${status === f.key ? ' active' : ''}`}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {ordersQuery.isLoading && <p className="placeholder">Loading…</p>}

      {ordersQuery.data?.length === 0 && (
        <div className="empty-state">No orders yet. Build one on the To Order page and hit Send.</div>
      )}

      {(ordersQuery.data ?? []).map((order) => (
        <button
          key={order.id}
          className="order-card"
          onClick={() => navigate(`/orders/${order.id}`)}
        >
          <div className="order-card-top">
            <span className="order-card-date">
              {all && order.sectionName && (
                <span className="mini-chip" style={{ marginRight: 8 }}>{order.sectionName}</span>
              )}
              {formatDateTime(order.createdAt)}
            </span>
            <span className={`status-chip status-${order.status}`}>{order.status}</span>
          </div>
          <div className="order-card-meta">
            {order.lineCount} item{order.lineCount === 1 ? '' : 's'}
            {order.receivedAt && ` · received ${formatDateTime(order.receivedAt)}`}
            {order.cancelledAt && ' · cancelled'}
          </div>
        </button>
      ))}
    </main>
  );
}
