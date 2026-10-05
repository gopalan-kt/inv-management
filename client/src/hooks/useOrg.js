import { useQuery } from '@tanstack/react-query';
import { fetchOrgs, setOrgId, getPreferredOrgId } from '../api/client.js';

/** Bootstrap: load orgs, prefer the org chosen at login (this device),
 *  fall back to the first one. Returns the active org. */
export function useOrg() {
  return useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      const orgs = await fetchOrgs();
      if (orgs.length === 0) throw new Error('No organization found — run `npm run import` first');
      const preferred = getPreferredOrgId();
      const org = orgs.find((o) => String(o.id) === String(preferred)) ?? orgs[0];
      setOrgId(org.id);
      // Tab title follows the org — no per-customer branding in code.
      document.title = `${org.name} — Inventory Management`;
      return org;
    },
    staleTime: Infinity,
    retry: 1,
  });
}
