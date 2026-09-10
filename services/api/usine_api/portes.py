"""Les verdicts des portes, tels que le harnais les a écrits.

Ce module ne juge rien et n'appelle aucun modèle : il lit ce que
`eval-portes.py` a déposé et le rend tel quel. C'est délibéré et c'est la
frontière que le Vault fixe entre les deux dépôts : `lab-infra` exécute et
juge, l'usine montre et fait décider.

Relire plutôt que rejouer a une conséquence qu'il faut assumer : ce qui est
affiché date de la dernière mesure. La réponse porte donc `le` et `invites`,
l'instant et l'étiquette sous laquelle la mesure a été faite. Un écran qui
montrerait des verdicts sans dire de quand ils datent laisserait promouvoir une
invite sur la foi d'une mesure d'avant-hier.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

#: Un nom d'agent est un segment de chemin. Le borner ici plutôt que de faire
#: confiance au routeur : `..%2f` a déjà servi à sortir d'un dossier ailleurs.
NOM = re.compile(r"^[a-z][a-z0-9-]{0,40}$")


class Absent(Exception):
    """Aucune mesure lisible pour cet agent."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def dossier() -> Path | None:
    """Où les harnais déposent leurs verdicts. Absent = fonction éteinte."""
    valeur = os.environ.get("PORTES_DIR", "").strip()
    return Path(valeur) if valeur else None


def lire(agent: str, racine: Path | None = None) -> dict[str, Any]:
    """Rend la dernière mesure d'un agent, ou lève `Absent`."""
    if not NOM.match(agent):
        raise Absent("nom d'agent invalide")
    base = racine if racine is not None else dossier()
    if base is None:
        raise Absent("aucun dossier de verdicts configuré (PORTES_DIR)")
    fichier = base / f"{agent}.json"
    try:
        brut = fichier.read_text(encoding="utf-8")
    except OSError:
        raise Absent(f"aucune mesure pour « {agent} »") from None
    try:
        mesure = json.loads(brut)
    except json.JSONDecodeError as cause:
        raise Absent(f"mesure illisible pour « {agent} » : {cause}") from None
    if not isinstance(mesure, dict) or not isinstance(mesure.get("cas"), list):
        raise Absent(f"mesure de forme inattendue pour « {agent} »")
    return mesure


def lister(racine: Path | None = None) -> list[dict[str, Any]]:
    """Les agents dont une mesure est lisible, avec leur score.

    L'écran unique en a besoin pour savoir, sans ouvrir quoi que ce soit, quels
    agents portent une décision. Il ne rend que ce que le fichier contient
    déjà : rien n'est rejoué ici, et un agent sans mesure n'apparaît pas plutôt
    que d'apparaître à zéro sur zéro, ce qui se lirait comme un échec.
    """
    base = racine if racine is not None else dossier()
    if base is None:
        return []
    resumes: list[dict[str, Any]] = []
    try:
        fichiers = sorted(base.glob("*.json"))
    except OSError:
        return []
    for fichier in fichiers:
        agent = fichier.stem
        # Les mesures lancées depuis l'écran s'écrivent `<agent>-<etiquette>.json`
        # à côté des verdicts, et `NOM` les accepte : le tiret y est légal, donc
        # un agent « acheteur-candidat » entrerait dans la liste alors qu'il
        # n'existe pas. Le suffixe est ce qui les distingue, et il est borné par
        # `ETIQUETTES`, pas deviné.
        if not NOM.match(agent):
            continue
        if any(agent.endswith(f"-{etiquette}") for etiquette in ETIQUETTES):
            continue
        try:
            mesure = lire(agent, base)
        except Absent:
            continue
        resumes.append(
            {
                "agent": agent,
                "le": mesure.get("le"),
                "invites": mesure.get("invites"),
                "total": mesure.get("total"),
                "conformes": mesure.get("conformes"),
            }
        )
    return resumes


# --- Lancer le harnais, sans bloquer la requête ---------------------------
#
# Une mesure prend une minute et plus : la rendre au bout d'un POST bloquant
# serait précisément ce que la règle « une IA qui réfléchit doit se voir
# réfléchir » interdit. Le lancement rend un identifiant tout de suite, le
# travail continue derrière, et l'écran lit l'avancement.
#
# Ce qui est diffusé n'est pas inventé : le harnais imprime déjà une ligne par
# cas, au moment où il le joue. On les relaie telles quelles.

#: Les seules étiquettes qu'on accepte de mesurer. `production` est ce qui sert,
#: `candidat` est ce que le correcteur dépose avant de promouvoir. Toute autre
#: valeur serait une variable d'environnement arbitraire passée à un
#: sous-processus depuis une requête HTTP.
ETIQUETTES = frozenset({"production", "candidat"})


@dataclass
class Mesure:
    """Une mesure en cours, ou finie."""

    id: str
    agent: str
    invites: str
    debut: float
    lignes: list[str] = field(default_factory=list)
    fini: bool = False
    verdict: dict[str, Any] | None = None
    echec: str | None = None

    def vue(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "agent": self.agent,
            "invites": self.invites,
            "secondes": round(time.monotonic() - self.debut),
            "lignes": list(self.lignes),
            "fini": self.fini,
            "verdict": self.verdict,
            "echec": self.echec,
        }


_mesures: dict[str, Mesure] = {}
_verrou = threading.Lock()


def racine_lab() -> Path | None:
    valeur = os.environ.get("LAB_INFRA_DIR", "").strip()
    return Path(valeur) if valeur else None


def _jouer(mesure: Mesure, dossier_agent: Path, sortie: Path) -> None:
    env = dict(os.environ)
    env["LANGFUSE_INVITES_LABEL"] = mesure.invites
    # `invites.py` construit la clé `{LANGFUSE_AGENT}/{nom}`. Sans cette
    # variable elle vaudrait `agent/porte-…`, Langfuse rendrait 404, et le
    # harnais retomberait sur le défaut du code EN CROYANT mesurer la
    # candidate. Le service connaît l'agent : c'est à lui de la poser.
    env["LANGFUSE_AGENT"] = mesure.agent
    env["EVAL_JSON"] = str(sortie)
    env["EVAL_VERDICT"] = str(sortie.with_suffix(".txt"))
    env["PYTHONPATH"] = str(dossier_agent.parent / "_partage")
    # Sans ça, rien n'arrive avant la fin. Python bloc-bufferise sa sortie dès
    # qu'elle n'est plus un terminal : les lignes du harnais s'accumuleraient
    # pour tomber d'un coup au dernier cas, et la trace « vivante » ne montrerait
    # rien pendant la minute où il y a justement quelque chose à montrer.
    env["PYTHONUNBUFFERED"] = "1"
    try:
        processus = subprocess.Popen(  # noqa: S603 — argv fixe, aucun shell
            ["python3", "eval-portes.py"],
            cwd=str(dossier_agent),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as cause:
        with _verrou:
            mesure.echec, mesure.fini = f"harnais injouable : {cause}", True
        return

    assert processus.stdout is not None
    for ligne in processus.stdout:
        propre = ligne.rstrip()
        if propre:
            with _verrou:
                mesure.lignes.append(propre)
    processus.wait()

    try:
        verdict = json.loads(sortie.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as cause:
        with _verrou:
            mesure.echec = f"le harnais n'a rien rendu de lisible : {cause}"
            mesure.fini = True
        return
    with _verrou:
        mesure.verdict, mesure.fini = verdict, True


def lancer(agent: str, invites: str, sortie: Path) -> Mesure:
    """Démarre une mesure et rend son état initial. Lève `Absent` si impossible."""
    if not NOM.match(agent):
        raise Absent("nom d'agent invalide")
    if invites not in ETIQUETTES:
        raise Absent(f"étiquette d'invites refusée : {invites!r}")
    racine = racine_lab()
    if racine is None:
        raise Absent("aucun dépôt d'agents configuré (LAB_INFRA_DIR)")
    dossier_agent = racine / "stacks" / agent
    if not (dossier_agent / "eval-portes.py").is_file():
        raise Absent(f"aucun harnais pour « {agent} »")

    mesure = Mesure(id=uuid.uuid4().hex[:12], agent=agent, invites=invites, debut=time.monotonic())
    with _verrou:
        _mesures[mesure.id] = mesure
    threading.Thread(target=_jouer, args=(mesure, dossier_agent, sortie), daemon=True).start()
    return mesure


def suivre(identifiant: str) -> Mesure:
    with _verrou:
        mesure = _mesures.get(identifiant)
    if mesure is None:
        raise Absent("mesure inconnue")
    return mesure
