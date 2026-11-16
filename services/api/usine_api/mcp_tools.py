"""Les outils MCP, chargés à l'exécution depuis la liste blanche (MEM-38).

Le registre (MEM-37) dit quels serveurs et quels outils existent ; ce module en
fait des outils LangChain appelables par un agent, et rien de plus :

- **découverts à l'exécution** : `tools/list` est demandé au serveur au moment où
  l'agent se construit, pas à la compilation du service. Un outil ajouté côté
  serveur devient disponible sans redéploiement ;
- **filtrés par la liste blanche** : un outil proposé mais non nommé n'existe pas
  pour l'agent ;
- **un serveur injoignable n'arrête pas le run** : il sort du lot avec sa raison,
  et le run continue avec les autres ;
- **le délai est borné par appel** : un serveur qui ne répond pas est un serveur
  qui ne répond pas ;
- **un outil irréversible n'est jamais appelable** : il est rendu comme une
  action proposée, qui passe par la porte humaine (MEM-20).

Les schémas JSON des serveurs sont convertis en modèles Pydantic pour les types
courants (chaîne, nombre, booléen, tableau de chaînes). Un schéma exotique est
signalé indisponible plutôt que deviné : un outil mal décrit est un outil qui
mentirait au modèle.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field, create_model

from usine_api.contracts import ProposedAction
from usine_api.mcp import McpRefusal, Server, Transport, call_tool, list_tools
from usine_api.mcp_registry import Registry, RegistryRefusal

#: Per-call ceiling. The same number as the client's, applied here so a tool
#: that hangs cannot hang the loop that called it.
TOOL_TIMEOUT_SECONDS = 20.0


@dataclass(frozen=True)
class Unavailable:
    server: str
    reason: str


@dataclass
class Toolbox:
    """What an agent may call, and what it cannot."""

    tools: list[BaseTool] = field(default_factory=list)
    unavailable: list[Unavailable] = field(default_factory=list)
    #: Irreversible tools the model reached for; the graph gates them.
    proposals: list[ProposedAction] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "tools": [tool.name for tool in self.tools],
            "unavailable": [
                {"server": item.server, "reason": item.reason} for item in self.unavailable
            ],
        }


def _model_of(name: str, schema: dict[str, Any]) -> type[BaseModel] | None:
    """A Pydantic model for the MCP input schema, or None when it is exotic."""
    properties = (schema or {}).get("properties") or {}
    required = set((schema or {}).get("required") or [])
    fields: dict[str, Any] = {}
    for key, spec in properties.items():
        kind = (spec or {}).get("type")
        annotation: Any
        if kind == "string":
            annotation = str
        elif kind == "integer":
            annotation = int
        elif kind == "number":
            annotation = float
        elif kind == "boolean":
            annotation = bool
        elif kind == "array" and (spec or {}).get("items", {}).get("type") == "string":
            annotation = list[str]
        elif key in required:
            # A required object, union or nested array: not guessed.
            return None
        else:
            # An optional one is left out rather than losing the whole tool:
            # GitHub's `issue_write` carries `issue_fields` (objects) that a
            # plain issue never needs.
            continue
        default = spec.get("default") if isinstance(spec, dict) else None
        if key in required:
            fields[key] = (annotation, Field(..., description=spec.get("description")))
        else:
            fields[key] = (
                annotation | None,
                Field(default, description=spec.get("description")),
            )
    try:
        return create_model(f"{name.title().replace('_', '')}Arguments", **fields)
    except Exception:  # noqa: BLE001 - a bad schema is a missing tool, not a crash
        return None


async def toolbox(
    registry: Registry,
    *,
    transport: Transport,
    timeout: float = TOOL_TIMEOUT_SECONDS,
) -> Toolbox:
    """The tools an agent may use, discovered now, filtered by the whitelist."""
    box = Toolbox()
    for name, server in registry.servers().items():
        registered = registry.resolve(name)
        try:
            discovered = await asyncio.wait_for(list_tools(server, transport=transport), timeout)
        except TimeoutError:
            box.unavailable.append(
                Unavailable(server=name, reason=f"pas de réponse en {timeout:.0f} s")
            )
            continue
        except McpRefusal as refused:
            box.unavailable.append(Unavailable(server=name, reason=refused.message))
            continue

        allowed = {tool.name: tool.risk for tool in registered.tools}
        for found in discovered:
            risk = allowed.get(found.name)
            if risk is None:
                # Proposed by the server, not named by us: it does not exist.
                continue
            if risk == "irreversible":
                box.tools.append(
                    _proposal_tool(box, server, found.name, found.description, found.input_schema)
                )
                continue
            built = _callable_tool(server, found, transport=transport, timeout=timeout)
            if built is None:
                box.unavailable.append(
                    Unavailable(server=name, reason=f"schéma non pris en charge : {found.name}")
                )
                continue
            box.tools.append(built)
    return box


def _callable_tool(
    server: Server,
    found: Any,
    *,
    transport: Transport,
    timeout: float,
) -> BaseTool | None:
    model = _model_of(found.name, found.input_schema)
    if model is None:
        return None

    async def run(**arguments: Any) -> str:
        try:
            answer = await asyncio.wait_for(
                call_tool(server, found.name, _given(arguments), transport=transport), timeout
            )
        except TimeoutError:
            return f"{server.name}/{found.name} n'a pas répondu en {timeout:.0f} s."
        except McpRefusal as refused:
            return f"{server.name}/{found.name} a refusé : {refused.message}"
        return _as_text(answer)

    return StructuredTool.from_function(
        coroutine=run,
        name=f"{server.name}__{found.name}",
        description=found.description or f"{server.name}/{found.name}",
        args_schema=model,
    )


def _proposal_tool(
    box: Toolbox,
    server: Server,
    tool: str,
    description: str,
    input_schema: dict[str, Any],
) -> BaseTool:
    """An irreversible tool, reachable but never run: it becomes a proposal."""
    model = _model_of(tool, input_schema) or create_model("Arguments")

    async def propose(**arguments: Any) -> str:
        box.proposals.append(
            ProposedAction(
                kind="external_write",
                target=f"{server.name}/{tool}",
                justification="l'agent a demandé un outil irréversible",
                # The exact arguments, as JSON: what the person reads, may edit,
                # and what the executor sends once approved (McpExecutor).
                preview=json.dumps(_given(arguments), ensure_ascii=False, indent=2),
            )
        )
        return (
            f"« {server.name}/{tool} » est irréversible : rien n'a été exécuté. "
            "La demande part en porte humaine, une personne décide."
        )

    return StructuredTool.from_function(
        coroutine=propose,
        name=f"{server.name}__{tool}",
        description=(
            f"{description or tool} (IRRÉVERSIBLE : l'appel ne fait que proposer, "
            "une personne décide ensuite)"
        ),
        args_schema=model,
    )


def _given(arguments: dict[str, Any]) -> dict[str, Any]:
    """The arguments the agent set: an unset optional is not sent as null."""
    return {key: value for key, value in arguments.items() if value is not None}


def _as_text(payload: Any) -> str:
    """What a tool returns to the model: text, never a live object."""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        # The client's own shape (mcp.call_tool) already extracted the text.
        if isinstance(payload.get("text"), str):
            return str(payload["text"])
        content = payload.get("content")
        if isinstance(content, list):
            parts = [
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ]
            if parts:
                return "\n".join(parts)
    return json.dumps(payload, ensure_ascii=False)[:4000]


class McpExecutor:
    """Carries out an action a person approved at the gate (MEM-20).

    Only a tool the whitelist marks irreversible comes through here, and only
    after the gate: the registry refuses those calls to an agent
    (`Registry.check_call`), this is the one path that runs them. The arguments
    are the preview the person read, or edited, at the gate.
    """

    def __init__(
        self,
        registry: Registry,
        *,
        transport: Transport,
        timeout: float = TOOL_TIMEOUT_SECONDS,
    ) -> None:
        self._registry = registry
        self._transport = transport
        self._timeout = timeout

    async def execute(self, action: ProposedAction) -> str:
        name, _, tool = action.target.partition("/")
        try:
            registered = self._registry.resolve(name)
            risk = registered.risk_of(tool)
        except RegistryRefusal as refused:
            return f"non exécutée : {refused.message}"
        if risk != "irreversible":
            return f"non exécutée : {action.target} ne passe pas par la porte"
        try:
            arguments = json.loads(action.preview)
        except ValueError:
            return "non exécutée : les arguments approuvés ne sont pas du JSON"
        if not isinstance(arguments, dict):
            return "non exécutée : les arguments approuvés ne sont pas un objet JSON"
        try:
            answer = await asyncio.wait_for(
                call_tool(registered.server(), tool, arguments, transport=self._transport),
                self._timeout,
            )
        except TimeoutError:
            # The server may have acted before going silent: say what is known.
            return (
                f"état inconnu : {action.target} n'a pas répondu en {self._timeout:.0f} s, "
                "vérifier avant de relancer"
            )
        except McpRefusal as refused:
            return f"échec : {refused.message}"
        text = str(answer.get("text", ""))[:600]
        return f"échec : {text}" if answer.get("failed") else f"exécutée : {text}"


__all__ = ["TOOL_TIMEOUT_SECONDS", "McpExecutor", "Toolbox", "Unavailable", "toolbox"]
