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
        # Short enough for a graph card (three lines), and rounded: a duration
        # read "180.003 pour une limite de 180.0" (16 November 2026).
        unit = " s" if error.kind == "durée" else ""
        of = "d’" if error.kind[:1] in "aeéiou" else "de "
        limit = f"{round(float(error.limit), 1):g}{unit}"
        # A timeout stops right at the limit: "180 s pour 180 s" read as nonsense.
        measured = f"limite {limit}" if unit else f"{round(float(error.actual), 1):g} pour {limit}"
        return (
            f"Budget {of}{error.kind.replace(chr(39), '’')} dépassé ({measured}). "
            "Rien n’est parti au-delà."
        )
    if isinstance(error, CassetteMiss):
        # The showcase (MEM-24) answers one recorded brief: say so, rather than
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
