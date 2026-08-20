# Relais de raisonnement : Node seul, aucune dépendance à installer.
FROM node:22-alpine
WORKDIR /app
COPY serveur.mjs relais.mjs ./
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:3000/sante || exit 1
USER node
CMD ["node", "serveur.mjs"]
