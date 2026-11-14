"""La chaîne de connexion est assemblée à un seul endroit (MEM-7).

Aucune valeur de mot de passe n'est écrite en clair ici : elles sont tirées au
hasard à chaque test, pour ne pas apprendre aux scanners de secrets à crier au
loup sur le dépôt.
"""

import secrets
from urllib.parse import quote

from usine_api.settings import database_url


def _random_password() -> str:
    # Des caractères qui exigent l'échappement dans une URL.
    return secrets.token_urlsafe(12) + "@/:"


def test_no_database_means_empty_string():
    assert database_url({}) == ""


def test_explicit_url_wins():
    env = {"DATABASE_URL": "postgresql://a@b:1/c", "POSTGRES_HOST": "db"}
    assert database_url(env) == "postgresql://a@b:1/c"


def test_assembled_from_parts_with_escaping():
    value = _random_password()
    env = {"POSTGRES_HOST": "db", "POSTGRES_PASSWORD": value}
    assert database_url(env) == f"postgresql://usine:{quote(value, safe='')}@db:5432/usine"


def test_password_file_wins_over_variable(tmp_path):
    value = _random_password()
    secret = tmp_path / "postgres_password"
    secret.write_text(value + "\n", encoding="utf-8")
    env = {
        "POSTGRES_HOST": "db",
        "POSTGRES_PASSWORD_FILE": str(secret),
        "POSTGRES_PASSWORD": _random_password(),
    }
    assert database_url(env) == f"postgresql://usine:{quote(value, safe='')}@db:5432/usine"


def test_without_password():
    env = {"POSTGRES_HOST": "db", "POSTGRES_USER": "u", "POSTGRES_DB": "d", "POSTGRES_PORT": "6543"}
    assert database_url(env) == "postgresql://u@db:6543/d"
