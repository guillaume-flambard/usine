-- Les branches d'un run (MEM-23) : un fork crée un thread LangGraph à part, et
-- cette table garde d'où il vient. Deux colonnes plutôt qu'une table dédiée :
-- une branche est un run, avec une seule origine.
--
-- `fork_checkpoint_id` est l'identifiant du checkpoint d'origine ; il n'est pas
-- une clé étrangère, les checkpoints appartenant au checkpointer et non à nous.

ALTER TABLE threads
    ADD COLUMN IF NOT EXISTS parent_thread_id TEXT,
    ADD COLUMN IF NOT EXISTS fork_checkpoint_id TEXT;
