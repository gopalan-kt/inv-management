// The single source of truth for whether category colors render anywhere in
// the app. Stored colors are always kept in the DB and settable in the
// Catalog; this switch only controls whether they're SHOWN.
//   true  → colorful category headers everywhere (To Order, Catalog, All view)
//   false → the neutral grey default everywhere
export const USE_CATEGORY_COLORS = true;

// Fallback for categories without a stored color.
export const DEFAULT_CATEGORY_COLOR = '#E5E5EA';
