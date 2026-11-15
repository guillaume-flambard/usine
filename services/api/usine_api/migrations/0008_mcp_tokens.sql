-- Les jetons du serveur MCP (MEM-40) : le serveur exposé ne parle pas sans
-- authentification, et un jeton est révocable, étiqueté, limité à une portée.
--
-- On stocke le hachage, jamais le jeton : la table se lit, elle ne sert pas de
-- trousseau. `scope` vaut 'read' ou 'read_fork'.

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id         TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    org        TEXT NOT NULL,
    label      TEXT NOT NULL,
    scope      TEXT NOT NULL,
    revoked    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
