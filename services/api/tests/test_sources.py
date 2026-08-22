"""Les sources sur liste blanche.

Ce que ces tests protègent : un site public ne doit pas devenir un proxy
ouvert parce qu'un modèle a proposé une adresse.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.limits import Limits
from usine_api.sources import MAX_SOURCE_BYTES, SourceRefusal, catalogue, fetch_source


class Fetch:
    """Un attrapeur d'adresses. Il ne joint rien et retient ce qu'on lui demande."""

    def __init__(self, status: int = 200, body: str = '{"ok":true}') -> None:
        self.status = status
        self.body = body
        self.urls: list[str] = []

    async def __call__(self, url: str) -> tuple[int, str]:
        self.urls.append(url)
        return self.status, self.body


def client_for(fetch: Any, **kwargs: Any) -> TestClient:
    return TestClient(create_app(key="clé", call=None, fetch=fetch, **kwargs))


async def test_a_named_source_is_resolved_here_never_by_the_caller() -> None:
    fetch = Fetch()

    found = await fetch_source("wikipedia-fr", "Cordis", fetch=fetch)

    assert found["source"] == "wikipedia-fr"
    assert fetch.urls == ["https://fr.wikipedia.org/api/rest_v1/page/summary/Cordis"]


async def test_an_unknown_source_is_refused_and_says_what_exists() -> None:
    fetch = Fetch()

    with pytest.raises(SourceRefusal) as refused:
        await fetch_source("mon-serveur-perso", "x", fetch=fetch)

    assert refused.value.status == 400
    # Le refus est utile à l'agent : il apprend ce qu'il peut nommer.
    assert "wikipedia-fr" in refused.value.message
    assert not fetch.urls


async def test_a_query_cannot_escape_the_template() -> None:
    # Le gabarit vient de nous, la requête vient d'un modèle. Sans échappement,
    # une requête sortirait du chemin prévu.
    fetch = Fetch()

    await fetch_source("wikipedia-fr", "../../admin?x=1", fetch=fetch)

    assert fetch.urls[0].endswith("summary/..%2F..%2Fadmin%3Fx%3D1")
    assert "?x=1" not in fetch.urls[0]


async def test_an_empty_query_is_not_a_query() -> None:
    with pytest.raises(SourceRefusal):
        await fetch_source("wikipedia-fr", "   ", fetch=Fetch())


async def test_a_source_error_does_not_leak_its_body() -> None:
    fetch = Fetch(status=403, body="clé interne AKIA1234")

    with pytest.raises(SourceRefusal) as refused:
        await fetch_source("wikipedia-fr", "x", fetch=fetch)

    assert "AKIA1234" not in refused.value.message
    assert "403" in refused.value.message


async def test_an_unreachable_source_is_a_502_not_a_crash() -> None:
    class Broken:
        async def __call__(self, url: str) -> tuple[int, str]:
            raise RuntimeError("réseau coupé")

    with pytest.raises(SourceRefusal) as refused:
        await fetch_source("wikipedia-fr", "x", fetch=Broken())

    assert refused.value.status == 502


async def test_what_comes_back_is_bounded_and_says_when_it_was_cut() -> None:
    fetch = Fetch(body="x" * (MAX_SOURCE_BYTES + 100))

    found = await fetch_source("wikipedia-fr", "x", fetch=fetch)

    assert len(found["body"]) == MAX_SOURCE_BYTES
    assert found["truncated"] is True


def test_the_catalogue_says_what_each_source_gives() -> None:
    # Découvert à l'exécution : un agent demande la liste, il ne la lit pas
    # dans le code du navigateur.
    entries = catalogue()

    assert entries
    for entry in entries:
        assert entry["name"]
        assert len(entry["description"]) > 10


def test_the_route_serves_the_catalogue() -> None:
    body = client_for(Fetch()).get("/sources").json()

    assert any(source["name"] == "wikipedia-fr" for source in body["sources"])


def test_the_route_fetches_a_named_source() -> None:
    fetch = Fetch(body='{"extrait":"un texte"}')

    body = client_for(fetch).post("/sources/wikipedia-fr", json={"query": "Cordis"}).json()

    assert body["body"] == '{"extrait":"un texte"}'


def test_the_outbound_route_is_under_the_same_quota_as_reasoning() -> None:
    # Une route sortante hors quota serait une porte ouverte avec un autre nom.
    fetch = Fetch()
    client = client_for(fetch, limits=Limits(per_minute=2))

    assert client.post("/sources/wikipedia-fr", json={"query": "a"}).status_code == 200
    assert client.post("/sources/wikipedia-fr", json={"query": "b"}).status_code == 200
    third = client.post("/sources/wikipedia-fr", json={"query": "c"})

    assert third.status_code == 429
    assert len(fetch.urls) == 2
