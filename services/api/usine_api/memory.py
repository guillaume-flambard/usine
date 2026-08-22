"""La mémoire d'un run.

Ce que les agents se passent aujourd'hui, ce sont des coeffets : des valeurs
publiées sous un nom, lues par ceux qui les déclarent. C'est bien pour ce qui
est structurel, et mauvais pour ce qui est **su** : un fait établi par un agent
au premier tour n'a aucun chemin vers un agent né au troisième.

La mémoire est ce chemin. Elle est adossée au service parce qu'elle doit
survivre à l'onglet — et parce qu'une recherche vectorielle dans un navigateur
serait un jouet.

**Sur la recherche vectorielle, une honnêteté nécessaire :** l'empreinte par
défaut est *lexicale*, pas sémantique. Elle projette les mots dans un espace
fixe par hachage, ce qui rapproche « allégation santé » de « allégations » et
pas de « claim ». C'est déterministe, gratuit, hors ligne — et c'est une
approximation qu'un vrai modèle d'embedding remplacera derrière la même
interface. Prétendre le contraire coûterait plus cher que le dire.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

#: La dimension de l'empreinte. Assez pour disperser, assez petit pour tenir.
DIMENSIONS = 256

#: Ce qu'un agent peut confier en une fois.
MAX_FACT = 2_000

#: Ce qu'une recherche peut rendre. Au-delà, ce n'est plus un rappel.
MAX_RECALL = 10

_WORD = re.compile(r"[\wàâäéèêëîïôöùûüç'-]+", re.UNICODE)


def words(text: str) -> list[str]:
    return [word.lower() for word in _WORD.findall(text) if len(word) > 2]


def embed(text: str) -> list[float]:
    """Projette un texte dans un espace fixe, par hachage de ses mots.

    Déterministe : le même texte donne toujours la même empreinte, ce qui rend
    une évaluation reproductible et un test possible sans fournisseur.
    """
    vector = [0.0] * DIMENSIONS
    for word in words(text):
        digest = hashlib.blake2b(word.encode("utf-8"), digest_size=8).digest()
        index = int.from_bytes(digest[:4], "big") % DIMENSIONS
        # Le signe vient du hachage lui-même : sans lui, deux mots différents
        # tombés au même endroit s'additionneraient toujours.
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm > 0 else vector


def similarity(left: list[float], right: list[float]) -> float:
    """Cosinus. Les empreintes sont déjà normées, donc c'est un produit scalaire."""
    return sum(a * b for a, b in zip(left, right, strict=False))


@dataclass(frozen=True)
class Fact:
    """Ce qu'un agent a établi, et d'où il le tient."""

    run: str
    #: L'agent qui l'a établi. Un fait sans auteur n'est pas vérifiable.
    author: str
    text: str
    #: D'où il le tient : un brief, une source nommée, un autre agent.
    origin: str = ""
    embedding: list[float] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {"author": self.author, "text": self.text, "origin": self.origin}


class Memory(Protocol):
    """Le port. Postgres et la mémoire vive le remplissent pareil."""

    def remember(self, fact: Fact) -> None: ...

    def recall(self, run: str, query: str, limit: int = 5) -> list[Fact]: ...

    def forget(self, run: str) -> int: ...


class InMemoryMemory:
    """Suffisant tant qu'un seul processus sert, et honnête sur sa limite."""

    def __init__(self, capacity: int = 5_000) -> None:
        self._facts: list[Fact] = []
        self._capacity = capacity

    def remember(self, fact: Fact) -> None:
        stored = (
            fact if fact.embedding else Fact(**{**fact.__dict__, "embedding": embed(fact.text)})
        )
        self._facts.append(stored)
        if len(self._facts) > self._capacity:
            del self._facts[0]

    def recall(self, run: str, query: str, limit: int = 5) -> list[Fact]:
        wanted = min(max(1, limit), MAX_RECALL)
        needle = embed(query)
        terms = set(words(query))

        scored: list[tuple[float, Fact]] = []
        for fact in self._facts:
            if fact.run != run:
                continue
            # Les deux ensemble, délibérément : le lexical exact rattrape ce
            # que l'empreinte disperse, et l'empreinte rattrape les variantes
            # que l'exact rate. Ni l'un ni l'autre seul ne suffit.
            overlap = len(terms & set(words(fact.text))) / len(terms) if terms else 0.0
            scored.append((similarity(needle, fact.embedding) + overlap, fact))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [fact for score, fact in scored[:wanted] if score > 0]

    def forget(self, run: str) -> int:
        before = len(self._facts)
        self._facts = [fact for fact in self._facts if fact.run != run]
        return before - len(self._facts)


#: Le schéma, versionné. Appliqué par migration, jamais à la main.
SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory (
  id        bigserial PRIMARY KEY,
  run       text        NOT NULL,
  author    text        NOT NULL,
  body      text        NOT NULL,
  origin    text        NOT NULL DEFAULT '',
  embedding vector(256) NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_run_idx ON memory (run);
CREATE INDEX IF NOT EXISTS memory_embedding_idx
  ON memory USING hnsw (embedding vector_cosine_ops);
"""


class PostgresMemory:
    """La même mémoire, qui survit au redémarrage.

    Elle prend une fabrique de connexion plutôt qu'une connexion : un service
    qui garde une connexion ouverte pour la vie du processus meurt avec elle.
    """

    def __init__(self, connect: Any) -> None:
        self._connect = connect

    def migrate(self) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(SCHEMA)

    def remember(self, fact: Fact) -> None:
        embedding = fact.embedding or embed(fact.text)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO memory (run, author, body, origin, embedding)"
                " VALUES (%s, %s, %s, %s, %s)",
                (fact.run, fact.author, fact.text[:MAX_FACT], fact.origin, str(embedding)),
            )

    def recall(self, run: str, query: str, limit: int = 5) -> list[Fact]:
        wanted = min(max(1, limit), MAX_RECALL)
        needle = str(embed(query))
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT author, body, origin FROM memory WHERE run = %s"
                " ORDER BY embedding <=> %s LIMIT %s",
                (run, needle, wanted),
            )
            rows = cursor.fetchall()
        return [Fact(run=run, author=row[0], text=row[1], origin=row[2]) for row in rows]

    def forget(self, run: str) -> int:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("DELETE FROM memory WHERE run = %s", (run,))
            return cursor.rowcount or 0
