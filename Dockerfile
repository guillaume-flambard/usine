# Le site, son relais et le service, dans une seule image. Deux conteneurs
# obligeraient à résoudre l'un depuis l'autre — et le control plane d'alors
# (Coolify, supprimé depuis) ne donnait pas d'alias DNS stable à ses conteneurs,
# ce qui imposait d'exposer le relais publiquement pour que le nginx de la même
# machine puisse l'atteindre. Un seul conteneur, une boucle locale, et le
# problème n'existe pas. Coolify est parti, mais la raison de garder un seul
# conteneur reste : une image, un tag, une sonde, une restauration.
#
# Aucun secret dans l'image : les clés arrivent par l'environnement, à l'exécution.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--ignore-scripts` : le build n'a besoin ni de Playwright ni des navigateurs
# qu'il téléchargerait, et l'image n'a pas à porter des centaines de mégaoctets
# d'outillage de test.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# Le service compagnon, dans son propre environnement. `services/api` exige
# Python 3.12 ou plus haut, et le Python de bookworm est un 3.11 : c'est ce qui
# décide de l'image de base ci-dessous, pas une préférence.
FROM python:3.13-slim-bookworm AS api
RUN python -m venv /opt/venv
COPY services/api /src/api
RUN /opt/venv/bin/pip install --no-cache-dir /src/api

FROM python:3.13-slim-bookworm AS service
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/*
# Node vient de l'image officielle, telle quelle : c'est un binaire autonome, et
# les deux images partagent bookworm, donc la même glibc. L'installer par apt
# donnerait une version que personne n'a choisie.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=api /opt/venv /opt/venv
COPY --from=build /app/dist /usr/share/nginx/html
COPY deployment/nginx.conf /etc/nginx/sites-available/default
# Le relais : du Node sans dépendance, rien à installer.
COPY services/relay/relay.mjs services/relay/server.mjs /app/relay/
COPY deployment/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /run/nginx
ENV RELAY_PORT=3000
ENV API_PORT=3111
EXPOSE 80
# 127.0.0.1 et non localhost : celui-ci résout en ::1, et nginx n'écoute
# qu'en IPv4. Un conteneur marqué malsain n'est pas routé par Traefik.
#
# La sonde vise la vitrine, pas l'atelier : l'atelier est derrière un mot de
# passe au niveau de Traefik, mais la sonde tape nginx en direct, et c'est la
# vitrine qui décide si l'image est vivante.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1/', timeout=2).status == 200 else 1)" || exit 1
CMD ["/entrypoint.sh"]
