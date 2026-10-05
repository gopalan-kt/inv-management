-- Par levels ("Max Inventory Needed") + the entered current-count snapshot.
-- max_stock: manager-set ceiling per item; NULL = no default (manual ordering only).
-- current_count: what staff said they had on hand when the line was created
-- (stock mode); NULL = manual mode. Snapshotted like the name columns.

ALTER TABLE items ADD COLUMN max_stock INTEGER CHECK (max_stock IS NULL OR max_stock >= 0);
ALTER TABLE order_items ADD COLUMN current_count INTEGER CHECK (current_count IS NULL OR current_count >= 0);
