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
COPY deploiement/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
