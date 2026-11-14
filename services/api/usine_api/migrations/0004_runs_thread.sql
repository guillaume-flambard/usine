-- Les runs v2 sont des threads LangGraph (MEM-12). La table `runs` garde ce qui
-- est à nous (titre, auteur, date, statut) ; l'état du run vit dans les tables
-- du checkpointer, qui appartiennent à LangGraph et que `setup()` gère.
-- Additif : les runs v1 gardent `thread_id` à NULL.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS thread_id TEXT UNIQUE;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
