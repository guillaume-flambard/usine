"""Scripted planner and specialist: deterministic models for the end-to-end test (MEM-19).

Turned on by `USINE_SCRIPTED_MODELS=1`, never by default. The CI has no model
and no network, so the M1 end-to-end test runs the real page, the real API, the
real graph and stream on these; the same test with `E2E_REAL=1` uses LiteLLM.

They wait a little on purpose: a run that finishes in one tick would show no
running node, and the test checks that the scene moves while the run streams.
"""

from __future__ import annotations

import asyncio

from usine_api.contracts import SpecialistIdentity, SpecialistInput, SpecialistOutput

DELAY_SECONDS = 0.4


class ScriptedPlanner:
    async def plan(self, brief: str) -> list[str]:
        await asyncio.sleep(DELAY_SECONDS)
        parts = [part.strip() for part in brief.split(" puis ") if part.strip()]
        return parts or [brief]


class ScriptedSpecialist:
    identity = SpecialistIdentity(name="scripted", framework="test", framework_version="1")

    async def run(self, task: SpecialistInput) -> SpecialistOutput:
        await asyncio.sleep(DELAY_SECONDS)
        return SpecialistOutput(
            answer=f"Réponse scriptée : {task.task}",
            identity=self.identity,
            tokens=len(task.task.split()),
            tool_calls=0,
        )
