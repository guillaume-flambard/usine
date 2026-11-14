"""La chaîne de connexion est assemblée à un seul endroit (MEM-7)."""

from usine_api.settings import database_url


def test_no_database_means_empty_string():
    assert database_url({}) == ""


def test_explicit_url_wins():
    env = {"DATABASE_URL": "postgresql://a@b:1/c", "POSTGRES_HOST": "db"}
    assert database_url(env) == "postgresql://a@b:1/c"


def test_assembled_from_parts_with_defaults():
    env = {"POSTGRES_HOST": "db", "POSTGRES_PASSWORD": "x"}
    assert database_url(env) == "postgresql://usine:x@db:5432/usine"


def test_special_characters_are_escaped():
    env = {"POSTGRES_HOST": "db", "POSTGRES_PASSWORD": "p@ss/w:rd"}
    assert database_url(env) == "postgresql://usine:p%40ss%2Fw%3Ard@db:5432/usine"


def test_without_password():
    env = {"POSTGRES_HOST": "db", "POSTGRES_USER": "u", "POSTGRES_DB": "d", "POSTGRES_PORT": "6543"}
    assert database_url(env) == "postgresql://u@db:6543/d"
