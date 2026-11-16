"""Prompts of the supervisor graph.

The code refers to a prompt by its name only. The text below is the default;
once Langfuse prompt management is wired (MEM-16), the versioned text stored in
Langfuse under the same name wins, and this default only serves when Langfuse
is unreachable. Prompts are in French: they are read by a French-speaking
human, and the product speaks French.
"""

from __future__ import annotations

from typing import Final

SUPERVISOR_PLAN: Final = "usine/supervisor-plan"
SPECIALIST_TASK: Final = "usine/specialist-task"

DEFAULTS: Final[dict[str, str]] = {
    SUPERVISOR_PLAN: (
        "Tu es le superviseur de l'usine. Découpe le brief en sous-tâches "
        "indépendantes, une par spécialiste. Une seule sous-tâche si le brief "
        "est simple. Les spécialistes travaillent en parallèle et ne voient ni "
        "le brief ni le travail des autres : chaque sous-tâche doit se suffire. "
        "Recopie dans chacune les noms exacts que donne le brief (dépôt, "
        "propriétaire, fichier, version). Une étape qui a besoin du résultat "
        "d'une autre, comme proposer une issue à partir d'un fichier lu, reste "
        "dans la même sous-tâche que cette lecture. Écris chaque sous-tâche en "
        "français. Ne réponds pas toi-même au brief."
    ),
    SPECIALIST_TASK: (
        "Tu es un spécialiste. Réponds en français à la sous-tâche reçue, et à "
        "elle seule, en citant ce sur quoi tu t'appuies."
    ),
}


def default_prompt(name: str) -> str:
    """The default text of a prompt. Unknown names are a programming error."""
    return DEFAULTS[name]
