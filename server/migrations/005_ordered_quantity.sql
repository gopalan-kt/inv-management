-- Stage-3 comparison: remember what the section ORIGINALLY ordered, separate
-- from the quantity the purchase staff settled on while shopping. Refreshed on
-- draft edits (like the other snapshots), frozen at send. The To Receive view
-- shows ordered vs purchased (Received X · Missing Y).

ALTER TABLE order_items ADD COLUMN ordered_quantity INTEGER NOT NULL DEFAULT 0;
