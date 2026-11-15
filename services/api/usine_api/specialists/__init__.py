"""Le registre des spécialistes, chargés par nom (MEM-27).

Un remplacement à chaud (MEM-33) a besoin de nommer une implémentation sans
importer son module : c'est ce que fait ce registre. Il est vide tant qu'aucun
adaptateur ne s'inscrit, donc « aucun spécialiste disponible » se dit au lieu de
se deviner.
"""

from __future__ import annotations

from collections.abc import Callable
from importlib import import_module
from typing import Any

from usine_api.specialists.contract import Specialist

Factory = Callable[..., Specialist]

REGISTRY: dict[str, Factory] = {}

#: The modules that register themselves on import. Named here so that `load`
#: finds them without the caller having to import the right module first: a
#: registry that answers "unknown" while the implementation exists would be a
#: worse contract than no registry.
BUILTINS = ("usine_api.graph.specialist",)


def _ensure_builtins() -> None:
    for module in BUILTINS:
        import_module(module)


class UnknownSpecialist(Exception):
    """A name nobody registered."""

    def __init__(self, name: str) -> None:
        self.name = name
        known = ", ".join(sorted(REGISTRY)) or "aucun"
        super().__init__(f"spécialiste inconnu : {name} (connus : {known})")


def register(name: str) -> Callable[[Factory], Factory]:
    """Name an implementation. Used as a decorator on the adapter's class."""

    def decorate(factory: Factory) -> Factory:
        REGISTRY[name] = factory
        return factory

    return decorate


def available() -> tuple[str, ...]:
    _ensure_builtins()
    return tuple(sorted(REGISTRY))


def load(name: str, **kwargs: Any) -> Specialist:
    """Build the named implementation with the arguments its factory expects."""
    _ensure_builtins()
    factory = REGISTRY.get(name)
    if factory is None:
        raise UnknownSpecialist(name)
    return factory(**kwargs)
