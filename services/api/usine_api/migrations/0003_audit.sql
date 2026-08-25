-- Le journal d'audit : append-only par usage (aucune route ne modifie/supprime).
-- On journalise org/action/cible, jamais un secret.

CREATE TABLE IF NOT EXISTS audit_entries (
    id     BIGSERIAL PRIMARY KEY,
    org    TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_org_idx ON audit_entries (org, at);
