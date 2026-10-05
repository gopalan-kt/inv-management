-- Current Inventory: items now carry an on-hand quantity. It increases when a
-- received order delivers purchased goods (receiveOrder adds received_quantity
-- into items.stock). Per-item stock is inherently section-scoped because items
-- belong to a category in a section.

ALTER TABLE items ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
