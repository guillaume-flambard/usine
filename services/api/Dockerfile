# Le service compagnon. Une seule étape : il n'y a rien à compiler, et une
# image de build séparée coûterait plus qu'elle ne gagne.
FROM python:3.15-slim

# `uv` plutôt que pip : le verrou est le même que celui utilisé en local, donc
# l'image installe exactement ce que les tests ont vu.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY usine_api ./usine_api

# Le service n'écoute que sur le réseau du compose : c'est nginx qui expose.
ENV USINE_HOST=0.0.0.0 USINE_PORT=8000
EXPOSE 8000

# La sonde interroge la route que le navigateur lira : une sonde qui vérifie
# autre chose que ce qui sert ne prouve rien.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"

CMD ["uv", "run", "--no-dev", "uvicorn", "usine_api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
