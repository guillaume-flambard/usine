"""Ce que l'écran des portes lit, et ce qu'il refuse de lire.

La fixture n'est pas inventée : c'est la sortie réelle du harnais d'`acheteur`,
neuf cas joués contre le vrai modèle le 2026-09-10. Un test de lecture écrit
contre une forme imaginée ne prouve que l'imagination de son auteur.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from usine_api.portes import Absent, lire

FIXTURES = Path(__file__).parent / "fixtures"


def test_lit_la_mesure_reelle() -> None:
    mesure = lire("acheteur", FIXTURES)
    assert mesure["agent"] == "acheteur"
    assert mesure["total"] == 9
    assert mesure["conformes"] == 9
    # L'étiquette doit voyager : sans elle, l'écran ne saurait pas s'il montre
    # la version en service ou une candidate, et laisserait promouvoir à l'aveugle.
    assert mesure["invites"] == "production"
    cas = mesure["cas"]
    assert len(cas) == 9
    assert {c["porte"] for c in cas} == {"denombrable", "joignable", "paye deja", "delai"}
    # Ce que le rapport texte jetait : les cas PASSES, avec leur raison.
    passes = [c for c in cas if c["conforme"]]
    assert len(passes) == 9
    assert all(c["raison"] for c in passes)
    assert all(c["pourquoi"] for c in cas)


def test_agent_inconnu(tmp_path: Path) -> None:
    with pytest.raises(Absent) as absent:
        lire("acheteur", tmp_path)
    assert "aucune mesure" in absent.value.message


def test_refuse_un_nom_qui_sort_du_dossier(tmp_path: Path) -> None:
    # Un nom d'agent est un segment de chemin : il ne remonte pas.
    for mauvais in ("../secret", "..", "a/b", "ACHETEUR", ""):
        with pytest.raises(Absent) as absent:
            lire(mauvais, tmp_path)
        assert "invalide" in absent.value.message


def test_refuse_une_mesure_illisible(tmp_path: Path) -> None:
    (tmp_path / "acheteur.json").write_text("{ pas du json", encoding="utf-8")
    with pytest.raises(Absent) as absent:
        lire("acheteur", tmp_path)
    assert "illisible" in absent.value.message


def test_refuse_une_mesure_de_mauvaise_forme(tmp_path: Path) -> None:
    (tmp_path / "acheteur.json").write_text(json.dumps({"agent": "acheteur"}), encoding="utf-8")
    with pytest.raises(Absent) as absent:
        lire("acheteur", tmp_path)
    assert "forme inattendue" in absent.value.message
