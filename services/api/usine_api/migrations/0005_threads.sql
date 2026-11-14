-- Les runs v2 (MEM-18) : un run est un thread LangGraph. Son état vit dans les
-- tables du checkpointer ; cette table en garde l'index (titre, organisation,
-- statut, date) et, tour par tour, le brief, la réponse et les événements du
-- run, pour qu'un run rouvert rejoue sa scène.
--
-- Une table à part plutôt que les colonnes ajoutées par 0004 à `runs` : les
-- runs v1 y portent un flux d'un autre format dans `events`, et chaque requête
-- v1 aurait dû filtrer les lignes v2. Les colonnes de 0004 restent, inutilisées.
-- `owner` est l'organisation ; NULL pour un visiteur anonyme.

CREATE TABLE IF NOT EXISTS threads (
    thread_id  TEXT PRIMARY KEY,
    owner      TEXT,
    title      TEXT NOT NULL,
    status     TEXT NOT NULL,
    turns      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- La liste paginée par curseur : (created_at, thread_id) décroissants.
CREATE INDEX IF NOT EXISTS threads_owner_created_idx ON threads (owner, created_at DESC, thread_id DESC);
