"""Le service compagnon.

Il porte ce qu'un onglet ne peut pas porter. Aujourd'hui : le relais de
raisonnement et la capacité. Ensuite, dans cet ordre : la persistance des runs,
la mémoire, l'exécution d'outil en bac à sable, MCP, l'évaluation.

Le contrat HTTP est celui du relais Node qu'il remplace, au champ près. C'est
délibéré : le client n'a pas été modifié par la migration, et c'est la preuve
qu'elle est propre.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .evaluation import evaluate, measure
from .limits import Limits, RateLimiter
from .mcp import TIMEOUT_SECONDS, McpRefusal, Server, call_tool, list_tools
from .memory import MAX_FACT, Fact, InMemoryMemory, Memory
from .reasoning import DEFAULT_MODEL, Reasoning, Refusal, reason
from .runs import InMemoryRunStore, RunStore, Stored, new_id, read_archive
from .sources import SourceRefusal, catalogue, fetch_source
from .tracing import trace_of


def address_of(request: Request) -> str:
    """Qui demande.

    Le reverse proxy transmet l'adresse du visiteur ; sans elle le service
    verrait une seule adresse pour la planète entière et chaque borne par
    visiteur serait partagée par tout le monde.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    client = request.client
    return client.host if client else "?"


async def http_rpc(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Un appel JSON-RPC vers un serveur d'outils. Remplacé dans les tests."""
    # Le délai vient du module qui connaît le protocole, pas d'un nombre
    # recopié ici : deux valeurs finiraient par diverger.
    async with httpx.AsyncClient(timeout=float(TIMEOUT_SECONDS)) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"accept": "application/json, text/event-stream"},
        )
        try:
            return response.json()
        except ValueError:
            return {}


async def http_fetch(url: str) -> tuple[int, str]:
    """Va chercher une source. Remplacé dans les tests."""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        response = await client.get(url, headers={"accept": "application/json"})
        return response.status_code, response.text


async def http_caller(
    url: str, *, headers: dict[str, str], payload: dict[str, Any]
) -> tuple[int, Any]:
    """Le fournisseur, vraiment joint. Remplacé dans les tests."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        try:
            return response.status_code, response.json()
        except ValueError:
            return response.status_code, {}


def create_app(
    *,
    key: str | None = None,
    model: str | None = None,
    origin: str | None = None,
    call: Any = http_caller,
    limits: Limits | None = None,
    limiter: RateLimiter | None = None,
    runs: RunStore | None = None,
    make_id: Any = new_id,
    fetch: Any = http_fetch,
    memory: Memory | None = None,
    servers: dict[str, Server] | None = None,
    transport: Any = None,
) -> FastAPI:
    """Construit le service. Tout ce qui touche l'extérieur est injectable."""
    bounds = limits or Limits()
    gate = limiter or RateLimiter(bounds)
    store: RunStore = runs if runs is not None else InMemoryRunStore()
    # Nommés par nous, comme les sources. Vide par défaut : un serveur d'outils
    # est une décision de déploiement, pas un défaut qu'on découvre.
    tool_servers: dict[str, Server] = servers or {}
    recollection: Memory = memory if memory is not None else InMemoryMemory()
    rpc = transport if transport is not None else http_rpc
    api_key = key if key is not None else os.environ.get("OPENROUTER_API_KEY", "")
    chosen_model = model or os.environ.get("USINE_MODEL", DEFAULT_MODEL)
    site_origin = origin or os.environ.get("USINE_ORIGIN", "https://usine.memolabs.dev")

    app = FastAPI(title="Usine agentique — service", docs_url=None, redoc_url=None)

    def no_store(body: dict[str, Any], status: int = 200) -> JSONResponse:
        # Rien de ce que rend ce service n'est cachable : une capacité mise en
        # cache est une capacité fausse.
        return JSONResponse(body, status_code=status, headers={"cache-control": "no-store"})

    @app.get("/health")
    async def health(request: Request) -> JSONResponse:
        # `ready` dit s'il y a une clé, jamais laquelle : c'est ce que le
        # navigateur lit pour choisir son mode. `remaining` est ce qu'il lit
        # pour le dire honnêtement avant que le visiteur clique — une capacité
        # découverte au quarantième appel est découverte trop tard.
        left = gate.remaining(address_of(request))
        return no_store(
            {
                "ready": bool(api_key),
                "model": chosen_model,
                "remaining": {"visitor": left.visitor, "global": left.site},
                "callsPerRun": bounds.calls_per_run,
            }
        )

    @app.post("/reason")
    async def reason_route(request: Request) -> JSONResponse:
        raw = await request.body()
        # Coupé avant lecture : une charge utile démesurée ne doit pas pouvoir
        # occuper la mémoire du service.
        if len(raw) > bounds.max_body:
            return no_store({"error": "charge utile trop grande"}, 400)

        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — un corps illisible est une demande, pas un incident
            return no_store({"error": "corps illisible"}, 400)
        if not isinstance(body, dict):
            return no_store({"error": "corps illisible"}, 400)

        role = str(body.get("role") or "")

        # Le rôle est validé avant le compteur : une demande malformée ne doit
        # pas consommer le quota des visiteurs légitimes.
        from .reasoning import ROLES

        if role not in ROLES:
            return no_store({"error": f"rôle inconnu : {role}"}, 400)
        if not api_key:
            return no_store({"error": "aucune clé configurée sur le relais"}, 503)

        refusal = gate.allow(address_of(request))
        if refusal is not None:
            return no_store({"error": refusal}, 429)

        try:
            answer: Reasoning = await reason(
                role=role,
                instruction=str(body.get("instruction") or ""),
                context=str(body.get("context") or ""),
                key=api_key,
                model=chosen_model,
                origin=site_origin,
                call=call,
                limits=bounds,
                tools=body.get("tools"),
            )
        except Refusal as refused:
            return no_store({"error": refused.message}, refused.status)

        return no_store(
            {
                "text": answer.text,
                "model": answer.model,
                "tokens": answer.tokens,
                "calls": [
                    {"name": call.name, "arguments": call.arguments} for call in answer.calls
                ],
            }
        )

    @app.post("/runs")
    async def store_run(request: Request) -> JSONResponse:
        raw = await request.body()
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — un corps illisible est une demande
            return no_store({"error": "run illisible"}, 400)

        try:
            archive = read_archive(body, raw_size=len(raw))
        except Stored as refused:
            return no_store({"error": refused.message}, refused.status)

        run_id = make_id()
        store.put(run_id, archive)
        # Rien d'autre ne ressort : le run est déjà chez celui qui l'a poussé,
        # et le renvoyer doublerait la charge pour rien.
        return no_store({"id": run_id, "events": len(archive.events)}, 201)

    @app.get("/runs/{run_id}")
    async def fetch_run(run_id: str) -> JSONResponse:
        archive = store.get(run_id)
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        return no_store(archive.as_json())

    @app.post("/memory/{run_id}")
    async def remember(run_id: str, request: Request) -> JSONResponse:
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return no_store({"error": "corps illisible"}, 400)
        if not isinstance(body, dict):
            return no_store({"error": "corps illisible"}, 400)

        text = str(body.get("text") or "").strip()[:MAX_FACT]
        author = str(body.get("author") or "").strip()[:64]
        if not text or not author:
            # Un fait sans auteur n'est pas vérifiable, et un fait vide n'est
            # pas un fait. Les deux se refusent plutôt que de se stocker.
            return no_store({"error": "un fait porte un auteur et un texte"}, 400)

        recollection.remember(
            Fact(
                run=run_id,
                author=author,
                text=text,
                origin=str(body.get("origin") or "")[:200],
            )
        )
        return no_store({"remembered": True}, 201)

    @app.get("/memory/{run_id}")
    async def recall(run_id: str, request: Request) -> JSONResponse:
        query = request.query_params.get("q", "")
        limit = request.query_params.get("limit", "5")
        found = recollection.recall(run_id, query, int(limit) if limit.isdigit() else 5)
        return no_store({"facts": [fact.as_json() for fact in found]})

    @app.delete("/memory/{run_id}")
    async def forget(run_id: str) -> JSONResponse:
        # La persistance ne contourne pas la réversibilité, elle la suit : ce
        # qui appartenait à un run part avec lui.
        return no_store({"forgotten": recollection.forget(run_id)})

    @app.get("/tools")
    async def tools() -> JSONResponse:
        # Découverts à l'exécution : ni le navigateur ni le prompt ne portent
        # la liste. Un serveur ajouté est un outil de plus sans redéploiement
        # du client.
        found: list[dict[str, Any]] = []
        unreachable: list[str] = []
        for server in tool_servers.values():
            try:
                found.extend(tool.as_json() for tool in await list_tools(server, transport=rpc))
            except McpRefusal:
                # Un serveur muet ne fait pas taire les autres.
                unreachable.append(server.name)
        return no_store({"tools": found, "unreachable": unreachable})

    @app.post("/tools/{server_name}/{tool_name}")
    async def call_tool_route(server_name: str, tool_name: str, request: Request) -> JSONResponse:
        server = tool_servers.get(server_name)
        if server is None:
            known = ", ".join(sorted(tool_servers)) or "aucun"
            return no_store({"error": f"serveur inconnu : {server_name}. Serveurs : {known}"}, 400)

        raw = await request.body()
        if len(raw) > bounds.max_body:
            return no_store({"error": "charge utile trop grande"}, 400)
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return no_store({"error": "corps illisible"}, 400)

        refusal = gate.allow(address_of(request))
        if refusal is not None:
            return no_store({"error": refusal}, 429)

        arguments = body.get("arguments") if isinstance(body, dict) else None
        try:
            answer = await call_tool(
                server,
                tool_name,
                arguments if isinstance(arguments, dict) else {},
                transport=rpc,
            )
        except McpRefusal as refused:
            return no_store({"error": refused.message}, refused.status)
        return no_store(answer)

    @app.get("/sources")
    async def sources() -> JSONResponse:
        # Découvert à l'exécution : un agent ne lit pas cette liste dans le
        # code du client, il la demande. Ajouter une source ne touche pas au
        # navigateur.
        return no_store({"sources": catalogue()})

    @app.post("/sources/{name}")
    async def source(name: str, request: Request) -> JSONResponse:
        raw = await request.body()
        if len(raw) > bounds.max_body:
            return no_store({"error": "charge utile trop grande"}, 400)
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — un corps illisible est une demande
            return no_store({"error": "corps illisible"}, 400)

        # Sous le même compteur que le raisonnement : une route sortante hors
        # quota serait une porte ouverte avec un autre nom.
        refusal = gate.allow(address_of(request))
        if refusal is not None:
            return no_store({"error": refusal}, 429)

        try:
            found = await fetch_source(
                name,
                str(body.get("query") or "") if isinstance(body, dict) else "",
                fetch=fetch,
            )
        except SourceRefusal as refused:
            return no_store({"error": refused.message}, refused.status)
        return no_store(found)

    @app.get("/runs/{run_id}/trace")
    async def trace(run_id: str) -> JSONResponse:
        archive = store.get(run_id)
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        return no_store(trace_of(run_id, archive))

    @app.get("/evaluation")
    async def evaluation() -> JSONResponse:
        # Sur les runs conservés, sans fournisseur et sans réseau : une
        # évaluation qui coûte un appel de modèle cesse d'être lancée.
        return no_store(evaluate(store.all()).as_json())

    @app.get("/evaluation/{run_id}")
    async def evaluation_of(run_id: str) -> JSONResponse:
        archive = store.get(run_id)
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        one = measure(archive)
        return no_store(
            {
                "events": one.events,
                "agents": one.agents,
                "served": one.served,
                "replacements": one.replacements,
                "rollbacks": one.rollbacks,
                "firstScreenRank": one.first_screen_at,
                "tokens": one.tokens,
                "malformed": one.malformed,
            }
        )

    return app
