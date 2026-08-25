#!/usr/bin/env bash
# Sauvegarde de la base de l'atelier.
#
# Opérable sans le service : ne touche que PostgreSQL. Écrit un dump compressé
# (`pg_dump -Fc`) horodaté dans le dossier de sortie. Le déclenchement régulier
# (cron Coolify) et le stockage hors-hôte sont de l'infra.
#
# Usage :
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./deployment/backup.sh [out_dir]
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requis (postgresql://…)}"
out_dir="${1:-./backups}"
mkdir -p "$out_dir"

# Horodatage UTC : un nom de fichier triable, sans ambiguïté de fuseau.
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$out_dir/usine-$stamp.dump"

# -Fc : format personnalisé, restaurable par pg_restore avec --clean.
pg_dump -Fc --no-owner --no-privileges --dbname "$DATABASE_URL" --file "$out"

echo "Sauvegarde écrite : $out"
