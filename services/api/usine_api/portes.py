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
