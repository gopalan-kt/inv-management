-- Side B (purchasing): per-line strike-off state. A timestamp, not a boolean —
-- it records WHEN the shopper picked the item, and NULL means not yet picked.
-- Strikes are only allowed while the order is 'sent'.

ALTER TABLE order_items ADD COLUMN purchased_at TEXT;
