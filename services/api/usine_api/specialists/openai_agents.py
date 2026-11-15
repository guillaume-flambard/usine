"""Le spécialiste OpenAI Agents SDK : un troisième framework (MEM-79).

Il répond à une tâche comme le spécialiste LangChain, mais par le SDK d'OpenAI :
le contrat Specialist est le même, la trace porte un troisième framework, et le
comparateur (MEM-34) gagne une colonne.

Trois points lus dans la version installée (**openai-agents 0.24.0**, `uv.lock`) :

- l'API Responses d'OpenAI n'est pas ce que sert LiteLLM : on passe donc par
  `OpenAIChatCompletionsModel`, qui parle `/v1/chat/completions` ;
- il accepte un `AsyncOpenAI` construit sur notre client HTTP, donc la cassette
  de rejeu (MEM-24) s'applique comme pour les autres ;
- le SDK envoie des traces à OpenAI par défaut : `set_tracing_disabled(True)` au
  chargement du module, parce qu'un run de l'usine ne sort pas de chez nous. Les
  traces de l'usine sont dans Langfuse, pas chez un tiers.

Aucun outil, aucun code exécuté : c'est un appel d'API, pas un agent à outils.
"""

from __future__ import annotations

from importlib.metadata import version
from typing import Any, cast

import httpx

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.models import ModelSettings
from usine_api.specialists import register

INSTRUCTIONS = (
    "Tu es un spécialiste de l'usine agentique. Réponds à la tâche en français, "
    "en trois phrases au plus, sans inventer de fait ni d'adresse."
)


@register("openai-agents")
class OpenAIAgentsSpecialist:
    """`openai-agents` in the registry: the SDK's runner, our gateway."""

    def __init__(
        self,
        settings: ModelSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
        model: Any | None = None,
    ) -> None:
        self.identity = SpecialistIdentity(
            name=f"openai-agents:{settings.model}",
            framework="openai-agents",
            framework_version=version("openai-agents"),
        )
        self._settings = settings
        self._client = http_client
        self._model = model

    def _chat_model(self) -> Any:
        from agents import OpenAIChatCompletionsModel, set_tracing_disabled
        from openai import AsyncOpenAI

        # Nothing leaves for OpenAI's tracing backend: the run is traced in
        # Langfuse, by the graph.
        set_tracing_disabled(True)
        # The SDK declares its own httpx fork (`httpx2`) while the service builds
        # its client with `httpx`: the runtime accepts ours, and the transport
        # test proves it (a cassette answers through this very client). Cast
        # rather than create a second HTTP stack that the cassette would miss.
        client = AsyncOpenAI(
            base_url=self._settings.base_url,
            api_key=self._settings.api_key or "unused",
            http_client=cast(Any, self._client),
            max_retries=0,
        )
        return OpenAIChatCompletionsModel(model=self._settings.model, openai_client=client)

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        from agents import Agent, RunConfig, Runner

        agent = Agent(name="specialiste", instructions=INSTRUCTIONS)
        result = await Runner.run(
            agent,
            task.task,
            run_config=RunConfig(model=self._model or self._chat_model(), tracing_disabled=True),
        )
        usage = result.context_wrapper.usage
        return SpecialistOutput(
            answer=str(result.final_output or "").strip(),
            identity=self.identity,
            tokens=int(usage.total_tokens or 0),
            tool_calls=0,
        )
