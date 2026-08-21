#!/bin/sh
# Deux processus dans un conteneur, et c'est délibéré : le relais n'existe que
# pour garder une clé hors du navigateur, et nginx est le seul à l'appeler.
#
# nginx est au premier plan et décide de la vie du conteneur. Si le relais
# meurt, le site reste debout : /api rend 502, la sonde échoue, et la page
# retombe sur sa démonstration rejouée — ce qu'elle annonce. Un site entier
# tombé parce qu'un modèle n'est plus joignable serait pire.
set -e

node /app/relay/server.mjs &
exec nginx -g 'daemon off;'
