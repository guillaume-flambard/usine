#!/usr/bin/env bash
# Restauration de la base de l'atelier depuis un dump `pg_dump -Fc`.
#
# Opérable sans le service. `--clean --if-exists` remplace les objets existants,
# de sorte qu'une restauration dans une base non vide reproduit l'état du dump.
#
# Usage :
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./deployment/restore.sh <dump>
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requis (postgresql://…)}"
dump="${1:?chemin du dump requis}"
[ -f "$dump" ] || { echo "Dump introuvable : $dump" >&2; exit 1; }

# --no-owner/--no-privileges : la restauration ne dépend pas des rôles du dump.
pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname "$DATABASE_URL" "$dump"

echo "Restauration terminée depuis : $dump"
