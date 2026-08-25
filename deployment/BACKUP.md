# Sauvegarde et restauration de la base

La persistance des runs et des comptes vit dans PostgreSQL. Ces deux scripts
opèrent contre la base seule (le service peut être arrêté).

## Sauvegarder

```sh
DATABASE_URL=postgresql://user:pass@host:5432/usine ./deployment/backup.sh /chemin/backups
```

Écrit `usine-<horodatage>.dump` (format `pg_dump -Fc`). À planifier via un cron
Coolify, et à **copier hors de l'hôte** — une sauvegarde sur la machine qui peut
tomber ne protège de rien.

## Restaurer

```sh
DATABASE_URL=postgresql://user:pass@host:5432/usine ./deployment/restore.sh usine-<horodatage>.dump
```

`--clean --if-exists` remplace les objets existants ; une restauration dans une
base vide comme dans une base peuplée reproduit l'état du dump.

## Vérifié

Testé à la main contre un PostgreSQL 16 jetable : dump d'une base peuplée →
restauration dans une base vide → runs et identités présents. Non rejoué en CI
(pas de base). La purge de la corbeille (`purge_expired`) est, elle, une tâche
d'infra distincte à planifier de même.
