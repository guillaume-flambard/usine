# Build statique, servi par nginx. Aucune variable d'environnement, aucun
# secret dans l'image : l'application doit fonctionner servie telle quelle.

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

FROM nginx:1.27-alpine AS service
COPY --from=build /app/dist /usr/share/nginx/html
# Modèle et non configuration finale : l'entrypoint de l'image nginx substitue
# les variables au démarrage. Le filtre limite la substitution aux variables
# `RELAIS_` — sans lui, `$politique`, `$uri` et `$host` seraient vidés.
COPY deploiement/nginx.conf /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^RELAIS_
# Le nom du service de relais sur le réseau Docker. Pas de relais déployé :
# /api rend 502, et le site reste en mode déterministe.
ENV RELAIS_URL=http://relais:3000
EXPOSE 80
# 127.0.0.1 et non localhost : celui-ci résout en ::1, et nginx n'écoute
# qu'en IPv4. Un conteneur marqué malsain n'est pas routé par Traefik.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
