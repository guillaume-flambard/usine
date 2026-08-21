"""Un run conservé, rendu comme une trace.

C'est la couche que la carte 2026 dit présente chez 89 % des équipes en
production, et absente ici. Elle est presque gratuite pour la même raison que
l'évaluation : un run est déjà un flux d'événements ordonné, chaque événement
porte le temps écoulé depuis le début du run, et la filiation des composants
est dans le flux.

Ce que ce module fait : convertir. Ce qu'il ne fait pas : exporter. Brancher un
collecteur est un réglage de déploiement, pas une dépendance du produit — et
NFR-031 exige que son absence ne change rien.

La forme suit OTLP en JSON, sans en importer la bibliothèque : un run n'a pas
besoin d'un SDK pour être décrit, et l'ajouter coûterait une dépendance pour
une conversion de quarante lignes.
"""

from __future__ import annotations

from typing import Any

from .runs import Archive

#: Les événements qui ouvrent un intervalle, et celui qui le referme.
_OPENS = "component-created"
_CLOSES = {"component-released", "work-finished"}


def _nanos(milliseconds: Any) -> int:
    """OTLP compte en nanosecondes depuis l'époque ; nous, depuis le run.

    L'origine est arbitraire et assumée : ce qui a un sens dans un run rejoué
    est la durée, pas l'instant. Une origine à zéro rend les traces de deux
    runs comparables entre elles, ce qu'une date réelle ne ferait pas.
    """
    return int(milliseconds or 0) * 1_000_000


def spans_of(archive: Archive) -> list[dict[str, Any]]:
    """Un intervalle par composant, plus un par remplacement.

    La filiation vient du flux : un agent créé par un autre est un intervalle
    enfant de celui qui l'a créé. Ce n'est pas reconstruit, c'est lu.
    """
    opened: dict[str, dict[str, Any]] = {}
    spans: list[dict[str, Any]] = []
    last_at = 0

    for event in archive.events:
        at = int(event.get("at") or 0)
        last_at = max(last_at, at)
        kind = event.get("type")
        component = event.get("id")
        if not isinstance(component, str):
            continue

        if kind == _OPENS:
            parent = event.get("parent")
            opened[component] = {
                "name": str(event.get("name") or component),
                "spanId": component,
                "parentSpanId": parent if isinstance(parent, str) else None,
                "startTimeUnixNano": _nanos(at),
                "endTimeUnixNano": None,
                "attributes": {
                    "usine.provides": event.get("provides") or [],
                    "usine.needs": event.get("needs") or [],
                },
            }
        elif kind in _CLOSES:
            span = opened.get(component)
            # Un composant qui finit son travail puis est relâché ne referme
            # qu'une fois : le premier des deux gagne, et c'est le bon — après,
            # il ne travaille plus.
            if span is not None and span["endTimeUnixNano"] is None:
                span["endTimeUnixNano"] = _nanos(at)
        elif kind == "component-replaced":
            previous = event.get("previous")
            spans.append(
                {
                    "name": f"replace {event.get('name') or ''}".strip(),
                    "spanId": f"{component}:replace",
                    "parentSpanId": previous if isinstance(previous, str) else None,
                    "startTimeUnixNano": _nanos(at),
                    "endTimeUnixNano": _nanos(at),
                    "attributes": {"usine.replaced": previous},
                }
            )
        elif kind == "tokens-spent":
            span = opened.get(component)
            if span is not None:
                spent = span["attributes"].get("usine.tokens", 0)
                span["attributes"]["usine.tokens"] = (
                    spent + int(event.get("input") or 0) + int(event.get("output") or 0)
                )

    # Un composant encore vivant à la fin du run n'a pas de fin : on la pose au
    # dernier instant connu plutôt que de rendre un intervalle ouvert, qu'aucun
    # lecteur de traces n'affiche.
    for span in opened.values():
        if span["endTimeUnixNano"] is None:
            span["endTimeUnixNano"] = _nanos(last_at)
        spans.append(span)

    return sorted(spans, key=lambda span: span["startTimeUnixNano"])


def trace_of(run_id: str, archive: Archive) -> dict[str, Any]:
    """La trace complète, dans la forme qu'un collecteur OTLP accepte."""
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": {
                        "service.name": "usine-agentique",
                        "usine.run": run_id,
                    }
                },
                "scopeSpans": [{"scope": {"name": "usine.run"}, "spans": spans_of(archive)}],
            }
        ]
    }
