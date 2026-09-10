"""Les invites des portes, lues et promues dans Langfuse.

Ce module ne réécrit rien et n'appelle aucun modèle. Il lit ce que le correcteur
a déposé et applique la décision d'un humain. Le contrat est celui de
`lab-infra/stacks/_partage/invites.py`, vérifié contre l'instance qui tourne et
pas contre la doc : lecture par étiquette, promotion par `newLabels` sur une
version.

Une étiquette est UNIQUE dans Langfuse : poser `production` sur une version la
retire de celle qui l'avait. C'est ce qui rend la promotion irréversible d'un
geste, et c'est pourquoi elle passe par une décision explicite.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .portes import NOM, Absent

#: L'étiquette que le correcteur pose sur ce qu'il propose, et celle qui sert.
CANDIDAT = "candidat"
SERVICE = "production"
#: Ce qu'on pose sur une candidate écartée. La trace reste : supprimer
#: effacerait la raison de ne pas recommencer.
#:
#: MESURÉ, et contraire à ce que je croyais en l'écrivant : `newLabels` AJOUTE
#: une étiquette, il ne remplace pas le jeu. Une version écartée garde donc
#: `candidat` en plus d'`ecartee`. L'unicité annoncée par `invites.py` vaut par
#: ÉTIQUETTE, entre versions : poser `production` sur la v2 la retire de la v1,
#: mais poser `ecartee` ne chasse pas `candidat` de la même version.
#:
#: Aucune route de retrait n'est exposée par l'instance qui tourne. La décision
#: est donc lue plutôt que forcée : une version qui porte `ecartee` a été jugée,
#: elle n'est plus en attente. C'est vrai quelle que soit la sémantique des
#: étiquettes, et ça garde la trace visible.
ECARTEE = "ecartee"


def _config() -> tuple[str, str]:
    hote = os.environ.get("LANGFUSE_HOST", "").rstrip("/")
    pub = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    sec = os.environ.get("LANGFUSE_SECRET_KEY", "")
    if not (hote and pub and sec):
        raise Absent("Langfuse n'est pas configuré (LANGFUSE_HOST, _PUBLIC_KEY, _SECRET_KEY)")
    return hote, base64.b64encode(f"{pub}:{sec}".encode()).decode()


def _appel(chemin: str, corps: dict[str, Any] | None = None, methode: str = "GET") -> Any:
    hote, jeton = _config()
    donnees = json.dumps(corps).encode() if corps is not None else None
    requete = urllib.request.Request(
        hote + chemin,
        data=donnees,
        method=methode,
        headers={"Authorization": "Basic " + jeton, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(requete, timeout=25) as reponse:  # noqa: S310 — hôte configuré
        brut = reponse.read()
    return json.loads(brut) if brut else None


def _version(cle: str, etiquette: str) -> dict[str, Any] | None:
    """Une version par son étiquette, ou None si personne ne la porte."""
    chemin = f"/api/public/v2/prompts/{urllib.parse.quote(cle, safe='')}?label={etiquette}"
    try:
        d = _appel(chemin)
    except urllib.error.HTTPError as erreur:
        if erreur.code == 404:
            return None
        raise Absent(f"Langfuse a répondu {erreur.code}") from None
    except OSError as cause:
        raise Absent(f"Langfuse injoignable : {cause}") from None
    return {
        "version": d.get("version"),
        "texte": str(d.get("prompt") or ""),
        "etiquettes": d.get("labels") or [],
    }


def portes_de(agent: str) -> list[str]:
    """Les invites de porte d'un agent, telles que Langfuse les connaît."""
    if not NOM.match(agent):
        raise Absent("nom d'agent invalide")
    try:
        d = _appel("/api/public/v2/prompts?limit=100")
    except urllib.error.HTTPError as erreur:
        raise Absent(f"Langfuse a répondu {erreur.code}") from None
    except OSError as cause:
        raise Absent(f"Langfuse injoignable : {cause}") from None
    prefixe = f"{agent}/porte-"
    return sorted(
        p["name"][len(f"{agent}/") :]
        for p in (d or {}).get("data", [])
        if str(p.get("name", "")).startswith(prefixe)
    )


def etat(agent: str) -> dict[str, Any]:
    """Pour chaque porte : ce qui sert, ce qui attend, ce qui a été écarté."""
    invites = []
    for nom in portes_de(agent):
        cle = f"{agent}/{nom}"
        candidat = _version(cle, CANDIDAT)
        # Une candidate déjà écartée n'attend plus rien. Elle reste montrée,
        # mais comme une décision prise et non comme un choix à faire.
        ecartee = candidat if candidat and ECARTEE in candidat["etiquettes"] else None
        invites.append(
            {
                "nom": nom,
                "service": _version(cle, SERVICE),
                "candidat": None if ecartee else candidat,
                "ecartee": ecartee,
            }
        )
    return {"agent": agent, "invites": invites}


def etiqueter(agent: str, nom: str, version: int, etiquette: str) -> dict[str, Any]:
    """Pose une étiquette sur une version. Le geste que le correcteur laisse à
    un humain quand il ne promeut pas lui-même."""
    if not NOM.match(agent) or not nom.startswith("porte-"):
        raise Absent("porte inconnue")
    if etiquette not in (SERVICE, ECARTEE):
        raise Absent(f"étiquette refusée : {etiquette!r}")
    cle = urllib.parse.quote(f"{agent}/{nom}", safe="")
    try:
        _appel(
            f"/api/public/v2/prompts/{cle}/versions/{int(version)}",
            {"newLabels": [etiquette]},
            "PATCH",
        )
    except urllib.error.HTTPError as erreur:
        raise Absent(f"Langfuse a refusé : {erreur.code}") from None
    except OSError as cause:
        raise Absent(f"Langfuse injoignable : {cause}") from None
    return {"agent": agent, "nom": nom, "version": int(version), "etiquette": etiquette}
