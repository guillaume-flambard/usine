"""Isolation des tests vis-à-vis de l'environnement du poste.

`create_app` lit sa passerelle de modèles dans l'environnement (`LITELLM_*`,
`USINE_MODEL`). Un poste de développement du lab porte souvent ces variables, ou
d'anciennes clés de fournisseur, et des tests échouaient alors sans qu'aucune
ligne de code n'ait changé. Chaque test part donc d'un environnement sans
passerelle ni clé ; un test qui en veut une la pose lui-même.
"""

import pytest

PROVIDER_ENV = (
    "BAI_API_KEY",
    "BAI_BASE_URL",
    "BAI_MODEL",
    "OPENROUTER_API_KEY",
    "USINE_MODEL",
    "USINE_MODEL_EXTRAS",
    "LITELLM_BASE_URL",
    "LITELLM_API_KEY",
    # Une base de dev lancée par le compose ne doit jamais être prise par les tests.
    "DATABASE_URL",
    "POSTGRES_HOST",
)


@pytest.fixture(autouse=True)
def _no_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PROVIDER_ENV:
        monkeypatch.delenv(name, raising=False)
