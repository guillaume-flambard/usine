"""Isolation des tests vis-à-vis de l'environnement du poste.

`create_app` choisit son fournisseur d'après l'environnement : `BAI_API_KEY`
présent, il parle à b.ai ; absent, à OpenRouter. Un poste de développement du
lab porte souvent `BAI_API_KEY`, et les tests du contrat OpenRouter échouaient
alors sans qu'aucune ligne de code n'ait changé. Chaque test part donc d'un
environnement sans clé de fournisseur ; un test qui en veut une la pose
lui-même.
"""

import pytest

PROVIDER_ENV = (
    "BAI_API_KEY",
    "BAI_BASE_URL",
    "BAI_MODEL",
    "OPENROUTER_API_KEY",
    "USINE_MODEL",
)


@pytest.fixture(autouse=True)
def _no_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PROVIDER_ENV:
        monkeypatch.delenv(name, raising=False)
