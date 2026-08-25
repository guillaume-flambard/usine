-- L'identité et l'appartenance des runs. Additif : aucune donnée existante à
-- migrer (le stockage précédent était en mémoire). Le flux d'un run reste le
-- format d'archive (AD-33) ; l'org et le partage vivent à côté, jamais dedans.

CREATE TABLE IF NOT EXISTS accounts (
    id    TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS organizations (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    owner_account_id TEXT NOT NULL REFERENCES accounts (id)
);

-- Le jeton n'est jamais stocké en clair : seule sa clé de hachage l'est.
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    token_hash TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts (id),
    expires_at DOUBLE PRECISION NOT NULL
);

-- Un run appartient à une org ; `shared` ouvre son lien. L'archive est le flux,
-- conservé tel quel.
CREATE TABLE IF NOT EXISTS runs (
    run_id  TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    brief   TEXT NOT NULL,
    events  JSONB NOT NULL,
    owner   TEXT NOT NULL,
    shared  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS runs_owner_idx ON runs (owner);
