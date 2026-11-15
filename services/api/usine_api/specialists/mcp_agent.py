"""Le spécialiste à outils : un agent LangChain nourri par la liste blanche (MEM-38).

C'est le premier spécialiste qui **appelle** des outils. Il ne les connaît pas à
la compilation : il les demande au registre au moment de tourner (`toolbox`),
donc un outil ajouté côté serveur devient disponible sans redéploiement.

Trois choses que ce module ne fait pas, et c'est le sujet :

- il n'appelle **jamais** un outil irréversible : la boîte à outils lui en donne
  une version qui ne fait que produire une `ProposedAction`, et le graphe la
  passe par la porte humaine (MEM-20) ;
- il ne laisse pas un serveur muet arrêter le run : les serveurs indisponibles
  sortent de la boîte avec leur raison, et le run continue ;
- il ne laisse pas un outil traîner : chaque appel est borné par un délai.

`create_agent` (LangChain 1.5) fournit la boucle outil/réponse ; ce qui est à
nous, c'est la boîte à outils, ses refus et ses bornes.
"""

from __future__ import annotations

from importlib.metadata import version
from typing import Any

import httpx
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.mcp import Transport
from usine_api.mcp_registry import Registry
from usine_api.mcp_tools import Toolbox, toolbox
from usine_api.models import ModelSettings, chat_model, current_session_id
from usine_api.specialists import register

INSTRUCTIONS = (
    "Tu es un spécialiste de l'usine agentique. Tu réponds à la tâche en "
    "français. Tu disposes d'outils : utilise-les quand ils répondent mieux "
    "que ta mémoire, et n'invente jamais ce qu'un outil pourrait te donner. "
    "Un outil marqué irréversible ne fait que proposer : une personne décide."
)


def _tokens(messages: list[BaseMessage]) -> int:
    total = 0
    for message in messages:
        usage = getattr(message, "usage_metadata", None) or {}
        total += int(usage.get("total_tokens", 0) or 0)
    return total


def _tool_calls(messages: list[BaseMessage]) -> tuple[str, ...]:
    names: list[str] = []
    for message in messages:
        if isinstance(message, AIMessage):
            names.extend(str(call.get("name", "")) for call in message.tool_calls)
    return tuple(name for name in names if name)


@register("mcp-agent")
class McpAgentSpecialist:
    """`mcp-agent` in the registry: an agent whose tools come from the whitelist."""

    def __init__(
        self,
        settings: ModelSettings,
        *,
        registry: Registry,
        transport: Transport,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.identity = SpecialistIdentity(
            name=f"mcp-agent:{settings.model}",
            framework="langchain",
            framework_version=version("langchain"),
        )
        self._settings = settings
        self._registry = registry
        self._transport = transport
        self._client = http_client

    async def _toolbox(self) -> Toolbox:
        return await toolbox(self._registry, transport=self._transport)

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        from langchain.agents import create_agent

        box = await self._toolbox()
        model = chat_model(
            self._settings,
            http_client=self._client,
            session_id=current_session_id(),
        )
        agent = create_agent(model, box.tools, system_prompt=INSTRUCTIONS)
        result: Any = await agent.ainvoke({"messages": [HumanMessage(task.task)]})

        messages: list[BaseMessage] = list(result.get("messages", []))
        answer = ""
        for message in reversed(messages):
            if (
                isinstance(message, AIMessage)
                and isinstance(message.content, str)
                and message.content.strip()
            ):
                answer = message.content
                break
        return SpecialistOutput(
            answer=answer,
            identity=self.identity,
            tokens=_tokens(messages),
            tool_calls=len(_tool_calls(messages)),
            actions=tuple(box.proposals),
            tools=_tool_calls(messages),
        )
