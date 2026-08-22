"""La mémoire d'un run.

Ce qu'elle résout : un fait établi au premier tour n'a aujourd'hui aucun chemin
vers un agent né au troisième.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.memory import DIMENSIONS, Fact, InMemoryMemory, embed, similarity


def fact(text: str, run: str = "r1", author: str = "juriste") -> Fact:
    return Fact(run=run, author=author, text=text)


def test_an_imprint_is_deterministic_and_normalised() -> None:
    # Déterministe : sans ça, une évaluation ne serait pas reproductible.
    assert embed("allégation santé") == embed("allégation santé")
    assert len(embed("un texte")) == DIMENSIONS
    assert abs(similarity(embed("un texte"), embed("un texte")) - 1.0) < 1e-9


def test_an_empty_text_gives_an_imprint_of_zeroes_not_a_crash() -> None:
    assert embed("") == [0.0] * DIMENSIONS


def test_two_unrelated_texts_are_not_close() -> None:
    assert similarity(embed("réglementation des allégations"), embed("compter les syllabes")) < 0.3


def test_recall_finds_the_fact_that_shares_the_words() -> None:
    memory = InMemoryMemory()
    memory.remember(fact("les allégations thérapeutiques sont interdites"))
    memory.remember(fact("le vérificateur compte les syllabes d'un vers"))

    found = memory.recall("r1", "allégations interdites", limit=1)

    assert len(found) == 1
    assert "thérapeutiques" in found[0].text


def test_recall_never_crosses_from_one_run_to_another() -> None:
    # Un run ne doit pas hériter de ce qu'un autre visiteur a établi : ce
    # serait une fuite entre deux inconnus.
    memory = InMemoryMemory()
    memory.remember(fact("un secret", run="r1"))

    assert memory.recall("r2", "secret") == []


def test_recall_returns_nothing_rather_than_noise() -> None:
    memory = InMemoryMemory()
    memory.remember(fact("les allégations thérapeutiques"))

    # Un rappel sans rapport rend une liste vide : servir le fait le moins
    # mauvais serait pire que ne rien servir.
    assert memory.recall("r1", "photosynthèse chlorophyllienne") == []


def test_the_author_travels_with_the_fact() -> None:
    memory = InMemoryMemory()
    memory.remember(fact("les allégations sont encadrées", author="juriste"))

    assert memory.recall("r1", "allégations")[0].author == "juriste"


def test_forgetting_a_run_takes_only_its_facts() -> None:
    memory = InMemoryMemory()
    memory.remember(fact("un fait de r1", run="r1"))
    memory.remember(fact("un fait de r2", run="r2"))

    assert memory.forget("r1") == 1
    assert memory.recall("r1", "fait") == []
    assert len(memory.recall("r2", "fait")) == 1


def test_the_store_does_not_grow_without_bound() -> None:
    memory = InMemoryMemory(capacity=3)
    for index in range(5):
        memory.remember(fact(f"fait numéro {index}"))

    assert len(memory.recall("r1", "fait", limit=10)) == 3


def client_for(**kwargs: Any) -> TestClient:
    return TestClient(create_app(key="clé", call=None, **kwargs))


def test_the_route_remembers_and_recalls() -> None:
    client = client_for()

    client.post(
        "/memory/r1",
        json={"author": "juriste", "text": "les allégations thérapeutiques sont interdites"},
    )
    body = client.get("/memory/r1", params={"q": "allégations"}).json()

    assert body["facts"][0]["author"] == "juriste"


def test_a_fact_without_an_author_is_refused() -> None:
    client = client_for()

    assert client.post("/memory/r1", json={"text": "un fait"}).status_code == 400
    assert client.post("/memory/r1", json={"author": "a"}).status_code == 400


def test_forgetting_is_reachable_because_reversibility_does_not_stop_at_the_tab() -> None:
    memory = InMemoryMemory()
    client = client_for(memory=memory)
    client.post("/memory/r1", json={"author": "a", "text": "un fait"})

    assert client.delete("/memory/r1").json()["forgotten"] == 1
    assert client.get("/memory/r1", params={"q": "fait"}).json()["facts"] == []
