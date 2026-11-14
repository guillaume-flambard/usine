"""Which gateway the service calls, and with which reasoning parameter (MEM-13).

Every model call goes through the lab's LiteLLM. What is checked here is not a
comfort setting: a provider key read by the API would be a second place for
keys and quotas, and the parameter that turns reasoning off must reach the
gateway under the name its routes drop when they do not know it. A wrong
address/parameter pair does not raise, it produces empty answers.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_relay_contract import Spy, ask
from usine_api.app import create_app


def build(monkeypatch: pytest.MonkeyPatch, **env: str) -> tuple[TestClient, Spy]:
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    spy = Spy()
    return TestClient(create_app(call=spy)), spy


def sent(spy: Spy) -> dict[str, Any]:
    assert len(spy.calls) == 1
    return spy.calls[0]


def test_the_lab_litellm_is_called(monkeypatch: pytest.MonkeyPatch) -> None:
    client, spy = build(
        monkeypatch, LITELLM_BASE_URL="http://litellm:4000/v1/", LITELLM_API_KEY="sk-usine"
    )
    assert ask(client).status_code == 200
    call = sent(spy)
    assert call["url"] == "http://litellm:4000/v1/chat/completions"
    assert call["headers"]["authorization"] == "Bearer sk-usine"
    assert call["payload"]["model"] == "lab-fast"
    assert call["payload"]["enable_thinking"] is False
    assert "reasoning" not in call["payload"]


def test_the_model_group_is_a_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    client, spy = build(
        monkeypatch,
        LITELLM_BASE_URL="http://litellm:4000/v1",
        LITELLM_API_KEY="sk-usine",
        USINE_MODEL="lab-code",
        USINE_MODEL_EXTRAS="{}",
    )
    assert ask(client).status_code == 200
    call = sent(spy)
    assert call["payload"]["model"] == "lab-code"
    assert "enable_thinking" not in call["payload"]


@pytest.mark.parametrize("name", ["OPENROUTER_API_KEY", "BAI_API_KEY"])
def test_a_provider_key_is_never_read(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    # Posed alone, a provider key does not make the service live: no gateway,
    # no call, the page replays a recorded run.
    client, spy = build(monkeypatch, **{name: "clé-fournisseur"})
    assert client.get("/health").json()["ready"] is False
    ask(client)
    assert spy.calls == []
