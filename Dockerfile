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
# A template, not a final configuration: the nginx image entrypoint substitutes
# variables at startup. The filter limits substitution to `RELAY_` variables —
# without it, `$policy`, `$uri` and `$host` would be emptied.
COPY deployment/nginx.conf /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^RELAY_
# The relay's address. With no relay deployed, /api returns 502 and the site
# stays in demo mode.
ENV RELAY_URL=http://relay:3000
EXPOSE 80
# 127.0.0.1 et non localhost : celui-ci résout en ::1, et nginx n'écoute
# qu'en IPv4. Un conteneur marqué malsain n'est pas routé par Traefik.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
