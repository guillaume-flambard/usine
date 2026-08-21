"""L'exécution d'outil côté serveur, bornée.

Letta le nomme comme la moitié de ce qui rend un agent difficile : *« an agent
service that supports arbitrary tools must use sandboxes (e.g. Modal, E2B) to
ensure secure execution »*. Voici le nôtre, et voici ce qu'il fait et ne fait
pas — le dire vaut mieux que de laisser croire.

**Ce qu'il borne** : le temps de calcul, la mémoire, la taille de la sortie, et
l'environnement — un outil ne voit aucune variable, donc aucune clé. Un outil
qui part en boucle ou qui alloue sans fin meurt, et le service continue de
servir. Les bornes sont posées au mieux : `RLIMIT_AS` est refusé par macOS, il
s'applique sur le Linux où le service tourne, et une borne absente n'annule pas
les autres — le temps, lui, est tenu de l'extérieur et sans exception.

**Ce qu'il ne borne pas** : la sortie réseau. Un sous-processus Python peut
ouvrir une socket, et rien ici ne l'en empêche. Ce n'est pas un oubli, c'est
une limite de l'outil : isoler le réseau demande un espace de noms, donc un
conteneur ou un service comme E2B. Ce qui protège aujourd'hui est **en amont** :
un outil ne reçoit jamais d'adresse, et les données qu'il traite ont été allées
chercher par le service sur une liste blanche. Le jour où un outil arbitraire
viendra d'ailleurs que de nous, ce module devra s'adosser à un conteneur — et
cette ligne sera la trace qu'on le savait.

La plupart du code écrit par un modèle n'a de toute façon rien à faire ici :
il tourne dans le fil isolé du navigateur, chez le visiteur. Ce module est
pour ce qui doit tourner côté serveur, et pour rien d'autre.
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass

#: Le temps qu'un outil a pour répondre.
TIMEOUT_SECONDS = 5

#: La mémoire qu'il peut prendre. Au-delà, il meurt plutôt que la machine.
MEMORY_BYTES = 256 * 1024 * 1024

#: Ce qu'il peut rendre. Une sortie démesurée est une sortie qu'on jette.
MAX_OUTPUT = 100_000

#: Le code qu'on accepte de recevoir.
MAX_CODE = 20_000


@dataclass(frozen=True)
class Outcome:
    """Ce qui revient d'un outil. Un échec est un résultat, jamais une panne."""

    output: str = ""
    failure: str = ""

    def as_json(self) -> dict[str, str]:
        return {"output": self.output} if not self.failure else {"failure": self.failure}


# Le préambule pose ses propres limites avant d'exécuter quoi que ce soit :
# `preexec_fn` n'est pas sûr dans un service, et un sous-processus qui se borne
# lui-même n'a pas besoin qu'on le borne de l'extérieur.
_BOOTSTRAP = """
import json, resource, sys

def bound(name, value):
    # Au mieux : toutes les bornes n'existent pas sur tous les systemes, et
    # RLIMIT_AS notamment est refuse par macOS pour un processus Python. Une
    # borne absente n'annule pas les autres — sur Linux, ou tourne le service,
    # elles s'appliquent toutes.
    limit = getattr(resource, name, None)
    if limit is None:
        return
    try:
        resource.setrlimit(limit, (value, value))
    except (ValueError, OSError):
        pass

bound("RLIMIT_CPU", {cpu})
bound("RLIMIT_AS", {memory})
bound("RLIMIT_FSIZE", 0)

payload = json.loads(sys.stdin.read())
scope = {{}}
try:
    exec(payload["code"], scope)
    tool = scope.get("tool")
    if not callable(tool):
        print(json.dumps({{"failure": "le code ne definit pas de fonction `tool`"}}))
    else:
        result = tool(payload["input"])
        text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        print(json.dumps({{"output": text[:{output}]}}))
except MemoryError:
    print(json.dumps({{"failure": "memoire depassee"}}))
except Exception as cause:
    print(json.dumps({{"failure": str(cause)[:400]}}))
"""


async def run_code(code: str, payload: str, *, timeout: int = TIMEOUT_SECONDS) -> Outcome:
    """Exécute un outil dans un sous-processus qui se borne lui-même."""
    if len(code) > MAX_CODE:
        return Outcome(failure="code trop long")

    bootstrap = _BOOTSTRAP.format(cpu=timeout, memory=MEMORY_BYTES, output=MAX_OUTPUT)
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        # `-I` isole : ni site-packages de l'utilisateur, ni variables
        # d'environnement, ni répertoire courant dans le chemin d'import.
        "-I",
        "-c",
        bootstrap,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Aucune variable d'environnement : la clé du fournisseur est dans
        # celle du service, et un outil n'a rien à y lire.
        env={},
    )

    request = json.dumps({"code": code, "input": payload})
    try:
        out, err = await asyncio.wait_for(
            process.communicate(request.encode("utf-8")), timeout=timeout + 1
        )
    except TimeoutError:
        # La seule défense qui marche contre une boucle sans fin.
        process.kill()
        await process.wait()
        return Outcome(failure=f"arrêté : plus de {timeout} s sans réponse")

    if process.returncode != 0 and not out:
        # Un dépassement de CPU tue le processus par signal : il n'a rien pu
        # écrire, et c'est à ça qu'on le reconnaît.
        detail = err.decode("utf-8", "replace").strip()[:200]
        return Outcome(failure=detail or f"arrêté (code {process.returncode})")

    try:
        answer = json.loads(out.decode("utf-8", "replace") or "{}")
    except ValueError:
        return Outcome(failure="l'outil n'a rien rendu de lisible")

    if not isinstance(answer, dict):
        return Outcome(failure="l'outil n'a rien rendu de lisible")
    if "failure" in answer:
        return Outcome(failure=str(answer["failure"])[:400])
    return Outcome(output=str(answer.get("output", ""))[:MAX_OUTPUT])
