"""Quel fournisseur le service appelle, et avec quel paramètre de raisonnement.

Deux fournisseurs compatibles OpenAI, un seul interrupteur : `BAI_API_KEY`. Ce
qui est vérifié ici n'est pas un réglage de confort. Le paramètre qui coupe le
raisonnement ne porte pas le même nom chez les deux, et l'envoyer sous le
mauvais nom rend des réponses vides : mesuré deux appels sur trois côté
OpenRouter, et 7 922 jetons pour une réponse de 800 côté passerelle du lab. Un
mauvais couple adresse/paramètre ne lève pas, il produit du vide.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_relay_contract import Spy, ask
from usine_api.app import create_app


def build(monkeypatch: pytest.MonkeyPatch, **env: str) -> tuple[TestClient, Spy]:
    for name in ("BAI_API_KEY", "BAI_BASE_URL", "BAI_MODEL", "OPENROUTER_API_KEY", "USINE_MODEL"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    spy = Spy()
    return TestClient(create_app(call=spy)), spy


def sent(spy: Spy) -> dict[str, Any]:
    assert len(spy.calls) == 1
    return spy.calls[0]


def test_openrouter_par_defaut(monkeypatch: pytest.MonkeyPatch) -> None:
    client, spy = build(monkeypatch, OPENROUTER_API_KEY="clé-openrouter")
    assert ask(client).status_code == 200
    call = sent(spy)
    assert call["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert call["payload"]["reasoning"] == {"enabled": False}
    assert "enable_thinking" not in call["payload"]


def test_bai_quand_sa_cle_est_posee(monkeypatch: pytest.MonkeyPatch) -> None:
    client, spy = build(monkeypatch, BAI_API_KEY="clé-bai", OPENROUTER_API_KEY="clé-openrouter")
    assert ask(client).status_code == 200
    call = sent(spy)
    assert call["url"] == "https://api.b.ai/v1/chat/completions"
    # L'extension de Qwen, pas celle d'OpenRouter, et surtout pas les deux.
    assert call["payload"]["enable_thinking"] is False
    assert "reasoning" not in call["payload"]
    assert call["payload"]["model"] == "qwen3.8-flash"
    assert call["headers"]["authorization"] == "Bearer clé-bai"


def test_bai_se_laisse_repointer(monkeypatch: pytest.MonkeyPatch) -> None:
    # Une barre oblique de trop dans l'adresse ne doit pas produire `//`.
    client, spy = build(
        monkeypatch,
        BAI_API_KEY="clé-bai",
        BAI_BASE_URL="https://passerelle.interne/v1/",
        BAI_MODEL="qwen3.8-max",
    )
    assert ask(client).status_code == 200
    call = sent(spy)
    assert call["url"] == "https://passerelle.interne/v1/chat/completions"
    assert call["payload"]["model"] == "qwen3.8-max"
