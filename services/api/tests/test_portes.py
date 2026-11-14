"""Ce que l'écran des portes lit, et ce qu'il refuse de lire.

La fixture n'est pas inventée : c'est la sortie réelle du harnais d'`acheteur`,
neuf cas joués contre le vrai modèle le 2026-09-10. Un test de lecture écrit
contre une forme imaginée ne prouve que l'imagination de son auteur.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from usine_api.app import create_app
from usine_api.invites import etat, etiqueter
from usine_api.portes import Absent, lancer, lire, lister, suivre

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


def test_liste_les_agents_mesures() -> None:
    # Ce que l'écran unique lit pour savoir quels agents portent une décision.
    resumes = lister(FIXTURES)
    assert [r["agent"] for r in resumes] == ["acheteur"]
    assert resumes[0]["conformes"] == 9
    assert resumes[0]["total"] == 9
    assert resumes[0]["invites"] == "production"


def test_la_liste_ecarte_les_mesures_lancees_depuis_l_ecran(tmp_path: Path) -> None:
    # `<agent>-<etiquette>.json` est ce qu'écrit une mesure lancée depuis
    # l'écran, dans le même dossier. Le tiret est légal dans un nom d'agent :
    # sans le filtre, la flotte gagnerait un agent « acheteur-candidat ».
    mesure = json.loads((FIXTURES / "acheteur.json").read_text(encoding="utf-8"))
    (tmp_path / "acheteur.json").write_text(json.dumps(mesure), encoding="utf-8")
    (tmp_path / "acheteur-candidat.json").write_text(json.dumps(mesure), encoding="utf-8")
    assert [r["agent"] for r in lister(tmp_path)] == ["acheteur"]


def test_la_liste_ignore_un_fichier_illisible(tmp_path: Path) -> None:
    # Un verdict corrompu ne doit pas vider la liste : les autres agents
    # gardent une décision à prendre.
    mesure = json.loads((FIXTURES / "acheteur.json").read_text(encoding="utf-8"))
    (tmp_path / "acheteur.json").write_text(json.dumps(mesure), encoding="utf-8")
    (tmp_path / "courtier.json").write_text("{ pas du json", encoding="utf-8")
    assert [r["agent"] for r in lister(tmp_path)] == ["acheteur"]


def test_la_liste_est_vide_quand_le_dossier_ne_porte_rien(tmp_path: Path) -> None:
    # Dossier configuré mais vide : là, la liste vide est la vérité.
    assert lister(tmp_path) == []


def test_la_liste_leve_sans_dossier_configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PORTES_DIR", raising=False)
    with pytest.raises(Absent) as absent:
        lister()
    assert "PORTES_DIR" in absent.value.message


def test_la_route_rend_la_liste(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le seul appel que la page unique fait au chargement pour savoir quels
    # agents portent une décision.
    monkeypatch.setenv("PORTES_DIR", str(FIXTURES))
    client = TestClient(create_app(key=None, call=None))
    reponse = client.get("/portes")
    assert reponse.status_code == 200
    assert [p["agent"] for p in reponse.json()["portes"]] == ["acheteur"]


def test_la_route_sans_dossier_refuse_de_rendre_une_liste_vide(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # C'est le cas de la production, où `PORTES_DIR` n'est pas posé. Une liste
    # vide s'y lirait « aucune décision ne t'attend », alors que la fonction est
    # éteinte. L'écran doit pouvoir dire « je ne sais pas ».
    monkeypatch.delenv("PORTES_DIR", raising=False)
    client = TestClient(create_app(key=None, call=None))
    reponse = client.get("/portes")
    assert reponse.status_code == 404
    assert "PORTES_DIR" in reponse.json()["error"]


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


def test_refuse_une_etiquette_hors_liste(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # L'étiquette part dans l'environnement d'un sous-processus lancé depuis une
    # requête HTTP. Deux valeurs sont légitimes, et seulement deux.
    monkeypatch.setenv("LAB_INFRA_DIR", str(tmp_path))
    for mauvaise in ("PATH", "production; rm -rf /", "candidat ", "", "CANDIDAT"):
        with pytest.raises(Absent) as absent:
            lancer("acheteur", mauvaise, tmp_path / "sortie.json")
        assert "étiquette" in absent.value.message


def test_refuse_un_agent_sans_harnais(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LAB_INFRA_DIR", str(tmp_path))
    with pytest.raises(Absent) as absent:
        lancer("acheteur", "candidat", tmp_path / "sortie.json")
    assert "aucun harnais" in absent.value.message


def test_refuse_sans_depot_configure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LAB_INFRA_DIR", raising=False)
    with pytest.raises(Absent) as absent:
        lancer("acheteur", "candidat", tmp_path / "sortie.json")
    assert "LAB_INFRA_DIR" in absent.value.message


def test_suivre_une_mesure_inconnue() -> None:
    with pytest.raises(Absent) as absent:
        suivre("pas-un-identifiant")
    assert "inconnue" in absent.value.message


# --- Les invites, et le geste qui les met en service ----------------------


def test_refuse_une_etiquette_de_promotion_hors_liste(monkeypatch: pytest.MonkeyPatch) -> None:
    # Ce point d'entrée change ce que les agents en service utilisent. Deux
    # valeurs sont légitimes : mettre en service, ou écarter en gardant la trace.
    monkeypatch.setenv("LANGFUSE_HOST", "https://exemple.invalid")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    for mauvaise in ("latest", "candidat", "", "PRODUCTION"):
        with pytest.raises(Absent) as absent:
            etiqueter("acheteur", "porte-denombrable", 1, mauvaise)
        assert "étiquette refusée" in absent.value.message


def test_refuse_une_invite_qui_n_est_pas_une_porte(monkeypatch: pytest.MonkeyPatch) -> None:
    # `acheteur/systeme` et `acheteur/message` existent aussi dans Langfuse.
    # Elles ne sont pas des portes et n'ont rien à faire derrière ce bouton.
    monkeypatch.setenv("LANGFUSE_HOST", "https://exemple.invalid")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
    for mauvaise in ("systeme", "message", "../porte-x"):
        with pytest.raises(Absent) as absent:
            etiqueter("acheteur", mauvaise, 1, "production")
        assert "porte inconnue" in absent.value.message


def test_dit_quand_langfuse_n_est_pas_configure(monkeypatch: pytest.MonkeyPatch) -> None:
    for nom in ("LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"):
        monkeypatch.delenv(nom, raising=False)
    with pytest.raises(Absent) as absent:
        etat("acheteur")
    assert "Langfuse n'est pas configuré" in absent.value.message
