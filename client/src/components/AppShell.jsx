import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '../hooks/useOrg.js';
import { api, getOrgId } from '../api/client.js';
import Sidebar from './Sidebar.jsx';

export function useSections(includeInactive = false) {
  return useQuery({
    queryKey: ['sections', includeInactive],
    queryFn: () => api(`/sections${includeInactive ? '?includeInactive=true' : ''}`),
    // The org bootstrap (useOrg) pins orgId before any other query may run.
    enabled: getOrgId() !== null,
  });
}

export default function AppShell() {
  const orgQuery = useOrg();
  const sections = useSections();

  if (orgQuery.isLoading) return <p className="placeholder">Loading…</p>;
  if (orgQuery.isError) {
    return <p className="placeholder">Could not reach the server. Is it running?<br />{String(orgQuery.error)}</p>;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <header className="app-header">
          <h1 className="app-title">{orgQuery.data.name}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </header>
        <Outlet context={{ org: orgQuery.data, sections }} />
      </div>
    </div>
  );
}
