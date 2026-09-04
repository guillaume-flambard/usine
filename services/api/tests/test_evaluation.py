"""Le harnais d'évaluation.

Ce qu'il protège : savoir si un changement de prompt ou de budget améliore
l'usine, au lieu de le croire d'après le dernier run regardé.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.evaluation import evaluate, measure
from usine_api.runs import ARCHIVE_VERSION, Archive, InMemoryRunStore


def run(*events: dict[str, Any]) -> Archive:
    numbered = [{"sequence": i, **event} for i, event in enumerate(events, start=1)]
    return Archive(version=ARCHIVE_VERSION, brief="un besoin", events=numbered)


AGENT = {"type": "component-created", "id": "a#1", "provides": ["rapport"]}
BEHAVIOUR = {"type": "component-created", "id": "b#1", "provides": ["behaviour:compter"]}
SCREEN = {"type": "screen-posted", "id": "a#1", "markup": "<p>x</p>", "revision": 1}
REPLACED = {"type": "component-replaced", "id": "b#2", "previous": "b#1", "name": "compter"}
TOKENS = {"type": "tokens-spent", "id": "a#1", "input": 100, "output": 50}


def test_a_run_that_served_is_one_with_a_screen_and_a_behaviour() -> None:
    assert measure(run(AGENT, SCREEN, BEHAVIOUR)).served is True
    # Un écran sans comportement n'est pas une application : les commandes
    # sont inertes, le visiteur n'a rien à utiliser.
    assert measure(run(AGENT, SCREEN)).served is False
    assert measure(run(AGENT, BEHAVIOUR)).served is False


def test_a_behaviour_is_not_counted_as_an_agent() -> None:
    # Sinon le nombre d'agents grossirait à chaque remplacement, et la mesure
    # dirait « l'usine crée plus d'agents » là où elle améliore un outil.
    assert measure(run(AGENT, BEHAVIOUR)).agents == 1


def test_the_first_usable_rank_waits_for_both_halves() -> None:
    # L'application devient utilisable au plus tard des deux, pas au premier.
    measured = measure(run(AGENT, SCREEN, TOKENS, BEHAVIOUR))

    assert measured.first_screen_at == 4


def test_a_run_that_never_served_has_no_rank_rather_than_a_zero() -> None:
    # Zéro se moyennerait et flatterait la mesure. L'absence, non.
    assert measure(run(AGENT, TOKENS)).first_screen_at is None


def test_tokens_are_summed_from_what_was_really_spent() -> None:
    assert measure(run(TOKENS, TOKENS)).tokens == 300


def test_a_message_without_a_kind_is_not_counted_as_anything() -> None:
    # C'est tout l'intérêt du champ : compter sur la prose ferait de n'importe
    # quelle phrase contenant le mot « refusé » une mesure.
    prose = {"type": "message-emitted", "id": "a#1", "message": "refusé : la v1 continue de servir"}

    measured = measure(run(AGENT, prose))

    assert measured.malformed == 0
    assert measured.rollbacks == 0


def test_malformed_turns_are_counted_from_what_the_run_said() -> None:
    illisible = {
        "type": "message-emitted",
        "id": "a#1",
        "message": "Réponse illisible : x",
        "kind": "malformed",
    }

    assert measure(run(AGENT, illisible, illisible)).malformed == 2


def test_rollbacks_are_counted_when_a_version_did_not_take() -> None:
    refus = {
        "type": "message-emitted",
        "id": "a#1",
        "message": "refusé : la v2 est tombée ; la v1 continue de servir.",
        "kind": "rollback",
    }

    assert measure(run(AGENT, refus)).rollbacks == 1


def test_the_report_says_what_share_of_runs_actually_demonstrated_something() -> None:
    # C'est M7, la seule métrique qui dit si le produit a fait ce qu'il promet.
    report = evaluate(
        [
            run(AGENT, SCREEN, BEHAVIOUR, REPLACED),
            run(AGENT, SCREEN, BEHAVIOUR),
            run(AGENT),
        ]
    )

    assert report.runs == 3
    assert report.served_ratio == round(2 / 3, 3)
    assert report.replaced_ratio == round(1 / 3, 3)


def test_two_runs_of_the_same_set_give_the_same_report() -> None:
    # Sans ça, comparer deux mesures ne voudrait rien dire.
    archives = [run(AGENT, SCREEN, BEHAVIOUR, REPLACED, TOKENS), run(AGENT, SCREEN)]

    assert evaluate(archives) == evaluate(archives)


def test_an_empty_set_is_a_report_with_no_runs_not_a_crash() -> None:
    report = evaluate([])

    assert report.runs == 0
    assert report.median_first_screen_rank is None


def test_the_route_reports_on_everything_stored() -> None:
    store = InMemoryRunStore()
    store.create("un", run(AGENT, SCREEN, BEHAVIOUR, REPLACED), "org")
    store.create("deux", run(AGENT), "org")
    client = TestClient(create_app(key="clé", call=None, runs=store))

    body = client.get("/evaluation").json()

    assert body["runs"] == 2
    assert body["servedRatio"] == 0.5
    assert body["replacedRatio"] == 0.5


def test_a_trashed_run_stops_feeding_the_public_report() -> None:
    # /evaluation est public et délibérément agrégé sur tous les runs : c'est la
    # preuve affichée aux visiteurs. Mais la corbeille doit valoir là aussi,
    # sinon un run que la personne a supprimé continue de nourrir la statistique.
    store = InMemoryRunStore()
    store.create("un", run(AGENT, SCREEN, BEHAVIOUR, REPLACED), "org")
    store.create("deux", run(AGENT), "org")
    client = TestClient(create_app(key="clé", call=None, runs=store))
    assert client.get("/evaluation").json()["runs"] == 2

    store.delete("deux", "org")

    assert client.get("/evaluation").json()["runs"] == 1


def test_the_route_reports_on_one_run() -> None:
    store = InMemoryRunStore()
    store.create("un", run(AGENT, SCREEN, BEHAVIOUR), "org")
    # Partagé pour être lisible par un client anonyme (la tenancy le protège
    # sinon ; ici on teste la forme de la mesure, pas l'accès).
    store.share("un", "org")
    client = TestClient(create_app(key="clé", call=None, runs=store))

    assert client.get("/evaluation/un").json()["served"] is True
    assert client.get("/evaluation/jamais-vu").status_code == 404
