"""Le bac à sable côté serveur.

Ce qu'il borne : le temps, la mémoire, la sortie. Ce qu'il ne borne pas est
écrit dans le module, et un test le rappelle ici plutôt que de le taire.
"""

from __future__ import annotations

import os

from usine_api.sandbox import MAX_OUTPUT, run_code


async def test_a_tool_runs_and_answers() -> None:
    outcome = await run_code("def tool(entree):\n    return entree.upper()", "bonjour")

    assert outcome.output == "BONJOUR"
    assert outcome.failure == ""


async def test_a_result_that_is_not_text_comes_back_as_json() -> None:
    outcome = await run_code("def tool(e):\n    return {'longueur': len(e)}", "abc")

    assert outcome.output == '{"longueur": 3}'


async def test_code_without_a_tool_function_is_refused_clearly() -> None:
    outcome = await run_code("x = 1", "")

    assert "tool" in outcome.failure


async def test_a_tool_that_raises_is_a_result_not_a_crash() -> None:
    outcome = await run_code("def tool(e):\n    raise ValueError('cassé')", "")

    assert "cassé" in outcome.failure
    assert outcome.output == ""


async def test_an_endless_loop_is_stopped() -> None:
    # La seule défense qui marche. Sans elle, un outil garde un cœur du
    # serveur pour lui jusqu'au redémarrage.
    outcome = await run_code("def tool(e):\n    \n    while True:\n        pass", "", timeout=2)

    assert outcome.failure != ""
    assert outcome.output == ""


async def test_a_runaway_allocation_kills_the_tool_not_the_machine() -> None:
    # Selon le système, c'est la borne mémoire qui tranche ou le temps : les
    # deux mènent au même endroit, et c'est ce qui compte — le service tient.
    outcome = await run_code("def tool(e):\n    return 'x' * (10 ** 11)", "", timeout=3)

    assert outcome.failure != ""
    assert outcome.output == ""


async def test_an_oversized_output_is_cut() -> None:
    outcome = await run_code(f"def tool(e):\n    return 'x' * {MAX_OUTPUT + 500}", "")

    assert len(outcome.output) == MAX_OUTPUT


async def test_code_too_long_is_refused_before_running() -> None:
    outcome = await run_code("x" * 30_000, "")

    assert outcome.failure == "code trop long"


async def test_a_tool_never_sees_the_service_environment() -> None:
    # La clé du fournisseur vit dans l'environnement du service. Un outil qui
    # la lirait la ferait sortir dans sa propre réponse.
    #
    # On teste l'absence de *nos* variables, pas un environnement littéralement
    # vide : macOS en injecte deux de son cru, et exiger zéro rendrait le test
    # faux pour la mauvaise raison.
    os.environ["OPENROUTER_API_KEY"] = "clé-qui-ne-doit-pas-passer"
    try:
        outcome = await run_code(
            "import os\ndef tool(e):\n    return os.environ.get('OPENROUTER_API_KEY', 'absente')",
            "",
        )
    finally:
        del os.environ["OPENROUTER_API_KEY"]

    assert outcome.output == "absente"


async def test_the_residual_risk_is_named_rather_than_denied() -> None:
    # Ce test documente une limite au lieu de la cacher : un sous-processus
    # Python peut ouvrir une socket, et rien ici ne l'en empêche. Ce qui
    # protège est en amont — un outil ne reçoit jamais d'adresse. Le jour où
    # ce module s'adossera à un conteneur, ce test tombera, et ce sera le
    # signal que la limite a été levée.
    outcome = await run_code("import socket\ndef tool(e):\n    return socket.__name__", "")

    assert outcome.output == "socket"
