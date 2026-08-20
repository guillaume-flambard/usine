# Build statique, servi par nginx. Aucune variable d'environnement, aucun
# secret dans l'image : l'application doit fonctionner servie telle quelle.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS service
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploiement/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
