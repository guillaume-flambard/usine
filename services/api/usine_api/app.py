"""Le service compagnon.

Il porte ce qu'un onglet ne peut pas porter. Aujourd'hui : le relais de
raisonnement et la capacité. Ensuite, dans cet ordre : la persistance des runs,
la mémoire, l'exécution d'outil en bac à sable, MCP, l'évaluation.

Le contrat HTTP est celui du relais Node qu'il remplace, au champ près. C'est
délibéré : le client n'a pas été modifié par la migration, et c'est la preuve
qu'elle est propre.
"""

from __future__ import annotations

import logging
import os
import secrets
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel

from .archive import (
    MAX_RUN_ARCHIVE_BYTES,
    ArchiveRefused,
    RunArchive,
    export_of,
    file_name,
    parse_archive,
    turns_of,
)
from .atelier import bearer_allows, bearer_of, is_public
from .audit import AuditLog, InMemoryAuditLog
from .cassette import MODES, Cassette, CassetteTransport, Mode, open_cassette
from .chat_stream import STREAM_HEADERS, ChatMessage, ChatRequest, no_model_stream, run_stream
from .checkpoints import open_checkpointer
from .compare import COMPARE_BUDGET, CompareRequest, compare, load_cases
from .contracts import GateDecision
from .contracts import action as action_contract
from .erasure import Erasure, erasure_for
from .evaluation import evaluate, measure
from .flotte import lire as lire_flotte
from .fork import (
    CheckpointSummary,
    ForkRefused,
    ForkRequest,
    UnknownCheckpoint,
    fork_run,
    history_of,
    summarise,
)
from .graph.planner import ChatModelPlanner
from .graph.specialist import ChatModelSpecialist
from .graph.supervisor import ActionExecutor, Planner, build_graph
from .history import CheckpointState, RunHistory, history_of_thread, state_page
from .identity import (
    SESSION_TTL_SECONDS,
    EmailSender,
    Identity,
    IdentityStore,
    InMemoryIdentityStore,
    InMemorySessionStore,
    InMemoryTokenStore,
    LoggingEmailSender,
    SessionStore,
    SmtpEmailSender,
    TokenStore,
    normalize_email,
)
from .invites import etat as etat_invites
from .invites import etiqueter as etiqueter_invite_langfuse
from .limits import Limits, RateLimiter
from .mcp import (
    TIMEOUT_SECONDS,
    McpRefusal,
    Server,
    call_tool,
    list_tools,
    remember_session,
    session_headers,
)
from .mcp_auth import (
    SCOPES,
    InMemoryMcpAuthStore,
    McpAudit,
    McpAuthStore,
    McpBearer,
    McpSecret,
    McpToken,
    McpTokenRequest,
    scope_allows,
)
from .mcp_registry import Registry, RegistryRefusal
from .memory import MAX_FACT, Fact, InMemoryMemory, Memory
from .models import ModelSettings, model_settings
from .oidc import (
    STATE_COOKIE,
    STATE_TTL_SECONDS,
    OidcClient,
    OidcRefused,
    account_email,
    oidc_settings,
)
from .portes import Absent as PortesAbsent
from .portes import dossier as portes_dir
from .portes import lancer as lancer_portes
from .portes import lire as read_portes
from .portes import lister as list_portes
from .portes import suivre as suivre_portes
from .reasoning import (
    DEFAULT_MODEL,
    ENDPOINT,
    OPENROUTER_REASONING_OFF,
    Reasoning,
    Refusal,
    reason,
)
from .runs import InMemoryRunStore, RunStore, Stored, new_id, read_archive
from .settings import database_url
from .sources import SourceRefusal, catalogue, fetch_source
from .specialists import UnknownSpecialist
from .specialists.contract import Specialist
from .threads import InMemoryThreadIndex, RunDetail, RunSummary, ThreadIndex
from .tracing import trace_of

logger = logging.getLogger("usine.service")


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


#: La liste blanche des serveurs d'outils (MEM-37), versionnée avec le dépôt.
def _mcp_config_path() -> Path:
    return Path(__file__).resolve().parents[3] / "config" / "mcp-servers.yaml"


def _allowed_tools(whitelist: Registry, server: str) -> set[str] | None:
    """The tool names the whitelist allows, or None when nothing is declared."""
    try:
        registered = whitelist.resolve(server)
    except RegistryRefusal:
        return set()
    return {tool.name for tool in registered.tools}


#: La cassette livrée avec le service : le run que la vitrine rejoue sans clé.
DEMO_CASSETTE = Path(__file__).resolve().parents[1] / "cassettes" / "demo.json"


def _cassette_path() -> Path:
    """Où lire ou écrire la cassette. Un chemin relatif part de services/api."""
    raw = os.environ.get("USINE_CASSETTE", "")
    path = Path(raw) if raw else DEMO_CASSETTE
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    return path


def _cassette_setting() -> tuple[Cassette | None, str]:
    """La cassette demandée par la configuration, et son mode.

    Aucune cassette n'est active par défaut, même avec `cassettes/demo.json` sur
    le disque : un déploiement qui n'a plus de modèle doit le dire, pas se
    rabattre en silence sur un run enregistré. `USINE_CASSETTE` l'active.
    """
    raw = os.environ.get("USINE_CASSETTE", "")
    mode = os.environ.get("USINE_CASSETTE_MODE", "") or "replay"
    if mode not in MODES:
        raise ValueError(f"USINE_CASSETTE_MODE doit être l'un de {', '.join(MODES)}")
    if not raw:
        return None, mode
    chosen = cast(Mode, mode)
    return open_cassette(_cassette_path(), chosen), chosen


async def http_rpc(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Un appel JSON-RPC vers un serveur d'outils. Remplacé dans les tests.

    Un serveur avec état (FastMCP, donc le nôtre) donne une session à la poignée
    de main et refuse ensuite ce qui ne la porte pas : l'en-tête est retenu par
    `mcp` à chaque réponse et renvoyé ici.
    """
    # Le délai vient du module qui connaît le protocole, pas d'un nombre
    # recopié ici : deux valeurs finiraient par diverger.
    async with httpx.AsyncClient(timeout=float(TIMEOUT_SECONDS)) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"accept": "application/json, text/event-stream", **session_headers(url)},
        )
        remember_session(url, dict(response.headers))
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


def _default_email_sender() -> EmailSender:
    """SMTP si l'environnement le configure, sinon un journal (dev).

    En prod, `SMTP_HOST` déclenche l'envoi réel ; en dev, on journalise le lien
    plutôt que de joindre un serveur — honnête sur ce qu'il fait.
    """
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        return LoggingEmailSender()
    return SmtpEmailSender(
        host=host,
        port=int(os.environ.get("SMTP_PORT", "587")),
        username=os.environ.get("SMTP_USER", ""),
        password=os.environ.get("SMTP_PASSWORD", ""),
        sender=os.environ.get("SMTP_FROM", "atelier@memolabs.dev"),
        use_tls=os.environ.get("SMTP_TLS", "1") != "0",
    )


class RunPage(BaseModel):
    """Une page de runs, et le curseur de la suivante (absent à la fin)."""

    items: list[RunSummary]
    next_cursor: str | None = None


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
    identities: IdentityStore | None = None,
    tokens: TokenStore | None = None,
    sessions: SessionStore | None = None,
    email: EmailSender | None = None,
    audit: AuditLog | None = None,
    secure_cookies: bool = True,
    planner: Planner | None = None,
    specialist: Specialist | None = None,
    specialists: Mapping[str, Specialist] | None = None,
    threads: ThreadIndex | None = None,
    registry: Registry | None = None,
    mcp_auth: McpAuthStore | None = None,
    internal_secret: str | None = None,
    executor: ActionExecutor | None = None,
    open_atelier: bool | None = None,
    oidc: OidcClient | None = None,
) -> FastAPI:
    """Construit le service. Tout ce qui touche l'extérieur est injectable."""
    bounds = limits or Limits()
    gate = limiter or RateLimiter(bounds)

    # L'atelier est fermé par défaut (MEM-60, ADR 0002) : sans identité, ses
    # routes répondent 401. Seul `USINE_ATELIER_OUVERT=1`, pour le dev et les
    # tests, l'ouvre. Fermé, il ne connecte que par Pocket ID : le lien
    # magique, qui donnerait un compte à n'importe quel e-mail, est coupé.
    atelier_open = (
        open_atelier
        if open_atelier is not None
        else os.environ.get("USINE_ATELIER_OUVERT", "") == "1"
    )
    if oidc is None and not atelier_open:
        found = oidc_settings(dict(os.environ))
        if found is not None:
            oidc = OidcClient(found, httpx.AsyncClient(timeout=10))
    if atelier_open:
        logger.warning("atelier ouvert (USINE_ATELIER_OUVERT=1) : aucune route n'exige d'identité")
    elif oidc is None:
        logger.warning("atelier fermé sans Pocket ID configuré : personne ne peut s'y connecter")

    # Postgres si une base est fournie et qu'aucun store n'a été injecté (les
    # tests injectent leurs impls en mémoire). Sinon on reste en mémoire, et la
    # CI n'a besoin ni de base ni d'SMTP.
    db_url = database_url()
    stores_needed = any(dep is None for dep in (runs, identities, tokens, sessions))
    pg = None
    if db_url and stores_needed:
        from .postgres import PostgresStores

        pg = PostgresStores(db_url)

    store: RunStore = runs or (pg.runs if pg is not None else InMemoryRunStore())
    # L'index des runs v2 (MEM-18) : un run est un thread LangGraph.
    index: ThreadIndex = threads or (pg.threads if pg is not None else InMemoryThreadIndex())
    # L'identité, derrière ses ports.
    people: IdentityStore = identities or (
        pg.identities if pg is not None else InMemoryIdentityStore()
    )
    links: TokenStore = tokens or (pg.tokens if pg is not None else InMemoryTokenStore())
    seats: SessionStore = sessions or (pg.sessions if pg is not None else InMemorySessionStore())
    # L'email : SMTP si configuré, journal sinon (dev). Un test injecte le sien.
    mailer: EmailSender = email or _default_email_sender()
    journal: AuditLog = audit or (pg.audit if pg is not None else InMemoryAuditLog())
    # Les jetons du serveur MCP (MEM-40) : lecture et fork, révocables, jamais
    # en clair dans la table. Un hachage ne prouve pas qu'il est révocable.
    auth: McpAuthStore = mcp_auth or (pg.mcp_auth if pg is not None else InMemoryMcpAuthStore())
    # La clé partagée avec le serveur MCP : sans elle, pas d'introspection. Une
    # clé non configurée refuse tout, au lieu d'ouvrir le serveur par défaut.
    shared: str = (
        internal_secret
        if internal_secret is not None
        else os.environ.get("USINE_INTERNAL_SECRET", "")
    )
    # L'effacement traverse cinq stores : il est tout-ou-rien quand ils sont
    # bien ceux d'un même pool, et honnêtement séquentiel sinon.
    eraser: Erasure = erasure_for(
        pg, runs=store, identities=people, tokens=links, sessions=seats, audit=journal
    )
    # Nommés par nous, comme les sources. Vide par défaut : un serveur d'outils
    # est une décision de déploiement, pas un défaut qu'on découvre.
    # Les serveurs d'outils viennent de la liste blanche (MEM-37), jamais d'un
    # modèle : `servers` n'est là que pour les tests.
    whitelist: Registry = registry or Registry.load(_mcp_config_path())
    # Un `servers` injecté (tests) EST la liste : on ne filtre pas par-dessus une
    # liste blanche qui ne le connaît pas. En production, `servers` est vide et
    # la liste blanche fait autorité.
    filtering = registry is not None or servers is None
    tool_servers: dict[str, Server] = servers or whitelist.servers()
    recollection: Memory = memory if memory is not None else InMemoryMemory()
    rpc = transport if transport is not None else http_rpc
    # Le modèle passe par le LiteLLM du lab (MEM-13) : le service ne lit plus
    # aucune clé de fournisseur, seulement la sienne auprès de LiteLLM. Le choix
    # du modèle, le repli et le paramètre qui coupe le raisonnement suivent
    # `usine_api.models`. Sans passerelle configurée, seule une clé injectée
    # (tests) parle encore au point d'accès par défaut.
    gateway = model_settings()
    if gateway is not None:
        api_key = key if key is not None else gateway.api_key
        provider_endpoint = f"{gateway.base_url}/chat/completions"
        chosen_model = model or gateway.model
        reasoning_off = dict(gateway.extras)
    else:
        api_key = key or ""
        provider_endpoint = ENDPOINT
        chosen_model = model or DEFAULT_MODEL
        reasoning_off = OPENROUTER_REASONING_OFF
    # Le planificateur et le spécialiste du chat : injectés par les tests, sinon
    # un modèle par LiteLLM, sinon aucun (le chat le dit, il ne tombe pas).
    chat_planner: Planner | None = planner
    chat_specialist: Specialist | None = specialist
    # Le rejeu (MEM-24) : une cassette remplace la passerelle, et seulement
    # quand la configuration le demande (`USINE_CASSETTE`). Rien ne se rabat en
    # silence sur un run enregistré. Sans clé, la vitrine montre alors un vrai
    # run enregistré plutôt qu'une animation ; la cassette dit son brief, et le
    # service le dit à l'écran.
    cassette, cassette_mode = _cassette_setting()
    cassette_client: httpx.AsyncClient | None = None
    if cassette is not None:
        cassette_client = httpx.AsyncClient(
            transport=CassetteTransport(cassette, cassette_mode, path=_cassette_path())
        )
        replay_settings = ModelSettings(
            base_url="http://cassette.invalid/v1", api_key="replay", model=cassette.model
        )
        chat_planner = chat_planner or ChatModelPlanner(
            replay_settings, http_client=cassette_client
        )
        chat_specialist = chat_specialist or ChatModelSpecialist(
            replay_settings, http_client=cassette_client
        )
        logger.warning(
            "cassette %s (%s) : les appels au modèle sont rejoués, le brief est « %s »",
            _cassette_path(),
            cassette_mode,
            cassette.brief,
        )
    if os.environ.get("USINE_SCRIPTED_MODELS") == "1":
        # Modèles scriptés, déterministes : le test de bout en bout de la CI
        # (MEM-19), qui n'a ni modèle ni réseau. Jamais par défaut.
        from .graph.scripted import ScriptedPlanner, ScriptedSpecialist

        logger.warning("USINE_SCRIPTED_MODELS=1 : modèles scriptés, réservés aux tests")
        chat_planner = chat_planner or ScriptedPlanner()
        chat_specialist = chat_specialist or ScriptedSpecialist()
    if gateway is not None:
        chat_planner = chat_planner or ChatModelPlanner(gateway)
        chat_specialist = chat_specialist or ChatModelSpecialist(gateway)
    # Quelles implémentations ce service sait faire tourner, par nom (MEM-33) :
    # c'est ce que le fork peut épingler sur une branche, et ce que l'écran
    # propose. Le registre (MEM-27) catalogue les adaptateurs ; ici on tient les
    # instances réellement câblées, avec le bon client et la bonne passerelle.
    wired: dict[str, Specialist] = dict(specialists or {})
    if chat_specialist is not None and "chat-model" not in wired:
        wired["chat-model"] = chat_specialist
    if gateway is not None:
        # Le second framework réel (MEM-31) : le même service propose le juge
        # typé, et un fork peut épingler l'un ou l'autre.
        from .specialists.openai_agents import OpenAIAgentsSpecialist
        from .specialists.pydantic_verdict import PydanticVerdictSpecialist

        wired.setdefault(
            "pydantic-verdict",
            PydanticVerdictSpecialist(
                gateway,
                http_client=cassette_client,
                mcp_servers=tuple(tool_servers.values()),
                transport=rpc,
            ),
        )
        wired.setdefault(
            "openai-agents", OpenAIAgentsSpecialist(gateway, http_client=cassette_client)
        )
        try:
            # CrewAI ne cohabite pas avec Pydantic AI (openai<3 contre >=3.31) :
            # il vit dans son propre environnement, et ce service ne l'annonce
            # que s'il est réellement installé (scripts/compare-one.py).
            from .specialists.crewai import CrewAISpecialist

            wired.setdefault("crewai", CrewAISpecialist(gateway))
        except ImportError:
            pass
        if whitelist.names():
            # Le spécialiste à outils (MEM-38) n'existe que si la liste blanche
            # nomme au moins un serveur : sans serveur, pas d'agent sans outils.
            from .specialists.mcp_agent import McpAgentSpecialist

            wired.setdefault(
                "mcp-agent",
                McpAgentSpecialist(
                    gateway,
                    registry=whitelist,
                    transport=rpc,
                    http_client=cassette_client,
                ),
            )
    site_origin = origin or os.environ.get("USINE_ORIGIN", "https://usine.memolabs.dev")
    if not api_key:
        # Un déploiement dégradé doit se remarquer, pas servir un rejeu en silence.
        logger.warning("aucune clé fournisseur configurée : la page rejouera une démonstration")

    @asynccontextmanager
    async def lifespan(app_: FastAPI) -> AsyncIterator[None]:
        # Le checkpointer LangGraph (MEM-12) vit le temps du service : Postgres
        # si une base est configurée, mémoire sinon. Le pool des stores est déjà
        # ouvert ; à l'arrêt, on le ferme proprement plutôt que de le laisser au
        # ramasse-miettes.
        async with open_checkpointer(db_url if stores_needed else "") as saver:
            app_.state.checkpointer = saver
            # Le graphe du chat (MEM-14) vit le temps du service, sur le même
            # checkpointer : un thread se reprend d'un message à l'autre.
            app_.state.chat_graph = (
                build_graph(
                    chat_planner,
                    chat_specialist,
                    specialists=wired,
                    checkpointer=saver,
                    executor=executor,
                )
                if chat_planner is not None and chat_specialist is not None
                else None
            )
            yield
        if pg is not None:
            pg.pool.close()

    app = FastAPI(
        title="Usine agentique — service",
        docs_url=None,
        redoc_url=None,
        # Le contrat de l'API v2, servi et versionné (services/api/openapi.json,
        # comparé en CI par tests/test_runs_api.py).
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def atelier_lock(request: Request, call_next: Any) -> Response:
        # Défini avant `harden`, donc à l'intérieur : un 401 reçoit aussi ses
        # en-têtes. Refus par défaut ; seules les routes de `PUBLIC_ROUTES`
        # passent sans identité.
        if atelier_open or is_public(request.method, request.url.path):
            return await call_next(request)
        if identity_of(request) is None and mcp_token_of(request) is None:
            return JSONResponse(
                {"detail": "Connexion requise."},
                status_code=401,
                headers={"cache-control": "no-store"},
            )
        return await call_next(request)

    @app.middleware("http")
    async def harden(request: Request, call_next: Any) -> Response:
        # Défense en profondeur : le navigateur refuse de lui-même le détournement
        # de type, l'encadrement en iframe et la fuite de référent. N'écrase pas
        # le `cache-control: no-store` posé par les réponses.
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    def no_store(body: dict[str, Any], status: int = 200) -> JSONResponse:
        # Rien de ce que rend ce service n'est cachable : une capacité mise en
        # cache est une capacité fausse.
        return JSONResponse(body, status_code=status, headers={"cache-control": "no-store"})

    #: Le cookie qui porte la session. HTTP-only : le script de la page ne le lit
    #: jamais, comme la clé fournisseur ne le touche jamais (règle projet).
    SESSION_COOKIE = "usine_session"

    def set_session(response: Response, session_id: str) -> None:
        response.set_cookie(
            SESSION_COOKIE,
            session_id,
            httponly=True,
            secure=secure_cookies,
            samesite="lax",
            max_age=SESSION_TTL_SECONDS,
            path="/",
        )

    def identity_of(request: Request) -> Identity | None:
        """L'identité derrière le cookie de session, ou `None`."""
        session_id = request.cookies.get(SESSION_COOKIE)
        if not session_id:
            return None
        account_id = seats.account(session_id)
        if account_id is None:
            return None
        return people.by_account(account_id)

    def mcp_token_of(request: Request) -> McpToken | None:
        """Le jeton MCP de la requête, s'il est valide et ouvre cette route.

        Avant MEM-60, l'API ignorait ce jeton : le serveur MCP lisait l'espace
        des visiteurs anonymes au lieu de celui de l'organisation du jeton.
        """
        token = bearer_of(request.headers.get("authorization", ""))
        if token is None:
            return None
        found = auth.verify(token)
        if found is None or not bearer_allows(found.scope, request.method, request.url.path):
            return None
        return found

    def viewer_org(request: Request) -> str | None:
        """L'org derrière la session ou le jeton MCP, ou `None` pour un anonyme."""
        who = identity_of(request)
        if who is not None:
            return who.organization.id
        token = mcp_token_of(request)
        return token.org if token is not None else None

    def owns_run(request: Request, run_id: str) -> bool:
        """Le run appartient-il, vivant, à l'org derrière la session ?

        La mémoire est indexée par run, donc elle suit l'autorisation du run,
        comme la trace et l'évaluation. Les routes de mémoire dataient d'avant
        la multi-tenance et n'avaient jamais été repassées : n'importe qui
        pouvait y écrire, y lire et y effacer.
        """
        org = viewer_org(request)
        if org is None:
            return False
        return any(known == run_id for known, _entry in store.list_for(org))

    def note(org: str, action: str, target: str) -> None:
        """Trace une action sensible, sans jamais bloquer l'action elle-même."""
        # Un journal muet ne fait pas échouer un partage : l'action utile prime.
        with suppress(Exception):
            journal.record(org, action, target)

    @app.post("/api/chat")
    async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
        # La route garde son préfixe /api : c'est l'adresse par défaut de
        # useChat, et le proxy de Vite le transmet tel quel.
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            return StreamingResponse(no_model_stream(), headers=STREAM_HEADERS)
        # L'id du compte, jamais l'email : c'est ce qui part vers Langfuse.
        who = identity_of(request)
        user_id = who.account.id if who is not None else None
        # A branch pinned to another specialist (MEM-33) keeps it on the next
        # message too: the thread is the one that remembers, not the browser.
        owner = viewer_org(request)
        existing = index.get(body.id, owner) if body.id else None
        return StreamingResponse(
            run_stream(
                graph,
                body,
                user_id=user_id,
                index=index,
                owner=owner,
                specialist=existing.specialist if existing is not None else None,
            ),
            headers=STREAM_HEADERS,
        )

    @app.get("/api/runs", response_model=RunPage, tags=["runs"])
    def list_threads(
        request: Request,
        cursor: str | None = None,
        limit: int = Query(20, ge=1, le=100),
    ) -> RunPage:
        """Les runs de l'organisation (ou du visiteur anonyme), du plus récent au plus ancien."""
        try:
            items, next_cursor = index.page(viewer_org(request), cursor, limit)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="Curseur illisible.") from error
        return RunPage(items=items, next_cursor=next_cursor)

    async def pending_gate(request: Request, thread_id: str) -> Any:
        """L'état du thread s'il attend une décision humaine (MEM-20), sinon None."""
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            return None
        state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
        return state if state.interrupts else None

    @app.get("/api/runs/{thread_id}", response_model=RunDetail, tags=["runs"])
    async def open_thread(thread_id: str, request: Request) -> RunDetail:
        """Un run et ses tours : brief, réponse et événements, pour rejouer la scène.

        Un run qui attend une décision porte `status: waiting` et sa porte (`gate`).
        """
        detail = index.get(thread_id, viewer_org(request))
        if detail is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        waiting = await pending_gate(request, thread_id)
        if waiting is not None:
            return detail.model_copy(update={"gate": waiting.interrupts[0].value})
        return detail

    @app.post("/api/runs/{thread_id}/gate", tags=["runs"])
    async def decide_gate(thread_id: str, decision: GateDecision, request: Request) -> Response:
        """Répond à la porte humaine : approuver, rejeter avec un motif, ou modifier puis approuver.

        Passé le délai (24 h), toute décision compte comme un rejet : une action
        irréversible ne part jamais sur une approbation périmée.
        """
        owner = viewer_org(request)
        # Décider d'une action irréversible demande une identité : les visiteurs
        # anonymes partagent un même espace, et l'un ne doit jamais approuver
        # l'action d'un autre.
        if owner is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour décider.")
        detail = index.get(thread_id, owner)
        if detail is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        waiting = await pending_gate(request, thread_id)
        if waiting is None:
            raise HTTPException(status_code=409, detail="Ce run n'attend aucune décision.")
        if decision.decision == "edit":
            # Une modification change le contenu, jamais la nature ni la cible :
            # elle ne peut pas faire approuver une action que personne n'a proposée.
            proposed = {(a["kind"], a["target"]) for a in waiting.interrupts[0].value["actions"]}
            if any((a.kind, a.target) not in proposed for a in decision.actions or []):
                raise HTTPException(
                    status_code=422,
                    detail="Une modification garde le genre et la cible des actions proposées.",
                )
        # Une seule décision par porte : la seconde, concurrente, perd ici.
        if not index.claim_gate(thread_id, owner):
            raise HTTPException(status_code=409, detail="Une décision est déjà en cours.")
        opened = datetime.fromisoformat(waiting.created_at)
        if (datetime.now(UTC) - opened).total_seconds() > action_contract.GATE_TIMEOUT_SECONDS:
            decision = GateDecision(decision="reject", reason="Délai dépassé : la porte a expiré.")
        brief = str(waiting.values.get("brief", ""))
        body = ChatRequest(
            id=thread_id,
            messages=[ChatMessage(role="user", parts=[{"type": "text", "text": brief}])],
        )
        who = identity_of(request)
        return StreamingResponse(
            run_stream(
                request.app.state.chat_graph,
                body,
                user_id=who.account.id if who is not None else None,
                index=index,
                owner=owner,
                command=Command(resume=decision.model_dump(mode="json")),
                specialist=detail.specialist,
            ),
            headers=STREAM_HEADERS,
        )

    @app.post("/api/runs/{thread_id}/resume", tags=["runs"])
    async def resume_thread(thread_id: str, request: Request) -> Response:
        """Reprend un run interrompu depuis son dernier checkpoint, en flux."""
        detail = index.get(thread_id, viewer_org(request))
        if detail is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            return StreamingResponse(no_model_stream(), headers=STREAM_HEADERS)
        state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
        if state.interrupts:
            raise HTTPException(
                status_code=409,
                detail="Ce run attend une décision : POST /api/runs/{id}/gate.",
            )
        if "act" in state.next:
            # Des actions approuvées ont été coupées en cours d'exécution :
            # reprendre les relancerait toutes, y compris celles déjà parties.
            raise HTTPException(
                status_code=409,
                detail="Des actions approuvées ont été interrompues : les relancer "
                "pourrait les exécuter deux fois.",
            )
        if not state.next:
            raise HTTPException(status_code=409, detail="Ce run n'a rien à reprendre.")
        brief = str(state.values.get("brief", ""))
        if not brief:
            # A branch seeded at the entry point keeps its brief in a pending
            # input write, not in its state: a fork stream that was cut before
            # its first super-step leaves nothing to resume by name.
            raise HTTPException(
                status_code=409,
                detail="Ce run n'a pas encore exécuté son brief : relancez le fork.",
            )
        body = ChatRequest(
            id=thread_id,
            messages=[ChatMessage(role="user", parts=[{"type": "text", "text": brief}])],
        )
        who = identity_of(request)
        return StreamingResponse(
            run_stream(
                graph,
                body,
                user_id=who.account.id if who is not None else None,
                index=index,
                owner=viewer_org(request),
                resume=True,
                specialist=detail.specialist,
            ),
            headers=STREAM_HEADERS,
        )

    @app.get("/api/runs/{thread_id}/checkpoints", tags=["runs"])
    async def list_checkpoints(thread_id: str, request: Request) -> list[CheckpointSummary]:
        """Les points où le run peut être rejoué, du plus récent au plus ancien (MEM-23)."""
        if index.get(thread_id, viewer_org(request)) is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            return []
        config = {"configurable": {"thread_id": thread_id}}
        states = history_of([state async for state in graph.aget_state_history(config)])
        return [summarise(state) for state in states]

    @app.get("/api/runs/{thread_id}/history", tags=["runs"])
    async def run_history(thread_id: str, request: Request) -> RunHistory:
        """Les checkpoints du run et de ses branches, en arbre, sans l'état (MEM-22)."""
        owner = viewer_org(request)
        if index.get(thread_id, owner) is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            return RunHistory(thread_id=thread_id, checkpoints=[])
        return await history_of_thread(graph, index, thread_id, owner)

    @app.get("/api/runs/{thread_id}/checkpoints/{checkpoint_id}", tags=["runs"])
    async def checkpoint_state(
        thread_id: str,
        checkpoint_id: str,
        request: Request,
        offset: int = Query(0, ge=0),
        limit: int = Query(20, ge=1, le=100),
    ) -> CheckpointState:
        """L'état d'un checkpoint, par pages de clés (MEM-22)."""
        if index.get(thread_id, viewer_org(request)) is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        graph = getattr(request.app.state, "chat_graph", None)
        page = None
        if graph is not None:
            page = await state_page(graph, thread_id, checkpoint_id, offset, limit)
        if page is None:
            raise HTTPException(status_code=404, detail="Checkpoint introuvable.")
        return page

    @app.get("/api/runs/{thread_id}/export", response_model=RunArchive, tags=["runs"])
    async def export_thread(thread_id: str, request: Request) -> Response:
        """L'archive JSON d'un run terminé, à télécharger (MEM-26)."""
        detail = index.get(thread_id, viewer_org(request))
        if detail is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        try:
            archive = export_of(detail)
        except ArchiveRefused as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return JSONResponse(
            archive.model_dump(mode="json"),
            headers={
                "cache-control": "no-store",
                "content-disposition": f'attachment; filename="{file_name(thread_id)}"',
            },
        )

    @app.post("/api/runs/import", status_code=201, tags=["runs"])
    async def import_thread(request: Request) -> RunDetail:
        """Relit une archive en rejeu : un run neuf, lisible, rien n'est exécuté (MEM-26).

        Connexion requise : sans elle, le run irait dans la liste partagée des
        visiteurs anonymes. Le limiteur compte l'import comme un appel, parce
        qu'aucun appel de modèle ne le ferait à sa place.
        """
        if identity_of(request) is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour importer un run.")
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > MAX_RUN_ARCHIVE_BYTES:
            raise HTTPException(status_code=413, detail="Archive trop lourde.")
        refusal = gate.allow(address_of(request))
        if refusal is not None:
            raise HTTPException(status_code=429, detail=refusal)
        body = bytearray()
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_RUN_ARCHIVE_BYTES:
                raise HTTPException(status_code=413, detail="Archive trop lourde.")
        try:
            archive = parse_archive(bytes(body))
        except ArchiveRefused as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        owner = viewer_org(request)
        thread_id = uuid4().hex
        restored = index.restore(
            thread_id,
            owner,
            archive.run.title,
            archive.run.status,
            archive.run.specialist,
            turns_of(archive, thread_id),
        )
        detail = index.get(thread_id, owner) if restored else None
        if detail is None:  # pragma: no cover - a fresh uuid is never taken
            raise HTTPException(status_code=409, detail="Le run n'a pas pu être importé.")
        return detail

    @app.post("/api/runs/{thread_id}/fork", tags=["runs"])
    async def fork_thread(
        thread_id: str,
        body: ForkRequest,
        request: Request,
        stream: bool = Query(True),
    ) -> Response:
        """Ouvre une branche depuis un checkpoint et la fait diverger, en flux.

        La branche a son propre identifiant (annoncé dans le premier événement)
        et garde son lien à l'origine ; le run d'origine n'est pas modifié. Le
        flux est celui d'une reprise : seuls les nœuds après le point de fork
        s'exécutent, et le modèle est rappelé pour eux.
        """
        owner = viewer_org(request)
        if index.get(thread_id, owner) is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        graph = getattr(request.app.state, "chat_graph", None)
        if graph is None:
            raise HTTPException(
                status_code=503,
                detail="Aucun modèle n'est configuré : un fork rejoue un run, il en faut un.",
            )
        try:
            forked = await fork_run(
                graph, index, thread_id=thread_id, owner=owner, request=body, available=wired
            )
        except UnknownSpecialist as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except UnknownCheckpoint as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except ForkRefused as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        if not stream:
            # `stream=false` ouvre la branche sans la faire tourner : c'est ce
            # qu'un client d'outils (MCP) demande, pour ne jamais exécuter une
            # action à la place d'une personne.
            return no_store(forked.detail.model_dump(mode="json"), 201)
        who = identity_of(request)
        chat_request = ChatRequest(
            id=forked.detail.thread_id,
            messages=[ChatMessage(role="user", parts=[{"type": "text", "text": forked.brief}])],
        )
        return StreamingResponse(
            run_stream(
                graph,
                chat_request,
                user_id=who.account.id if who is not None else None,
                index=index,
                owner=owner,
                resume=True,
                specialist=forked.detail.specialist,
            ),
            headers=STREAM_HEADERS,
        )

    @app.delete("/api/runs/{thread_id}", status_code=204, tags=["runs"])
    async def delete_thread(thread_id: str, request: Request) -> Response:
        """Efface le run : ses checkpoints LangGraph, puis son index.

        Les traces envoyées à Langfuse n'en font pas partie : voir
        docs/securite/modele-de-menace-v2.md (registre des données).
        """
        owner = viewer_org(request)
        if index.get(thread_id, owner) is None:
            raise HTTPException(status_code=404, detail="Run introuvable.")
        await request.app.state.checkpointer.adelete_thread(thread_id)
        index.delete(thread_id, owner)
        return Response(status_code=204)

    @app.post("/api/compare", tags=["runs"])
    async def compare_specialists(body: CompareRequest, request: Request) -> JSONResponse:
        """Le même jeu de cas dans chaque spécialiste, et le rapport (MEM-34).

        Une action d'opérateur, pas de visiteur : elle dépense le quota de
        modèles sur plusieurs cas, donc elle demande une identité.
        """
        if identity_of(request) is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour comparer.")
        chosen = {
            name: instance
            for name, instance in wired.items()
            if not body.specialists or name in body.specialists
        }
        unknown = set(body.specialists or []) - set(wired)
        if unknown:
            raise HTTPException(
                status_code=422, detail=f"spécialiste inconnu : {', '.join(sorted(unknown))}"
            )
        client = None
        from .observability import tracing_configured

        if tracing_configured():
            from langfuse import get_client

            client = get_client()
        report = await compare(chosen, load_cases(), budget=COMPARE_BUDGET, client=client)
        return no_store(report.model_dump(mode="json"))

    @app.post("/api/mcp/tokens", response_model=McpSecret, tags=["mcp"])
    async def create_mcp_token(body: McpTokenRequest, request: Request) -> McpSecret:
        """Un jeton pour le serveur MCP (MEM-40), rendu une seule fois.

        Une action d'opérateur : elle ouvre l'accès à un client externe.
        """
        owner = viewer_org(request)
        if owner is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour un jeton.")
        if body.scope not in SCOPES:
            raise HTTPException(status_code=422, detail=f"portée inconnue : {body.scope}")
        return auth.issue(owner, body.label, body.scope).model_dump(mode="json")

    @app.get("/api/mcp/tokens", tags=["mcp"])
    async def list_mcp_tokens(request: Request) -> JSONResponse:
        owner = viewer_org(request)
        if owner is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour un jeton.")
        return no_store({"items": [token.model_dump(mode="json") for token in auth.list(owner)]})

    @app.delete("/api/mcp/tokens/{token_id}", status_code=204, tags=["mcp"])
    async def revoke_mcp_token(token_id: str, request: Request) -> Response:
        owner = viewer_org(request)
        if owner is None:
            raise HTTPException(status_code=401, detail="Connexion requise pour un jeton.")
        if not auth.revoke(token_id, owner):
            raise HTTPException(status_code=404, detail="Jeton introuvable.")
        journal.record(owner, "mcp/revoke", token_id)
        return Response(status_code=204)

    async def internal(request: Request) -> str:
        """La clé partagée avec le serveur MCP, ou rien."""
        given = request.headers.get("x-usine-internal", "")
        if not shared or not secrets.compare_digest(given.encode(), shared.encode()):
            raise HTTPException(status_code=401, detail="Clé interne refusée.")
        return given

    @app.post("/internal/mcp/verify", tags=["mcp"])
    async def verify_mcp_token(body: McpBearer, request: Request) -> JSONResponse:
        """Ce qu'un jeton MCP autorise, dit à qui en a la clé.

        Le serveur MCP s'adresse ici à chaque outil : une seule autorité pour la
        portée, et le hachage du jeton ne quitte jamais la base.
        """
        await internal(request)
        token = auth.verify(body.token)
        if token is None:
            raise HTTPException(status_code=401, detail="Jeton inconnu ou révoqué.")
        return no_store(
            {
                "id": token.id,
                "org": token.org,
                "label": token.label,
                "scope": token.scope,
            }
        )

    @app.post("/internal/mcp/audit", tags=["mcp"])
    async def audit_mcp_call(body: McpAudit, request: Request) -> Response:
        """Qui a appelé quel outil, et quand (MEM-40). Un secret n'y entre pas."""
        await internal(request)
        token = auth.verify(body.token)
        if token is None:
            raise HTTPException(status_code=401, detail="Jeton inconnu ou révoqué.")
        if not scope_allows(token.scope, body.tool):
            raise HTTPException(status_code=403, detail="Portée insuffisante.")
        journal.record(token.org, f"mcp/{body.tool}", body.target or token.label)
        return Response(status_code=202)

    @app.get("/api/specialists", tags=["runs"])
    async def list_specialists() -> JSONResponse:
        """Les implémentations que ce service sait faire tourner (MEM-33).

        C'est ce que le fork peut épingler, donc ce que l'écran propose : des
        noms, avec l'identité que la trace portera.
        """
        return no_store(
            {
                "items": [
                    {
                        "name": name,
                        "identity": instance.identity.model_dump(mode="json"),
                    }
                    for name, instance in sorted(wired.items())
                ]
            }
        )

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
                # A recorded demo runs a real graph with recorded answers
                # (MEM-24): the page has to say so, and knows which brief it can
                # answer.
                "demo": cassette is not None,
                "demoBrief": cassette.brief if cassette is not None else None,
            }
        )

    @app.get("/portes")
    async def portes_liste() -> JSONResponse:
        # Quels agents portent une décision, et à quel score. L'écran unique
        # l'appelle une fois : interroger les huit agents de la flotte au cas
        # où ferait huit requêtes pour au plus une réponse utile.
        return no_store({"portes": list_portes()})

    @app.get("/portes/{agent}")
    async def portes(agent: str) -> JSONResponse:
        # Lecture seule, et aucun modèle appelé : c'est `lab-infra` qui juge.
        # L'usine montre la mesure et fera décider un humain dessus.
        try:
            return no_store(read_portes(agent))
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)

    @app.post("/portes/{agent}/juger")
    async def juger_portes(agent: str, request: Request) -> JSONResponse:
        # Rend la main tout de suite : une mesure dure plus d'une minute, et un
        # POST qui bloque ce temps-là est ce que la règle du suivi vivant
        # interdit. Le travail continue derrière, l'écran lit l'avancement.
        try:
            corps = await request.json()
        except Exception:  # noqa: BLE001 — un corps absent vaut un corps vide
            corps = {}
        etiquette = str((corps or {}).get("invites") or "candidat")
        dossier = portes_dir()
        if dossier is None:
            return no_store({"error": "aucun dossier de verdicts configuré (PORTES_DIR)"}, 404)
        try:
            lancee = lancer_portes(agent, etiquette, dossier / f"{agent}-{etiquette}.json")
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)
        return no_store(lancee.vue(), 202)

    @app.get("/portes/juger/{identifiant}")
    async def suivi_portes(identifiant: str) -> JSONResponse:
        try:
            return no_store(suivre_portes(identifiant).vue())
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)

    @app.get("/flotte")
    async def flotte() -> JSONResponse:
        # Lecture seule : aucun agent n'est interroge, aucun modele appele.
        # `lab-infra` observe, l'usine montre.
        try:
            return no_store(lire_flotte())
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)

    @app.get("/portes/{agent}/invites")
    async def invites_portes(agent: str) -> JSONResponse:
        try:
            return no_store(etat_invites(agent))
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)

    @app.post("/portes/{agent}/invites/{nom}/etiquette")
    async def etiqueter_invite(agent: str, nom: str, request: Request) -> JSONResponse:
        # Le geste que le correcteur laisse explicitement à un humain quand il
        # ne promeut pas lui-même. Une étiquette est unique dans Langfuse :
        # poser `production` la retire de la version qui l'avait, donc ce point
        # d'entrée change ce que les agents en service utilisent.
        try:
            corps = await request.json()
        except Exception:  # noqa: BLE001 — un corps absent est un corps vide
            corps = {}
        version = (corps or {}).get("version")
        etiquette = str((corps or {}).get("etiquette") or "")
        if not isinstance(version, int):
            return no_store({"error": "version manquante"}, 400)
        try:
            return no_store(etiqueter_invite_langfuse(agent, nom, version, etiquette))
        except PortesAbsent as absent:
            return no_store({"error": absent.message}, 404)

    @app.post("/auth/request-link")
    async def request_link(request: Request) -> JSONResponse:
        if not atelier_open:
            return no_store({"error": "connexion par Pocket ID seulement"}, 404)
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — un corps illisible est une demande
            body = {}
        email = normalize_email(str(body.get("email") or "") if isinstance(body, dict) else "")

        # Sous le compteur : le canal email ne doit pas pouvoir être pilonné.
        refusal = gate.allow(address_of(request))
        if refusal is not None:
            return no_store({"error": refusal}, 429)

        # On envoie seulement si l'email est plausible — mais la réponse est la
        # même dans tous les cas : rien ne dit si un compte existe (pas d'oracle).
        if email:
            token = links.issue(email)
            # Le lien passe par `/api` : c'est le préfixe que le proxy route vers
            # ce service. Bâti sur l'origine publique, pas sur `base_url` (qui,
            # derrière le proxy, porte l'hôte interne).
            link = f"{site_origin}/api/auth/redeem?token={token}"
            mailer.send_link(email, link)
        return no_store({"sent": True})

    @app.get("/auth/redeem")
    async def redeem(request: Request, token: str = "") -> Response:
        if not atelier_open:
            return no_store({"error": "connexion par Pocket ID seulement"}, 404)
        email = links.redeem(token) if token else None
        if email is None:
            # Expiré, utilisé, inconnu : indistincts, et sans session.
            return no_store({"error": "lien invalide ou expiré"}, 400)
        who = people.ensure(email)
        session_id = seats.open(who.account.id)
        # On revient à l'atelier, session posée. La redirection rend le lien
        # cliquable depuis un email : le suivre connecte et ramène à la page.
        response = RedirectResponse(url=site_origin, status_code=303)
        set_session(response, session_id)
        return response

    @app.get("/auth/oidc/login")
    async def oidc_login(request: Request) -> Response:
        """Envoie le navigateur chez Pocket ID (MEM-60)."""
        if oidc is None:
            return no_store({"error": "connexion indisponible"}, 503)
        # Public, donc sous le compteur comme le lien magique.
        refusal = gate.allow(address_of(request))
        if refusal is not None:
            return no_store({"error": refusal}, 429)
        try:
            url, state = await oidc.start()
        except (httpx.HTTPError, OidcRefused):
            logger.exception("Pocket ID injoignable au début de la connexion")
            return no_store({"error": "connexion indisponible"}, 503)
        response = RedirectResponse(url=url, status_code=303)
        response.set_cookie(
            STATE_COOKIE,
            state,
            httponly=True,
            secure=secure_cookies,
            samesite="lax",
            max_age=STATE_TTL_SECONDS,
            path="/",
        )
        return response

    @app.get("/auth/oidc/callback")
    async def oidc_callback(
        request: Request, code: str = "", state: str = "", iss: str | None = None
    ) -> Response:
        """Retour de Pocket ID : tout se vérifie, puis la session est posée."""
        if oidc is None:
            return no_store({"error": "connexion indisponible"}, 503)
        try:
            sub = await oidc.finish(
                code=code, state=state, cookie_state=request.cookies.get(STATE_COOKIE), iss=iss
            )
        except (httpx.HTTPError, OidcRefused) as error:
            # Le détail reste dans le journal : le visiteur n'apprend pas
            # laquelle des vérifications a échoué.
            logger.warning("connexion Pocket ID refusée : %s", error)
            response = no_store({"error": "connexion refusée"}, 403)
            response.delete_cookie(STATE_COOKIE, path="/")
            return response
        # Le compte suit le `sub`, jamais l'e-mail (voir oidc.py).
        who = people.ensure(account_email(sub))
        response = RedirectResponse(url=site_origin, status_code=303)
        set_session(response, seats.open(who.account.id))
        response.delete_cookie(STATE_COOKIE, path="/")
        return response

    @app.get("/auth/session")
    async def session_route(request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"authenticated": False})
        return no_store(
            {
                "authenticated": True,
                "email": who.account.email,
                "org": who.organization.id,
            }
        )

    @app.post("/auth/logout")
    async def logout(request: Request) -> JSONResponse:
        session_id = request.cookies.get(SESSION_COOKIE)
        if session_id:
            seats.close(session_id)
        response = no_store({"loggedOut": True})
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response

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
                endpoint=provider_endpoint,
                reasoning_off=reasoning_off,
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
                **({"truncated": True} if answer.truncated else {}),
            }
        )

    @app.post("/runs")
    async def store_run(request: Request) -> JSONResponse:
        # Conserver un run exige une identité : un run appartient à une org.
        # Un visiteur anonyme fait tourner la démo mais ne persiste rien
        # (dégradation sûre, spec authorization).
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise pour conserver un run"}, 401)

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
        try:
            store.create(run_id, archive, who.organization.id)
        except Stored as collision:
            # `make_id` ne devrait jamais rendre un id déjà pris ; si ça arrive,
            # le dire est plus honnête que d'écraser le run de quelqu'un.
            return no_store({"error": collision.message}, collision.status)
        # Rien d'autre ne ressort : le run est déjà chez celui qui l'a poussé,
        # et le renvoyer doublerait la charge pour rien.
        return no_store({"id": run_id, "events": len(archive.events)}, 201)

    @app.get("/runs")
    async def list_runs(request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        org = who.organization.id
        # `?trashed=1` montre la corbeille du propriétaire ; sinon ses runs vivants.
        trashed = request.query_params.get("trashed") in {"1", "true"}
        runs_of = store.list_trashed(org) if trashed else store.list_for(org)
        return no_store(
            {
                "runs": [
                    {
                        "id": run_id,
                        "brief": entry.archive.brief,
                        "events": len(entry.archive.events),
                        "shared": entry.shared,
                    }
                    for run_id, entry in runs_of
                ]
            }
        )

    @app.get("/runs/{run_id}")
    async def fetch_run(run_id: str, request: Request) -> JSONResponse:
        # Propriétaire, ou run partagé : sinon 404, indistinct d'un run absent.
        archive = store.get(run_id, viewer_org(request))
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        return no_store(archive.as_json())

    @app.post("/runs/{run_id}/share")
    async def share_run(run_id: str, request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        if not store.share(run_id, who.organization.id):
            return no_store({"error": "run inconnu"}, 404)
        note(who.organization.id, "share", run_id)
        return no_store({"shared": True})

    @app.post("/runs/{run_id}/revoke")
    async def revoke_run(run_id: str, request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        if not store.revoke(run_id, who.organization.id):
            return no_store({"error": "run inconnu"}, 404)
        note(who.organization.id, "revoke", run_id)
        return no_store({"shared": False})

    @app.delete("/runs/{run_id}")
    async def delete_run(run_id: str, request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        if not store.delete(run_id, who.organization.id):
            return no_store({"error": "run inconnu"}, 404)
        # Corbeille, pas destruction : réversible. La purge, elle, efface la trace
        # interne — jamais un effet de bord externe (AD-41).
        note(who.organization.id, "trash", run_id)
        return no_store({"trashed": True})

    @app.post("/runs/{run_id}/restore")
    async def restore_run(run_id: str, request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        if not store.restore(run_id, who.organization.id):
            return no_store({"error": "run inconnu"}, 404)
        note(who.organization.id, "restore", run_id)
        return no_store({"restored": True})

    @app.post("/runs/{run_id}/purge")
    async def purge_run(run_id: str, request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        if not store.purge(run_id, who.organization.id):
            return no_store({"error": "run inconnu"}, 404)
        note(who.organization.id, "purge", run_id)
        return no_store({"purged": True})

    @app.get("/audit")
    async def read_audit(request: Request) -> JSONResponse:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        entries = journal.entries(who.organization.id)
        return no_store({"entries": [entry.as_json() for entry in entries]})

    @app.get("/account")
    async def account_summary(request: Request) -> JSONResponse:
        # Droit d'accès : ce qu'on détient sur la personne.
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        org = who.organization.id
        return no_store(
            {
                "email": who.account.email,
                "org": org,
                "runs": len(store.list_for(org)),
                "trashed": len(store.list_trashed(org)),
            }
        )

    @app.get("/account/export")
    async def account_export(request: Request) -> Response:
        # Droit à la portabilité : compte + toutes les archives (vivantes et corbeille).
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        org = who.organization.id
        owned = store.list_for(org) + store.list_trashed(org)
        return JSONResponse(
            {
                "account": {"email": who.account.email, "org": org},
                "runs": [entry.archive.as_json() for _run_id, entry in owned],
            },
            headers={
                "cache-control": "no-store",
                "content-disposition": 'attachment; filename="mes-donnees-usine.json"',
            },
        )

    @app.delete("/account")
    async def account_erase(request: Request) -> JSONResponse:
        # Droit à l'effacement : cascade cross-stores, dans l'ordre des clés
        # étrangères (sessions et org avant compte). Efface la trace interne —
        # jamais un effet de bord externe (AD-41).
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        account_id = who.account.id
        org = who.organization.id
        email = who.account.email
        # Les clés se lisent AVANT : après l'effacement, les runs n'existent
        # plus et la mémoire n'aurait plus de quoi être retrouvée.
        run_ids = [run_id for run_id, _entry in store.list_for(org) + store.list_trashed(org)]

        # Tout ou rien : une exception ici veut dire que rien n'a été effacé,
        # et la personne garde de quoi se reconnecter et réessayer.
        eraser.erase(account_id=account_id, org=org, email=email)

        # La mémoire des runs n'est pas adossée à la base, elle ne peut donc pas
        # entrer dans la transaction. Elle se vide après le commit, à partir des
        # clés lues plus haut. Idempotent, et sans effet si l'effacement a
        # échoué — on n'y arrive pas.
        for run_id in run_ids:
            recollection.forget(run_id)

        response = no_store({"erased": True})
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response

    @app.get("/runs/{run_id}/export")
    async def export_run(run_id: str, request: Request) -> Response:
        who = identity_of(request)
        if who is None:
            return no_store({"error": "connexion requise"}, 401)
        org = who.organization.id
        # Propriétaire seul (pas via lien partagé) : on vérifie qu'il possède ce
        # run vivant avant de le rendre en pièce jointe.
        owned = any(rid == run_id for rid, _ in store.list_for(org))
        if not owned:
            return no_store({"error": "run inconnu"}, 404)
        archive = store.get(run_id, org)
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        return JSONResponse(
            archive.as_json(),
            headers={
                "cache-control": "no-store",
                "content-disposition": f'attachment; filename="run-{run_id}.json"',
            },
        )

    @app.post("/memory/{run_id}")
    async def remember(run_id: str, request: Request) -> JSONResponse:
        # Écrire dans la mémoire d'un run demande de le posséder. Sans ce
        # refus, un tiers y glissait un fait — et la mémoire nourrit les agents
        # des tours suivants, donc c'était une injection d'un locataire à
        # l'autre. 404 plutôt que 403 : indistinct d'un run absent.
        if not owns_run(request, run_id):
            return no_store({"error": "run inconnu"}, 404)
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
        # Lire les faits d'un run demande de pouvoir lire le run : propriétaire
        # ou run partagé, exactement la règle de `GET /runs/{run_id}`.
        if store.get(run_id, viewer_org(request)) is None:
            return no_store({"error": "run inconnu"}, 404)
        query = request.query_params.get("q", "")
        limit = request.query_params.get("limit", "5")
        found = recollection.recall(run_id, query, int(limit) if limit.isdigit() else 5)
        return no_store({"facts": [fact.as_json() for fact in found]})

    @app.delete("/memory/{run_id}")
    async def forget(run_id: str, request: Request) -> JSONResponse:
        # La persistance ne contourne pas la réversibilité, elle la suit : ce
        # qui appartenait à un run part avec lui. Et l'effacer demande de le
        # posséder, comme la corbeille et la purge.
        if not owns_run(request, run_id):
            return no_store({"error": "run inconnu"}, 404)
        return no_store({"forgotten": recollection.forget(run_id)})

    @app.get("/tools")
    async def tools() -> JSONResponse:
        # Découverts à l'exécution : ni le navigateur ni le prompt ne portent
        # la liste. Un serveur ajouté est un outil de plus sans redéploiement
        # du client.
        found: list[dict[str, Any]] = []
        unreachable: list[str] = []
        for server in tool_servers.values():
            allowed = _allowed_tools(whitelist, server.name) if filtering else None
            try:
                discovered = await list_tools(server, transport=rpc)
            except McpRefusal:
                # Un serveur muet ne fait pas taire les autres.
                unreachable.append(server.name)
                continue
            for tool in discovered:
                # Un outil que le serveur propose mais que la liste blanche ne
                # nomme pas n'est jamais exposé à l'agent.
                if allowed is not None and tool.name not in allowed:
                    continue
                found.append(tool.as_json())
        return no_store({"tools": found, "unreachable": unreachable})

    @app.post("/tools/{server_name}/{tool_name}")
    async def call_tool_route(server_name: str, tool_name: str, request: Request) -> JSONResponse:
        server = tool_servers.get(server_name)
        if server is None:
            known = ", ".join(sorted(tool_servers)) or "aucun"
            return no_store({"error": f"serveur inconnu : {server_name}. Serveurs : {known}"}, 400)
        if filtering:
            try:
                # Le niveau de risque décide : un outil irréversible ne part pas ici.
                whitelist.check_call(server_name, tool_name)
            except RegistryRefusal as refused:
                return no_store({"error": refused.message}, refused.status)

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
    async def trace(run_id: str, request: Request) -> JSONResponse:
        archive = store.get(run_id, viewer_org(request))
        if archive is None:
            return no_store({"error": "run inconnu"}, 404)
        return no_store(trace_of(run_id, archive))

    @app.get("/evaluation")
    async def evaluation() -> JSONResponse:
        # Sur les runs conservés, sans fournisseur et sans réseau : une
        # évaluation qui coûte un appel de modèle cesse d'être lancée.
        return no_store(evaluate(store.all()).as_json())

    @app.get("/evaluation/{run_id}")
    async def evaluation_of(run_id: str, request: Request) -> JSONResponse:
        archive = store.get(run_id, viewer_org(request))
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

    # En production, la même image sert la page (MEM-58). Ajouté en dernier,
    # donc à l'extérieur du verrou : la page est publique, l'API ne l'est pas.
    web_dir = os.environ.get("USINE_WEB_DIR", "")
    if web_dir:
        from .spa import page_middleware

        app.middleware("http")(page_middleware(web_dir))

    return app
