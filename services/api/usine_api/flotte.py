"""La flotte des agents, telle que l'observateur l'a vue.

Ce module ne mesure rien et n'interroge aucun agent : il lit le fichier que
`agents-observe` dépose dans le vault. La frontière est la même que pour les
portes : `lab-infra` observe, l'usine montre.

La fraîcheur voyage avec les chiffres, et ce n'est pas un ornement. Le fichier
est régénéré toutes les quinze minutes ; un « tout va bien » calculé sur une
photo de deux heures est un mensonge, et c'est le seul mensonge qu'un écran de
surveillance ne peut pas se permettre, parce qu'on cesse alors de le lire.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from .portes import Absent

#: Au-delà, la photo n'est plus une photo. L'observateur passe toutes les 15
#: minutes : le double laisse passer un retard sans crier, et attrape un
#: observateur qui a cessé de tourner.
FRAICHE_MINUTES = 30


def fichier() -> Path | None:
    valeur = os.environ.get("FLOTTE_JSON", "").strip()
    return Path(valeur) if valeur else None


def lire(chemin: Path | None = None) -> dict[str, Any]:
    """La flotte, plus l'âge de la mesure. Lève `Absent` si illisible."""
    cible = chemin if chemin is not None else fichier()
    if cible is None:
        raise Absent("aucun fichier de flotte configuré (FLOTTE_JSON)")
    try:
        brut = cible.read_text(encoding="utf-8")
    except OSError:
        raise Absent("l'observateur n'a rien déposé : la flotte est invisible") from None
    try:
        vue = json.loads(brut)
    except json.JSONDecodeError as cause:
        raise Absent(f"observation illisible : {cause}") from None
    if not isinstance(vue, dict) or not isinstance(vue.get("agents"), list):
        raise Absent("observation de forme inattendue")

    minutes = _age_minutes(str(vue.get("le") or ""))
    vue["age_minutes"] = minutes
    # Périmée, on le DIT plutôt que de rendre un vert rassurant. Un ecran qui
    # ment une fois n'est plus consulte.
    vue["fraiche"] = minutes is not None and minutes <= FRAICHE_MINUTES
    return vue


def _age_minutes(iso: str) -> int | None:
    try:
        vu = datetime.fromisoformat(iso)
    except ValueError:
        return None
    ecart = (datetime.now(tz=vu.tzinfo) - vu).total_seconds()
    return max(0, int(ecart // 60))
