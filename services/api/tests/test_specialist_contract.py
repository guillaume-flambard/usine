"""La suite de conformité du contrat Specialist (MEM-27).

Elle se rejoue sur **chaque** implémentation : un faux spécialiste (preuve que la
suite est exécutable sans modèle) et l'adaptateur LangChain réel. Le jour où
CrewAI, OpenAI Agents SDK, Pydantic AI et Claude Agent SDK arrivent, ils
s'ajoutent à `IMPLEMENTATIONS` et héritent des mêmes exigences, plutôt que de
chacun réinventer son budget et son identité.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

import httpx
import pytest

from usine_api.contracts import Budget, SpecialistIdentity, SpecialistInput, SpecialistOutput
from usine_api.graph.specialist import ChatModelSpecialist
from usine_api.models import ModelSettings
from usine_api.specialists import REGISTRY, UnknownSpecialist, available, load
from usine_api.specialists.contract import BudgetExceeded, Specialist
from usine_api.specialists.node import as_node, execute

BUDGET = Budget(max_tokens=200, max_seconds=5, max_tool_calls=2)
IDENTITY = SpecialistIdentity(name="fake:echo", framework="test", framework_version="0.0.1")


class FakeSpecialist:
    """A specialist that answers what it is given, and can be told to misbehave."""

    def __init__(self, *, sleep: float = 0.0, tokens: int = 3, tool_calls: int = 0) -> None:
        self.identity = IDENTITY
        self._sleep = sleep
        self._tokens = tokens
        self._tool_calls = tool_calls

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        await asyncio.sleep(self._sleep)
        return SpecialistOutput(
            answer=f"fait : {task.task}",
            identity=self.identity,
            tokens=self._tokens,
            tool_calls=self._tool_calls,
        )


def model_reply(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "c",
            "object": "chat.completion",
            "created": 0,
            "model": "lab-fast",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "fait"},
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
        },
    )


def real_chat_model() -> Specialist:
    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    client = httpx.AsyncClient(transport=httpx.MockTransport(model_reply))
    return ChatModelSpecialist(settings, http_client=client)


#: Every implementation must satisfy the suite below.
IMPLEMENTATIONS: list[tuple[str, Callable[[], Specialist]]] = [
    ("fake", FakeSpecialist),
    ("chat-model", real_chat_model),
]


@pytest.fixture(params=IMPLEMENTATIONS, ids=[name for name, _ in IMPLEMENTATIONS])
def specialist(request: pytest.FixtureRequest) -> Specialist:
    factory = request.param[1]
    made = factory()
    assert isinstance(made, Specialist), "the implementation does not satisfy the protocol"
    return made


async def test_identity_says_who_answered(specialist: Specialist) -> None:
    identity = specialist.identity
    assert identity.name.strip()
    assert identity.framework.strip()
    assert identity.framework_version.strip()


async def test_it_answers_one_task_and_returns_its_own_identity(specialist: Specialist) -> None:
    output = await specialist.run(SpecialistInput(task="écris une phrase", budget=BUDGET, tools=()))
    assert isinstance(output, SpecialistOutput)
    assert isinstance(output.answer, str) and output.answer.strip()
    assert output.identity == specialist.identity
    assert output.tokens >= 0
    assert output.tool_calls >= 0
    assert output.actions == ()


async def test_the_adapter_runs_it_unchanged_within_budget(specialist: Specialist) -> None:
    output = await execute(specialist, "une tâche", BUDGET)
    assert output.answer


def test_a_tool_is_a_name_never_an_address() -> None:
    with pytest.raises(ValueError):
        SpecialistInput(task="t", budget=BUDGET, tools=("https://evil.example/tool",))
    with pytest.raises(ValueError):
        SpecialistInput(task="t", budget=BUDGET, tools=("a/b",))
    entry = SpecialistInput(task="t", budget=BUDGET, tools=("web.search", "mail-send"))
    assert entry.tools == ("web.search", "mail-send")


async def test_going_past_the_duration_budget_is_a_typed_stop() -> None:
    slow = FakeSpecialist(sleep=0.2)
    with pytest.raises(BudgetExceeded) as error:
        await execute(slow, "une tâche", Budget(max_tokens=10, max_seconds=0.02, max_tool_calls=0))
    assert error.value.kind == "durée"


async def test_going_past_the_token_budget_is_a_typed_stop() -> None:
    greedy = FakeSpecialist(tokens=500)
    with pytest.raises(BudgetExceeded) as error:
        await execute(greedy, "une tâche", Budget(max_tokens=10, max_seconds=5, max_tool_calls=0))
    assert error.value.kind == "jetons"
    assert error.value.actual == 500


async def test_going_past_the_tool_budget_is_a_typed_stop() -> None:
    busy = FakeSpecialist(tool_calls=3)
    with pytest.raises(BudgetExceeded) as error:
        await execute(busy, "une tâche", Budget(max_tokens=10, max_seconds=5, max_tool_calls=1))
    assert error.value.kind == "appels d'outils"


async def test_the_node_shape_is_the_graph_one() -> None:
    node = as_node(FakeSpecialist(), BUDGET)
    assert await node({"task": "une tâche"}) == {
        "results": [
            SpecialistOutput(answer="fait : une tâche", identity=IDENTITY, tokens=3, tool_calls=0)
        ]
    }


def test_the_registry_loads_by_name_and_names_what_it_knows() -> None:
    settings = ModelSettings(base_url="http://litellm.test/v1", api_key="sk-test", model="lab-fast")
    assert "chat-model" in available()
    built = load("chat-model", settings=settings)
    assert isinstance(built, ChatModelSpecialist)
    assert built.identity.framework == "langchain"
    with pytest.raises(UnknownSpecialist, match="connus"):
        load("nobody")


def test_a_new_implementation_registers_itself() -> None:
    from usine_api.specialists import register

    @register("conformance-fake")
    class Registered:
        identity = IDENTITY

        async def run(self, task: SpecialistInput) -> SpecialistOutput:
            return SpecialistOutput(answer="ok", identity=IDENTITY, tokens=0, tool_calls=0)

    try:
        assert "conformance-fake" in available()
        assert isinstance(load("conformance-fake"), Registered)
    finally:
        REGISTRY.pop("conformance-fake", None)
