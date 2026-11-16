"""La page, servie par le service lui-même en production (MEM-58).

Une seule image : FastAPI répond à l'API et rend la SPA construite par Vite
(`apps/web/dist`). Il n'y a plus de nginx devant, donc ses en-têtes de sécurité
vivent ici.

Seuls la racine et les fichiers qui existent dans le dossier construit sont
servis, avant le verrou de l'atelier : la page est publique, c'est elle qui
propose de se connecter. Tout autre chemin continue vers l'API et son verrou.
L'application n'a pas de routes côté client (`createMemoryHistory`), donc pas
de repli sur `index.html` pour un chemin inconnu.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import Request, Response
from fastapi.responses import FileResponse

#: La politique de la page. Pas de `unsafe-eval` ni de CDN : le front v2 n'en
#: charge aucun. Nuxt UI pose des styles en ligne, d'où `unsafe-inline` pour
#: les styles seulement.
PAGE_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)


def page_file(root: Path, path: str) -> Path | None:
    """The built file this path names, or None. Never outside `root`."""
    if path == "/":
        candidate = root / "index.html"
    else:
        candidate = (root / path.lstrip("/")).resolve()
        if not candidate.is_relative_to(root):
            return None
    return candidate if candidate.is_file() else None


def page_middleware(
    directory: str,
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    root = Path(directory).resolve()

    async def serve(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method in ("GET", "HEAD"):
            found = page_file(root, request.url.path)
            if found is not None:
                response: Response = FileResponse(found)
                response.headers["Content-Security-Policy"] = PAGE_POLICY
                # Les fichiers de Vite portent leur empreinte dans leur nom :
                # ils ne changent jamais. La page, elle, doit être relue.
                immutable = request.url.path.startswith("/assets/")
                response.headers["Cache-Control"] = (
                    "public, max-age=31536000, immutable" if immutable else "no-cache"
                )
                response.headers["X-Content-Type-Options"] = "nosniff"
                response.headers["Referrer-Policy"] = "no-referrer"
                response.headers["X-Frame-Options"] = "DENY"
                return response
        return await call_next(request)

    return serve
