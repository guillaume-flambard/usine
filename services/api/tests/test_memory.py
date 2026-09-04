"""La mémoire d'un run.

Ce qu'elle résout : un fait établi au premier tour n'a aujourd'hui aucun chemin
vers un agent né au troisième.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.identity import RecordingEmailSender
from usine_api.memory import DIMENSIONS, Fact, InMemoryMemory, embed, similarity
from usine_api.runs import ARCHIVE_VERSION, Archive, InMemoryRunStore


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


ARCHIVE = Archive(
    version=ARCHIVE_VERSION, brief="un besoin", events=[{"type": "work-finished", "sequence": 1}]
)


def sign_in(client: TestClient, mailer: RecordingEmailSender, email: str) -> None:
    """Connecte ce client (lien magique) : son bocal à cookies porte la session."""
    client.post("/auth/request-link", json={"email": email})
    _addr, link = mailer.sent[-1]
    token = link.split("token=", 1)[1]
    client.get("/auth/redeem", params={"token": token}, follow_redirects=False)


def app_with_owner(**kwargs: Any) -> tuple[TestClient, RecordingEmailSender, InMemoryRunStore]:
    """Une app, un client connecté propriétaire du run « r1 », et de quoi
    connecter une seconde org dessus.

    La mémoire suit l'autorisation de son run : sans run possédé, il n'y a
    rien à quoi rattacher un fait. C'est ce que ces tests exercent maintenant.
    """
    mailer = RecordingEmailSender()
    runs: InMemoryRunStore = kwargs.pop("runs", None) or InMemoryRunStore()
    app = create_app(key="clé", call=None, email=mailer, secure_cookies=False, runs=runs, **kwargs)
    client = TestClient(app)
    sign_in(client, mailer, "owner@atelier.co")
    runs.create("r1", ARCHIVE, _org_of(client))
    return client, mailer, runs


def client_for(**kwargs: Any) -> TestClient:
    client, _mailer, _runs = app_with_owner(**kwargs)
    return client


def _org_of(client: TestClient) -> str:
    """L'org derrière la session de ce client, telle que le service la voit."""
    return str(client.get("/auth/session").json()["org"])


def anonymous_client(**kwargs: Any) -> TestClient:
    """Un visiteur qui n'est connecté à rien. Il ne doit toucher aucune mémoire."""
    kwargs.setdefault("runs", InMemoryRunStore())
    return TestClient(create_app(key="clé", call=None, secure_cookies=False, **kwargs))


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


# --- La mémoire suit l'autorisation de son run. Ces routes datent d'avant la
# multi-tenance et ne contrôlaient rien : les tests d'alors appelaient
# « /memory/r1 » anonymement, sur un run qui n'existait pas. ---


def test_an_anonymous_visitor_touches_no_memory() -> None:
    memory = InMemoryMemory()
    memory.remember(Fact(run="r1", author="juriste", text="un fait établi"))
    visitor = anonymous_client(memory=memory)

    # Lire, écrire, effacer : les trois se refusent, et se refusent en 404,
    # indistinct d'un run absent — on ne confirme pas l'existence du run.
    assert visitor.get("/memory/r1", params={"q": "fait"}).status_code == 404
    assert visitor.post("/memory/r1", json={"author": "a", "text": "b"}).status_code == 404
    assert visitor.delete("/memory/r1").status_code == 404
    # Et rien n'a bougé : le refus n'est pas un effacement déguisé.
    assert len(memory.recall("r1", "fait", limit=10)) == 1


def test_another_org_reaches_neither_the_facts_nor_the_forgetting() -> None:
    memory = InMemoryMemory()
    owner, mailer, _runs = app_with_owner(memory=memory)
    owner.post("/memory/r1", json={"author": "juriste", "text": "un fait établi"})

    # Une seconde org, connectée pour de bon sur la même app, qui ne possède
    # simplement pas ce run.
    stranger = TestClient(owner.app)
    sign_in(stranger, mailer, "stranger@ailleurs.co")
    assert stranger.get("/auth/session").json()["authenticated"] is True

    assert stranger.get("/memory/r1", params={"q": "fait"}).status_code == 404
    assert stranger.post("/memory/r1", json={"author": "a", "text": "b"}).status_code == 404
    assert stranger.delete("/memory/r1").status_code == 404
    # Et le fait du propriétaire est intact.
    assert len(memory.recall("r1", "fait", limit=10)) == 1


def test_a_shared_run_lets_its_facts_be_read_but_not_written() -> None:
    memory = InMemoryMemory()
    runs = InMemoryRunStore()
    owner, _mailer, _runs = app_with_owner(memory=memory, runs=runs)
    owner.post("/memory/r1", json={"author": "juriste", "text": "un fait établi"})
    runs.share("r1", _org_of(owner))

    visitor = anonymous_client(memory=memory, runs=runs)

    # Partagé : la lecture suit le run, exactement comme GET /runs/{run_id}.
    assert visitor.get("/memory/r1", params={"q": "fait"}).json()["facts"] != []
    # Mais le partage n'ouvre ni l'écriture ni l'effacement.
    assert visitor.post("/memory/r1", json={"author": "a", "text": "b"}).status_code == 404
    assert visitor.delete("/memory/r1").status_code == 404
