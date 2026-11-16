"""What a person reads when something fails.

One wording for the whole run: the stream says why a run stopped, and the graph
says why one specialist did not finish while the others went on. The detail goes
to the log, never to the page.
"""

from __future__ import annotations

import openai

from usine_api.cassette import CassetteMiss
from usine_api.specialists.contract import BudgetExceeded


def readable_error(error: BaseException) -> str:
    """What the person reads. The detail goes to the log, never to the page."""
    if isinstance(error, openai.RateLimitError):
        return "Le modèle est saturé pour le moment (429). Réessayez dans une minute."
    if isinstance(error, openai.APITimeoutError):
        return "Le modèle n'a pas répondu à temps. Réessayez."
    if isinstance(error, openai.APIConnectionError):
        return "La passerelle de modèles est injoignable."
    if isinstance(error, openai.APIStatusError):
        return f"Le modèle a refusé la requête (erreur {error.status_code})."
    if isinstance(error, BudgetExceeded):
        return (
            f"Un spécialiste a dépassé son budget ({error.kind}) : {error.actual} "
            f"pour une limite de {error.limit}. Rien n'a été exécuté au-delà."
        )
    if isinstance(error, CassetteMiss):
        # The demo (MEM-24) answers one recorded brief: say so, rather than
        # blaming an internal error for a question nobody recorded.
        return (
            "Aucun modèle n'est branché : ce run rejoue des réponses enregistrées "
            "et ne connaît que son brief. Branchez un modèle pour poser une autre question."
        )
    if isinstance(error, NoSpecialistFinished):
        return str(error)
    return "Le run a échoué sur une erreur interne. Elle est journalisée."


class NoSpecialistFinished(Exception):
    """Every specialist failed: there is nothing to synthesise, the run stops."""

    def __init__(self, reasons: list[str]) -> None:
        super().__init__("Aucun spécialiste n'a abouti : " + " ; ".join(dict.fromkeys(reasons)))
