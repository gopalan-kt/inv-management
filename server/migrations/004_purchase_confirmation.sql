-- Side B stage separation: the purchasing step is now its own confirmed stage
-- between "sent" and "received". purchased_at marks WHEN the purchase staff
-- confirmed the buy (with bill_ref as the bill/receipt reference they enter);
-- NULL means the order is still awaiting purchase. The order status stays
-- 'sent' during purchasing — "to receive" = status sent AND purchased_at set.

ALTER TABLE orders ADD COLUMN purchased_at TEXT;
ALTER TABLE orders ADD COLUMN bill_ref TEXT;
