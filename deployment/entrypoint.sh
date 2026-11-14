#!/bin/sh
# Trois processus dans un conteneur, et c'est délibéré : le relais n'existe que
# pour garder une clé hors du navigateur, le service porte ce que la vitrine ne
# sait pas faire, et nginx est le seul à les appeler. Aucun des deux n'écoute
# ailleurs que sur la boucle locale.
#
# nginx est au premier plan et décide de la vie du conteneur. Si le relais meurt,
# le site reste debout : /api rend 502, la sonde du modèle échoue, et la page
# retombe sur sa démonstration rejouée — ce qu'elle annonce. Si le service meurt,
# l'atelier dit qu'il ne voit pas la flotte, ce qu'il sait dire. Un site entier
# tombé parce qu'un modèle n'est plus joignable serait pire.
set -e

node /app/relay/server.mjs &
/opt/venv/bin/uvicorn usine_api.app:create_app --factory \
  --host 127.0.0.1 --port "${API_PORT:-3111}" &
exec nginx -g 'daemon off;'
