import { createContext, useContext, useState } from 'react';

// App-wide section filter: 'all' or a section id (as a string). The sidebar's
// section dropdown sets it; Current Inventory, To Order, To Receive and Order
// History render according to it. Persists per device; defaults to 'all'.
const KEY = 'sel_section_filter_v1';
const Ctx = createContext(null);

export function SectionFilterProvider({ children }) {
  const [filter, setFilterState] = useState(() => {
    try { return localStorage.getItem(KEY) || 'all'; } catch { return 'all'; }
  });

  const setFilter = (value) => {
    setFilterState(String(value));
    try { localStorage.setItem(KEY, String(value)); } catch { /* private mode */ }
  };

  return <Ctx.Provider value={{ filter, setFilter }}>{children}</Ctx.Provider>;
}

export function useSectionFilter() {
  return useContext(Ctx);
}
