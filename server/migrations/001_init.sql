-- SEL Inventory — initial schema.
-- Conventions: org_id is denormalized on every table (org scoping is a WHERE clause,
-- never a join); timestamps are ISO-8601 UTC so lexicographic order == chronological;
-- booleans are INTEGER 0/1 with CHECK constraints; partial unique indexes (WHERE
-- active = 1) so soft-deleted names can be recreated.

CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_orgs_slug ON organizations(slug);

CREATE TABLE sections (
    id         INTEGER PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_sections_org_name ON sections(org_id, name) WHERE active = 1;
CREATE INDEX ix_sections_org ON sections(org_id, sort_order);

CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    name       TEXT NOT NULL,
    color      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_categories_section_name ON categories(section_id, name) WHERE active = 1;
CREATE INDEX ix_categories_section ON categories(section_id, sort_order);
CREATE INDEX ix_categories_org ON categories(org_id);

CREATE TABLE items (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    unit        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_items_category_name ON items(category_id, name) WHERE active = 1;
CREATE INDEX ix_items_category ON items(category_id, sort_order);
CREATE INDEX ix_items_org ON items(org_id);

CREATE TABLE orders (
    id           INTEGER PRIMARY KEY,
    org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    section_id   INTEGER NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
    created_by   INTEGER,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    sent_at      TEXT,
    received_at  TEXT,
    cancelled_at TEXT
);

-- One live draft per section: the section's working list IS its draft.
CREATE UNIQUE INDEX ux_orders_one_draft_per_section ON orders(section_id) WHERE status = 'draft';
CREATE INDEX ix_orders_org_section ON orders(org_id, section_id, created_at DESC);

CREATE TABLE order_items (
    id                INTEGER PRIMARY KEY,
    org_id            INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id           INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    -- Snapshots, refreshed while the order is a draft, frozen once sent:
    item_name         TEXT NOT NULL,
    item_unit         TEXT,
    category_name     TEXT NOT NULL,
    item_sort         INTEGER NOT NULL,
    category_sort     INTEGER NOT NULL,
    quantity          INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    need_only         INTEGER NOT NULL DEFAULT 0 CHECK (need_only IN (0, 1)),
    no_stock          INTEGER NOT NULL DEFAULT 0 CHECK (no_stock IN (0, 1)),
    received_quantity INTEGER,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_order_items_order_item ON order_items(order_id, item_id);
CREATE INDEX ix_order_items_order ON order_items(order_id);
