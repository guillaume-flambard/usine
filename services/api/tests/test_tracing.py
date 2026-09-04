"""Un run conservé, rendu comme une trace.

Ce que ces tests protègent : la filiation vient du flux, pas d'une
reconstruction, et une trace se lit dans un outil sans qu'on ait à expliquer sa
forme.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.runs import ARCHIVE_VERSION, Archive, InMemoryRunStore
from usine_api.tracing import spans_of


def run(*events: dict[str, Any]) -> Archive:
    numbered = [{"sequence": i, **event} for i, event in enumerate(events, start=1)]
    return Archive(version=ARCHIVE_VERSION, brief="un besoin", events=numbered)


def created(component: str, at: int, parent: str | None = None, **extra: Any) -> dict[str, Any]:
    event = {"type": "component-created", "id": component, "name": component, "at": at, **extra}
    if parent is not None:
        event["parent"] = parent
    return event


def by_id(spans: list[dict[str, Any]], span_id: str) -> dict[str, Any]:
    return next(span for span in spans if span["spanId"] == span_id)


def test_a_component_becomes_an_interval_with_a_real_duration() -> None:
    spans = spans_of(
        run(
            created("maitre", 0),
            {"type": "work-finished", "id": "maitre", "at": 250},
        )
    )

    span = by_id(spans, "maitre")
    assert span["startTimeUnixNano"] == 0
    assert span["endTimeUnixNano"] == 250_000_000


def test_filiation_is_read_from_the_stream_not_reconstructed() -> None:
    # Un agent créé par un autre est un intervalle enfant du sien. C'est ce qui
    # rend une trace lisible : on voit qui a fait naître qui.
    spans = spans_of(run(created("maitre", 0), created("juriste", 40, parent="maitre")))

    assert by_id(spans, "juriste")["parentSpanId"] == "maitre"
    assert by_id(spans, "maitre")["parentSpanId"] is None


def test_a_component_still_alive_gets_the_last_known_instant() -> None:
    # Un intervalle laissé ouvert n'est affiché par aucun lecteur de traces.
    spoke = {"type": "message-emitted", "id": "maitre", "at": 90}
    spans = spans_of(run(created("maitre", 0), spoke))

    assert by_id(spans, "maitre")["endTimeUnixNano"] == 90_000_000


def test_finishing_then_being_released_closes_once() -> None:
    # Après avoir fini, un composant ne travaille plus : c'est la première des
    # deux fins qui dit la durée du travail.
    spans = spans_of(
        run(
            created("maitre", 0),
            {"type": "work-finished", "id": "maitre", "at": 100},
            {"type": "component-released", "id": "maitre", "at": 900},
        )
    )

    assert by_id(spans, "maitre")["endTimeUnixNano"] == 100_000_000


def test_a_hot_replacement_is_its_own_interval() -> None:
    spans = spans_of(
        run(
            created("compter-v1", 10),
            created("compter-v2", 80),
            {
                "type": "component-replaced",
                "id": "compter-v2",
                "previous": "compter-v1",
                "name": "compter",
                "at": 80,
            },
        )
    )

    replacement = by_id(spans, "compter-v2:replace")
    assert replacement["name"] == "replace compter"
    # Rattaché à la version qu'il remplace : c'est la lecture qui a un sens.
    assert replacement["parentSpanId"] == "compter-v1"


def test_tokens_are_carried_on_the_component_that_spent_them() -> None:
    spans = spans_of(
        run(
            created("juriste", 0),
            {"type": "tokens-spent", "id": "juriste", "input": 100, "output": 50, "at": 10},
            {"type": "tokens-spent", "id": "juriste", "input": 10, "output": 5, "at": 20},
        )
    )

    assert by_id(spans, "juriste")["attributes"]["usine.tokens"] == 165


def test_spans_come_out_in_the_order_they_opened() -> None:
    spans = spans_of(run(created("b", 50), created("a", 10)))

    assert [span["spanId"] for span in spans] == ["a", "b"]


def test_the_route_returns_a_shape_a_collector_accepts() -> None:
    store = InMemoryRunStore()
    store.create("un", run(created("maitre", 0)), "org")
    # Partagé pour la lecture anonyme : on teste la forme de la trace, pas l'accès.
    store.share("un", "org")
    client = TestClient(create_app(key="clé", call=None, runs=store))

    body = client.get("/runs/un/trace").json()

    scope = body["resourceSpans"][0]
    assert scope["resource"]["attributes"]["usine.run"] == "un"
    assert len(scope["scopeSpans"][0]["spans"]) == 1
    assert client.get("/runs/jamais-vu/trace").status_code == 404
