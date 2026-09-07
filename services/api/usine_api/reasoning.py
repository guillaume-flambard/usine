"""Le relais de raisonnement.

Il existe pour une seule raison : garder la clé du fournisseur côté serveur.
Une clé dans un paquet client se lit dans l'onglet réseau et se vide.

Ce qui entre est borné, ce qui sort est borné, et le fournisseur est injecté —
un test ne joint jamais le réseau, et changer de fournisseur ne demande pas de
toucher à la route.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from .limits import Limits

DEFAULT_MODEL = "deepseek/deepseek-v4-flash"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

#: Un vocabulaire plus gros que ça n'est pas un vocabulaire, c'est une charge
#: utile déguisée.
MAX_TOOLS_BYTES = 40_000

#: Seuls ces rôles peuvent demander à raisonner.
ROLES = frozenset({"planner", "architect", "sceptic", "agent", "master-agent"})

# Délibérément minimal : l'instruction de l'appelant porte le format, souvent un
# objet JSON strict. Une consigne système exigeant « du texte brut, trois
# phrases » se battait contre elle, et chaque tour revenait illisible.
SYSTEM_PROMPT = (
    "Tu es un agent d'une chaîne de production logicielle. Réponds en français. "
    "Suis exactement le format que l'instruction demande, sans préambule ni "
    "commentaire autour."
)


class Refusal(Exception):
    """Une demande qui ne doit pas atteindre le fournisseur.

    Porte le code HTTP avec elle : la route n'a pas à deviner si un refus est
    une erreur du client, un quota, ou un fournisseur en panne.
    """

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class ToolCall:
    """Une action, telle que le fournisseur l'a émise."""

    name: str
    #: Encore en texte : le navigateur les relit comme donnée hostile.
    arguments: str


@dataclass(frozen=True)
class Reasoning:
    """Ce que le relais rend au navigateur. Jamais plus que ça."""

    text: str
    model: str
    tokens: dict[str, int]
    calls: list[ToolCall] = field(default_factory=list)
    #: Vrai quand le fournisseur a coupé la sortie au budget. Un texte coupé
    #: finit au milieu d'une phrase, et l'appelant ne peut pas le voir depuis
    #: le texte seul : le fait voyage, il ne se devine pas.
    truncated: bool = False


class Caller(Protocol):
    """Comment on joint le fournisseur. Injecté pour que les tests s'en passent."""

    async def __call__(
        self, url: str, *, headers: dict[str, str], payload: dict[str, Any]
    ) -> tuple[int, Any]: ...


async def reason(
    *,
    role: str,
    instruction: str,
    context: str,
    key: str,
    model: str,
    origin: str,
    call: Caller,
    limits: Limits,
    tools: Any | None = None,
) -> Reasoning:
    """Un tour de raisonnement, borné des deux côtés."""
    if role not in ROLES:
        raise Refusal(400, f"rôle inconnu : {role}")
    if not key:
        raise Refusal(503, "aucune clé configurée sur le relais")

    payload = {
        "model": model,
        "max_tokens": limits.max_output,
        # Raisonnement coupé, délibérément. Un modèle de raisonnement dépense
        # tout le budget de sortie à réfléchir et rend un contenu vide :
        # mesuré, deux appels sur trois revenaient avec 1200 tokens de
        # raisonnement et pas un caractère. Ce qu'on demande ici est un objet
        # JSON de forme fixe, pas une délibération.
        "reasoning": {"enabled": False},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Rôle : {role}\n"
                    f"Tâche : {instruction[: limits.max_instruction]}\n\n"
                    f"Contexte :\n{context[: limits.max_context]}"
                ),
            },
        ],
    }

    # Le vocabulaire vient de l'appelant : il le décrit, et le relais n'en tient
    # pas une seconde copie qui dériverait. Il le borne, c'est tout.
    #
    # `tool_choice: required` parce qu'un tour sans action est un tour perdu :
    # l'agent a dépensé un appel pour dire quelque chose et n'a rien fait.
    if tools is not None:
        if len(json.dumps(tools)) > MAX_TOOLS_BYTES:
            raise Refusal(400, "vocabulaire d'outils trop grand")
        payload["tools"] = tools
        payload["tool_choice"] = "required"

    headers = {
        "authorization": f"Bearer {key}",
        "content-type": "application/json",
        "http-referer": origin,
        # ASCII uniquement : un en-tête HTTP est une ByteString, un tiret cadratin lève.
        "x-title": "Usine agentique - Memo Labs",
    }

    try:
        status, body = await call(ENDPOINT, headers=headers, payload=payload)
    except Refusal:
        raise
    except Exception as cause:  # noqa: BLE001 — toute panne du fournisseur est un 502
        raise Refusal(502, str(cause) or "appel au modèle impossible") from cause

    if status >= 400:
        # Le message du fournisseur peut contenir n'importe quoi : il ne
        # ressort pas tel quel, seul son statut est public.
        raise Refusal(502, f"le modèle a refusé ({status})")

    choice = _first_choice(body)
    message = choice.get("message") or {}
    text = str(message.get("content") or "").strip()
    calls = _tool_calls(message)
    usage = body.get("usage") or {} if isinstance(body, dict) else {}

    # Une réponse vide a une cause, et la cause vaut mieux que le silence : un
    # modèle coupé en pleine sortie n'est pas un modèle qui n'avait rien à dire.
    if not text and not calls and choice.get("finish_reason") == "length":
        raise Refusal(
            502,
            f"réponse coupée à {limits.max_output} tokens sans texte utile",
        )

    return Reasoning(
        text=text,
        model=str(body.get("model") or model) if isinstance(body, dict) else model,
        tokens={
            "input": int(usage.get("prompt_tokens") or 0),
            "output": int(usage.get("completion_tokens") or 0),
        },
        calls=calls,
        truncated=choice.get("finish_reason") == "length",
    )


def _tool_calls(message: Any) -> list[ToolCall]:
    """Relit les appels d'outils. Le fournisseur est une source hostile."""
    if not isinstance(message, dict):
        return []
    raw = message.get("tool_calls")
    if not isinstance(raw, list):
        return []

    calls: list[ToolCall] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        function = entry.get("function")
        if not isinstance(function, dict):
            continue
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue
        arguments = function.get("arguments")
        calls.append(ToolCall(name=name, arguments=arguments if isinstance(arguments, str) else ""))
    return calls


def _first_choice(body: Any) -> dict[str, Any]:
    """La première réponse, ou un objet vide. Le fournisseur est une source hostile."""
    if not isinstance(body, dict):
        return {}
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return {}
    first = choices[0]
    return first if isinstance(first, dict) else {}
