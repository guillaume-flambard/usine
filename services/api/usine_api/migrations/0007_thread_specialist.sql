-- Le spécialiste épinglé sur une branche (MEM-33) : un fork peut rejouer le
-- même run avec une autre implémentation, et la branche doit s'en souvenir
-- quand on la rouvre. NULL = le spécialiste par défaut du service.

ALTER TABLE threads
    ADD COLUMN IF NOT EXISTS specialist TEXT;
