import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ToOrderIcon, ReceiveIcon, HistoryIcon, InventoryIcon, CatalogIcon, CartIcon,
  SettingsIcon, CollapseIcon, ExpandIcon, ChevronDownIcon,
} from './Icons.jsx';
import { useSections } from './AppShell.jsx';
import { useSectionFilter } from '../hooks/useSectionFilter.jsx';

const EXPANDED_KEY = 'sel_sidebar_expanded_v1';

export default function Sidebar() {
  const location = useLocation();
  const sections = useSections();
  const { filter, setFilter } = useSectionFilter();
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(EXPANDED_KEY) !== '0'; } catch { return true; }
  });

  // If the stored/selected section no longer exists, fall back to All.
  useEffect(() => {
    if (filter !== 'all' && sections.data && !sections.data.some((s) => String(s.id) === filter)) {
      setFilter('all');
    }
  }, [filter, sections.data, setFilter]);

  const toggle = () => {
    setExpanded((v) => {
      try { localStorage.setItem(EXPANDED_KEY, v ? '0' : '1'); } catch { /* private mode */ }
      return !v;
    });
  };

  const navItems = [
    { to: '/inventory', label: 'Current Inventory', icon: <InventoryIcon /> },
    { to: '/to-order', label: 'To Order', icon: <ToOrderIcon /> },
    { to: '/to-receive', label: 'To Receive', icon: <ReceiveIcon /> },
    { to: '/history', label: 'Order History', icon: <HistoryIcon /> },
  ];
  const purchaseItems = [
    { to: '/shopping', label: 'Shopping Cart', icon: <CartIcon /> },
  ];

  return (
    <aside className={`sidebar${expanded ? '' : ' collapsed'}`}>
      <button
        className="sidebar-toggle"
        onClick={toggle}
        title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {expanded ? <CollapseIcon /> : <ExpandIcon />}
      </button>

      <SectionSwitcher
        disabled={location.pathname.startsWith('/shopping') || location.pathname === '/catalog'}
        expanded={expanded}
      />

      {navItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.end}
          title={item.label}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
        >
          {item.icon}
          <span className="sidebar-label">{item.label}</span>
        </NavLink>
      ))}

      <div className="sidebar-divider" />

      {purchaseItems.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          title={item.label}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
        >
          {item.icon}
          <span className="sidebar-label">{item.label}</span>
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      <NavLink
        to="/catalog"
        title="Inventory Catalog"
        className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
      >
        <CatalogIcon />
        <span className="sidebar-label">Inventory Catalog</span>
      </NavLink>

      <div className="sidebar-divider" />

      <NavLink
        to="/settings"
        title="Settings"
        className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
      >
        <SettingsIcon />
        <span className="sidebar-label">Settings</span>
      </NavLink>
    </aside>
  );
}

/**
 * The section dropdown is a FILTER over the four section-aware pages — it does
 * not navigate. Disabled (greyed out) on the org-wide tools (Shopping Cart,
 * Inventory Catalog), which don't take a section.
 */
function SectionSwitcher({ disabled, expanded }) {
  const { filter, setFilter } = useSectionFilter();
  const sections = useSections();
  const [open, setOpen] = useState(false);

  const list = sections.data ?? [];
  const current = list.find((s) => String(s.id) === filter);
  const currentName = filter === 'all' ? 'All Sections' : (current?.name ?? 'All Sections');

  return (
    <div className="section-switch">
      <button
        className="switcher-btn"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title={disabled ? 'Section filter not available on this page' : (expanded ? undefined : currentName)}
        aria-expanded={open}
      >
        {expanded ? (
          <>
            <span className="switcher-name">{currentName}</span>
            <span className={`switcher-chevron${open ? ' open' : ''}`}>
              <ChevronDownIcon />
            </span>
          </>
        ) : (
          <span className="switcher-initial">{ctxInitial(currentName)}</span>
        )}
      </button>

      {open && (
        <>
          <div className="switcher-backdrop" onClick={() => setOpen(false)} />
          <div className="switcher-panel">
            <div className="switcher-list">
              <button
                className={`switcher-option${filter === 'all' ? ' active' : ''}`}
                onClick={() => { setFilter('all'); setOpen(false); }}
              >
                All Sections
              </button>
              {list.map((s) => (
                <button
                  key={s.id}
                  className={`switcher-option${String(s.id) === filter ? ' active' : ''}`}
                  onClick={() => { setFilter(String(s.id)); setOpen(false); }}
                >
                  {s.name}
                </button>
              ))}
              {list.length === 0 && (
                <div className="switcher-empty">No sections yet</div>
              )}
            </div>
            <Link
              to="/catalog"
              className="switcher-manage"
              onClick={() => setOpen(false)}
            >
              ＋ Manage sections
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ctxInitial(name) {
  return name === 'All Sections' ? 'A' : name.charAt(0).toUpperCase();
}
