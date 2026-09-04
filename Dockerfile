# Le site et son relais dans une seule image. Deux conteneurs obligeraient à
# résoudre l'un depuis l'autre — et le control plane d'alors (Coolify, supprimé
# depuis) ne donnait pas d'alias DNS stable à ses conteneurs, ce qui imposait
# d'exposer le relais publiquement pour que le nginx de la même machine puisse
# l'atteindre. Un seul conteneur, une boucle locale, et le problème n'existe pas.
#
# Aucun secret dans l'image : la clé arrive par l'environnement, à l'exécution.

FROM node:22-alpine AS build
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

FROM node:22-alpine AS service
RUN apk add --no-cache nginx
COPY --from=build /app/dist /usr/share/nginx/html
COPY deployment/nginx.conf /etc/nginx/http.d/default.conf
# Le relais : du Node sans dépendance, rien à installer.
COPY services/relay/relay.mjs services/relay/server.mjs /app/relay/
COPY deployment/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /run/nginx
ENV RELAY_PORT=3000
EXPOSE 80
# 127.0.0.1 et non localhost : celui-ci résout en ::1, et nginx n'écoute
# qu'en IPv4. Un conteneur marqué malsain n'est pas routé par Traefik.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["/entrypoint.sh"]
