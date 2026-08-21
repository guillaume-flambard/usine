# Reasoning relay: Node alone, no dependency to install.
FROM node:22-alpine
WORKDIR /app
COPY server.mjs relay.mjs ./
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1
USER node
CMD ["node", "server.mjs"]
