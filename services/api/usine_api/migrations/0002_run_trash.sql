-- La corbeille : un run supprimé est retenu (réversible) jusqu'à sa purge.
-- Additif : les runs existants ont trashed_at NULL (vivants).

ALTER TABLE runs ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

-- Index partiel sur les runs vivants : le listing et la lecture, qui excluent la
-- corbeille, ne parcourent que ce qui est vivant.
CREATE INDEX IF NOT EXISTS runs_live_owner_idx ON runs (owner) WHERE trashed_at IS NULL;
