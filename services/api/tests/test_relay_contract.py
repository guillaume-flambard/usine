"""Le contrat du relais, porté depuis le service Node qu'il remplace.

Ces tests sont la preuve que la migration est propre : ils vérifient la même
forme de requête et de réponse, les mêmes refus, et les mêmes bornes. Le client
n'a pas été touché, et ces cas disent pourquoi il n'avait pas à l'être.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.limits import Limits, RateLimiter

KEY = "clé-de-test"


def model_answer(
    text: str, *, finish: str = "stop", tokens: tuple[int, int] = (12, 34)
) -> dict[str, Any]:
    return {
        "model": "deepseek/deepseek-v4-flash",
        "choices": [{"message": {"content": text}, "finish_reason": finish}],
        "usage": {"prompt_tokens": tokens[0], "completion_tokens": tokens[1]},
    }


class Spy:
    """Un fournisseur qui ne joint rien et retient ce qu'on lui a demandé."""

    def __init__(self, status: int = 200, body: Any = None, boom: Exception | None = None) -> None:
        self.status = status
        self.body = body if body is not None else model_answer("d'accord")
        self.boom = boom
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, url: str, *, headers: dict[str, str], payload: dict[str, Any]):
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        if self.boom is not None:
            raise self.boom
        return self.status, self.body


def client_for(**kwargs: Any) -> tuple[TestClient, Spy]:
    spy = kwargs.pop("spy", None) or Spy()
    app = create_app(key=kwargs.pop("key", KEY), call=spy, **kwargs)
    return TestClient(app), spy


def ask(client: TestClient, **body: Any):
    payload = {"role": "agent", "instruction": "compte", "context": "un texte"} | body
    return client.post("/reason", json=payload)


def test_health_says_what_the_page_needs_before_a_click() -> None:
    client, _ = client_for()

    body = client.get("/health").json()

    assert body["ready"] is True
    assert body["model"]
    # La capacité est annoncée avant le run, pas découverte pendant.
    assert body["remaining"]["visitor"] > 0
    assert body["remaining"]["global"] > 0
    assert body["callsPerRun"] > 0


def test_health_never_says_which_key() -> None:
    client, _ = client_for()

    raw = client.get("/health").text

    assert KEY not in raw


def test_with_no_key_it_announces_itself_and_refuses_to_reason() -> None:
    client, _ = client_for(key="")

    assert client.get("/health").json()["ready"] is False
    assert ask(client).status_code == 503


def test_it_relays_the_answer_and_the_real_token_spend() -> None:
    client, spy = client_for(spy=Spy(body=model_answer("trois", tokens=(10, 20))))

    body = ask(client).json()

    assert body["text"] == "trois"
    assert body["tokens"] == {"input": 10, "output": 20}
    # Les compteurs de la page viennent de là : une valeur inventée ici serait
    # un compteur qui ment à l'écran.
    assert spy.calls


def test_the_key_leaves_only_toward_the_provider() -> None:
    client, spy = client_for()

    body = ask(client).json()

    assert KEY not in str(body)
    assert spy.calls[0]["headers"]["authorization"] == f"Bearer {KEY}"
    assert spy.calls[0]["url"].startswith("https://openrouter.ai/")


def test_the_title_header_stays_ascii() -> None:
    # Un en-tête HTTP est une ByteString : un tiret cadratin lève au moment de
    # l'appel, et le run entier tombe. C'est arrivé en production.
    client, spy = client_for()

    ask(client)

    assert spy.calls[0]["headers"]["x-title"].isascii()


def test_reasoning_is_switched_off_in_the_payload() -> None:
    # Mesuré : avec le raisonnement actif, deux appels sur trois revenaient
    # avec tout le budget de sortie dépensé et pas un caractère de contenu.
    client, spy = client_for()

    ask(client)

    assert spy.calls[0]["payload"]["reasoning"] == {"enabled": False}


def test_an_unknown_role_is_refused_before_the_counter() -> None:
    limiter = RateLimiter(Limits())
    client, spy = client_for(limiter=limiter)

    response = ask(client, role="intrus")

    assert response.status_code == 400
    assert not spy.calls
    # Et surtout : la demande malformée n'a rien consommé du quota des autres.
    assert limiter.remaining("testclient").visitor == Limits().per_visitor_per_day


def test_an_oversized_payload_is_cut_before_being_read() -> None:
    client, spy = client_for(limits=Limits(max_body=200))

    response = ask(client, context="x" * 5_000)

    assert response.status_code == 400
    assert not spy.calls


def test_instruction_and_context_are_bounded_before_leaving() -> None:
    client, spy = client_for(limits=Limits(max_instruction=10, max_context=20))

    ask(client, instruction="i" * 500, context="c" * 500)

    sent = spy.calls[0]["payload"]["messages"][1]["content"]
    assert "i" * 11 not in sent
    assert "c" * 21 not in sent


def test_a_spent_quota_answers_429_rather_than_calling_the_model() -> None:
    client, spy = client_for(limits=Limits(per_minute=2))

    assert ask(client).status_code == 200
    assert ask(client).status_code == 200
    third = ask(client)

    assert third.status_code == 429
    assert "trop de demandes" in third.json()["error"]
    assert len(spy.calls) == 2


def test_a_provider_refusal_does_not_leak_its_message() -> None:
    refused = Spy(status=402, body={"error": {"message": "carte refusée n°4242"}})
    client, _ = client_for(spy=refused)

    response = ask(client)

    assert response.status_code == 502
    assert "4242" not in response.text
    assert "402" in response.json()["error"]


def test_an_answer_cut_off_says_so_instead_of_being_empty() -> None:
    client, _ = client_for(spy=Spy(body=model_answer("", finish="length")))

    response = ask(client)

    assert response.status_code == 502
    assert "coupée" in response.json()["error"]


def test_a_provider_that_throws_becomes_a_502_not_a_crash() -> None:
    client, _ = client_for(spy=Spy(boom=RuntimeError("réseau coupé")))

    response = ask(client)

    assert response.status_code == 502


def test_an_unreadable_body_is_a_request_not_an_incident() -> None:
    client, spy = client_for()

    response = client.post(
        "/reason", content=b"pas du json", headers={"content-type": "application/json"}
    )

    assert response.status_code == 400
    assert not spy.calls


def test_nothing_it_returns_is_cacheable() -> None:
    client, _ = client_for()

    assert client.get("/health").headers["cache-control"] == "no-store"
    assert ask(client).headers["cache-control"] == "no-store"


def test_the_vocabulary_is_forwarded_untouched_and_an_action_is_required() -> None:
    # Le vocabulaire décrit l'appelant : le service n'en tient pas une seconde
    # copie, il le transmet. Et un tour sans action est un tour perdu — l'agent
    # a dépensé un appel pour dire quelque chose et n'a rien fait.
    client, spy = client_for()
    tools = [{"type": "function", "function": {"name": "create", "parameters": {}}}]

    ask(client, tools=tools)

    assert spy.calls[0]["payload"]["tools"] == tools
    assert spy.calls[0]["payload"]["tool_choice"] == "required"


def test_no_vocabulary_means_no_field_rather_than_an_empty_one() -> None:
    client, spy = client_for()

    ask(client)

    assert "tools" not in spy.calls[0]["payload"]
    assert "tool_choice" not in spy.calls[0]["payload"]


def test_an_oversized_vocabulary_is_refused() -> None:
    client, spy = client_for(limits=Limits(max_body=200_000))

    response = ask(client, tools=[{"blob": "x" * 50_000}])

    assert response.status_code == 400
    assert not spy.calls


def test_tool_calls_are_relayed_with_their_arguments() -> None:
    # C'est la voie fiable : le nom de l'action voyage hors du corps JSON, là
    # où l'ordre alphabétique des clés ne peut pas le brouiller.
    answered = {
        "model": "m",
        "choices": [
            {
                "message": {
                    "content": "je crée l'agent",
                    "tool_calls": [
                        {
                            "function": {
                                "name": "create",
                                "arguments": '{"name":"poseur-ecran"}',
                            }
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {},
    }
    client, _ = client_for(spy=Spy(body=answered))

    body = ask(client).json()

    assert body["calls"] == [{"name": "create", "arguments": '{"name":"poseur-ecran"}'}]
    assert body["text"] == "je crée l'agent"


def test_a_turn_made_only_of_actions_is_valid() -> None:
    # Un modèle qui agit n'a rien à dire en plus : exiger du texte rejetterait
    # un tour parfaitement bon.
    answered = {
        "model": "m",
        "choices": [
            {
                "message": {
                    "content": None,
                    "tool_calls": [{"function": {"name": "done", "arguments": "{}"}}],
                },
                "finish_reason": "length",
            }
        ],
        "usage": {},
    }
    client, _ = client_for(spy=Spy(body=answered))

    response = ask(client)

    assert response.status_code == 200
    assert response.json()["calls"][0]["name"] == "done"


def test_a_malformed_tool_call_is_dropped_not_relayed() -> None:
    answered = {
        "model": "m",
        "choices": [
            {
                "message": {
                    "content": "x",
                    "tool_calls": [{"function": {"arguments": "{}"}}, "pas un appel"],
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {},
    }
    client, _ = client_for(spy=Spy(body=answered))

    assert ask(client).json()["calls"] == []
