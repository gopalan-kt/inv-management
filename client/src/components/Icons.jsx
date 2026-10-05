// Inline SVG icons (lucide-style strokes) — no icon library dependency.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ToOrderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function CatalogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

export function ReceiveIcon() {
  // Box with a check — goods arriving and being checked off.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function InventoryIcon() {
  // Bar chart — stock levels at a glance.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <path d="M3 21h18" />
      <path d="M6 21V10" />
      <path d="M12 21V3" />
      <path d="M18 21v-7" />
    </svg>
  );
}

export function SettingsIcon() {
  // Sliders — settings controls.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="14" y2="20" />
      <line x1="8" x2="8" y1="6" y2="10" />
      <line x1="16" x2="16" y1="14" y2="20" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

export function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <path d="m13 17 5-5-5-5" />
      <path d="m6 17 5-5-5-5" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...stroke}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
