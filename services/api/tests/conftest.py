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
    # Tracing: a dev machine's Langfuse keys must never reach the tests.
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_HOST",
    "LANGFUSE_BASE_URL",
    "USINE_SCRIPTED_MODELS",
    # Une base de dev lancée par le compose ne doit jamais être prise par les tests.
    "DATABASE_URL",
    "POSTGRES_HOST",
    # Pocket ID (MEM-60): a dev machine's client must never reach the tests.
    "USINE_OIDC_ISSUER",
    "USINE_OIDC_CLIENT_ID",
    "USINE_OIDC_CLIENT_SECRET",
    "USINE_OIDC_REDIRECT_URI",
    "USINE_OIDC_ALLOWED_SUBS",
)


@pytest.fixture(autouse=True)
def _no_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PROVIDER_ENV:
        monkeypatch.delenv(name, raising=False)
    # Most tests exercise the atelier's routes, not its door: they run it open.
    # The door has its own tests (test_atelier_lock.py), which close it.
    monkeypatch.setenv("USINE_ATELIER_OUVERT", "1")
