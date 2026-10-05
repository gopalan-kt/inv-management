-- Users: each belongs to exactly one organization (multi-org tenancy — every
-- check goes through org_id). Passwords are stored as scrypt salt:hash
-- (Node crypto, no external dependency).

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_users_email ON users(email);
