"""Les sources de données, sur liste blanche.

Un site public qui relaie des adresses fournies par un modèle est un proxy
ouvert. La règle est donc simple et sans exception : **un agent nomme une
source, il ne fournit jamais une adresse.** Le nom est résolu ici, dans une
table écrite par nous.

Ce que ça coûte : ajouter une source est une décision, pas une conséquence.
C'est le prix, et il est juste.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import quote


@dataclass(frozen=True)
class Source:
    """Une source nommée. L'adresse n'existe qu'ici."""

    name: str
    #: Ce que la source rend, en une ligne, pour qu'un agent sache quoi en faire.
    description: str
    #: Le gabarit d'adresse. `{q}` est le seul point d'insertion, et il est échappé.
    template: str


#: La liste blanche. Volontairement courte : chaque entrée est une décision.
#:
#: Le critère retenu — Q12 du PRD — tient en trois points : sans clé, sans
#: donnée personnelle, et stable. Une source qui demanderait une clé ferait de
#: ce service un porteur de secrets pour le compte d'un modèle.
SOURCES: dict[str, Source] = {
    "wikipedia-fr": Source(
        name="wikipedia-fr",
        description="Le résumé d'un article de Wikipédia en français.",
        template="https://fr.wikipedia.org/api/rest_v1/page/summary/{q}",
    ),
    "open-food-facts": Source(
        name="open-food-facts",
        description="La fiche d'un produit alimentaire par son code-barres.",
        template="https://world.openfoodfacts.org/api/v2/product/{q}.json",
    ),
    "exchange-rates": Source(
        name="exchange-rates",
        description="Les taux de change du jour pour une devise (code ISO, ex. EUR).",
        template="https://open.er-api.com/v6/latest/{q}",
    ),
}

#: Ce qui revient d'une source est borné : un agent ne doit pas pouvoir faire
#: transiter un fichier entier par le contexte d'un modèle.
MAX_SOURCE_BYTES = 200_000

#: Une requête plus longue que ça n'est pas une requête.
MAX_QUERY = 200


class SourceRefusal(Exception):
    """Une demande de source qu'on ne sert pas, avec sa raison."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class Fetcher(Protocol):
    """Comment on va chercher. Injecté pour que les tests ne joignent rien."""

    async def __call__(self, url: str) -> tuple[int, str]: ...


def catalogue() -> list[dict[str, str]]:
    """Ce qu'un agent peut nommer. Découvert à l'exécution, pas codé en dur."""
    return [{"name": source.name, "description": source.description} for source in SOURCES.values()]


async def fetch_source(name: str, query: str, *, fetch: Fetcher) -> dict[str, Any]:
    """Résout un nom, va chercher, et rend ce qui revient, borné."""
    source = SOURCES.get(name)
    if source is None:
        known = ", ".join(sorted(SOURCES))
        raise SourceRefusal(400, f"source inconnue : {name}. Sources disponibles : {known}")

    trimmed = query.strip()[:MAX_QUERY]
    if not trimmed:
        raise SourceRefusal(400, "une source se consulte avec une requête")

    # Échappé, et à un seul endroit : le gabarit vient de nous, la requête vient
    # d'un modèle. Sans cela, une requête pourrait sortir du chemin prévu.
    url = source.template.format(q=quote(trimmed, safe=""))

    try:
        status, body = await fetch(url)
    except Exception as cause:  # noqa: BLE001 — toute panne de source est une panne de source
        raise SourceRefusal(502, f"la source {name} est injoignable") from cause

    if status >= 400:
        # Le corps de la source peut contenir n'importe quoi : seul son statut
        # ressort, comme pour le fournisseur de modèle.
        raise SourceRefusal(502, f"la source {name} a répondu {status}")

    return {
        "source": name,
        "query": trimmed,
        "body": body[:MAX_SOURCE_BYTES],
        "truncated": len(body) > MAX_SOURCE_BYTES,
    }
