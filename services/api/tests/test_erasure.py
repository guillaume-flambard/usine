"""Le choix de l'effacement : transactionnel, ou honnêtement séquentiel.

Ce que ces tests protègent : la promesse « tout ou rien » ne vaut que si les
cinq stores partagent la transaction. Dès qu'un seul vient d'ailleurs, la
promettre serait mentir — et c'est précisément le cas qu'un test qui n'existait
pas laisserait passer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from usine_api.erasure import Erasure, PostgresErasure, SequentialErasure, erasure_for


class _Store:
    """Un store quelconque : seule son identité compte ici."""

    def forget(self, _key: str) -> int:
        return 0

    def forget_owner(self, _org: str) -> int:
        return 0


@dataclass
class _Pooled:
    """Ce qu'un bundle Postgres présente au choix."""

    erasure: Erasure
    runs: Any
    identities: Any
    tokens: Any
    sessions: Any
    audit: Any


def _bundle() -> _Pooled:
    return _Pooled(
        erasure=PostgresErasure(pool=None),  # type: ignore[arg-type]
        runs=_Store(),
        identities=_Store(),
        tokens=_Store(),
        sessions=_Store(),
        audit=_Store(),
    )


def _five(pooled: _Pooled) -> dict[str, Any]:
    return {
        "runs": pooled.runs,
        "identities": pooled.identities,
        "tokens": pooled.tokens,
        "sessions": pooled.sessions,
        "audit": pooled.audit,
    }


def test_all_five_from_the_pool_gives_the_transactional_erasure() -> None:
    pooled = _bundle()
    assert erasure_for(pooled, **_five(pooled)) is pooled.erasure


def test_no_pool_at_all_falls_back_to_the_sequential_cascade() -> None:
    pooled = _bundle()
    chosen = erasure_for(None, **_five(pooled))
    assert isinstance(chosen, SequentialErasure)


def test_a_single_injected_store_forfeits_the_transactional_promise() -> None:
    # Le cas qui compte : quatre stores du pool, un venu d'ailleurs. La
    # transaction ne le couvrirait pas, donc on ne promet plus l'atomicité.
    for injected in ("runs", "identities", "tokens", "sessions", "audit"):
        pooled = _bundle()
        five = _five(pooled)
        five[injected] = _Store()

        chosen = erasure_for(pooled, **five)

        assert isinstance(chosen, SequentialErasure), injected
