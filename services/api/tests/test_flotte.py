"""Ce que l'écran de la flotte lit, et ce qu'il refuse de dire.

La fixture est la vraie sortie de l'observateur sur les huit agents du lab, le
2026-09-10. Un test de lecture écrit contre une forme imaginée ne prouve que
l'imagination de son auteur.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from usine_api.flotte import FRAICHE_MINUTES, lire
from usine_api.portes import Absent

FIXTURES = Path(__file__).parent / "fixtures"


def test_lit_la_vraie_flotte() -> None:
    vue = lire(FIXTURES / "flotte.json")
    assert len(vue["agents"]) == 8
    # Le compte qui fait la réponse en dix secondes.
    assert vue["alertes"] == sum(len(a["alertes"]) for a in vue["agents"])
    assert all(a["nom"] for a in vue["agents"])


def test_une_photo_ancienne_ne_se_dit_pas_fraiche(tmp_path: Path) -> None:
    # Le seul mensonge qu'un écran de surveillance ne peut pas se permettre :
    # un « tout va bien » calculé sur une photo de deux heures.
    vieux = datetime.now() - timedelta(minutes=FRAICHE_MINUTES + 5)
    fichier = tmp_path / "flotte.json"
    fichier.write_text(
        json.dumps({"le": vieux.isoformat(timespec="seconds"), "alertes": 0, "agents": []}),
        encoding="utf-8",
    )
    vue = lire(fichier)
    assert vue["fraiche"] is False
    assert vue["age_minutes"] >= FRAICHE_MINUTES


def test_une_photo_recente_est_fraiche(tmp_path: Path) -> None:
    fichier = tmp_path / "flotte.json"
    fichier.write_text(
        json.dumps(
            {"le": datetime.now().isoformat(timespec="seconds"), "alertes": 0, "agents": []}
        ),
        encoding="utf-8",
    )
    assert lire(fichier)["fraiche"] is True


def test_dit_quand_l_observateur_n_a_rien_depose(tmp_path: Path) -> None:
    with pytest.raises(Absent) as absent:
        lire(tmp_path / "absent.json")
    assert "invisible" in absent.value.message


def test_refuse_une_observation_de_mauvaise_forme(tmp_path: Path) -> None:
    fichier = tmp_path / "flotte.json"
    fichier.write_text(json.dumps({"le": "2026-09-10T16:00:00"}), encoding="utf-8")
    with pytest.raises(Absent) as absent:
        lire(fichier)
    assert "forme inattendue" in absent.value.message
