"""Le checkpointer LangGraph de l'API (MEM-12).

Les checkpoints d'un run sont l'état que l'usine rejoue et forke : ils vivent
dans Postgres quand une base est configurée, en mémoire sinon (tests, vitrine
sans base). Le choix se fait à un seul endroit, ici.

Ce que la doc de LangGraph ne montrait pas, et qui a été lu dans la source
installée (langgraph-checkpoint-postgres 3.2.1, voir spike/langgraph/NOTES.md) :
le saver veut des connexions en `autocommit`, avec `prepare_threshold=0` et des
lignes en `dict_row`. Ses tables lui appartiennent ; `setup()` les crée et les
migre, et doit être appelé une fois au démarrage.

Le pool est asynchrone et séparé de celui des stores (`usine_api/db.py`) : les
stores attendent des tuples et des transactions explicites, le saver des
dictionnaires et l'autocommit. Les mélanger casserait l'un ou l'autre.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

from usine_api.contracts import ProposedAction, SpecialistIdentity, SpecialistOutput

SAVER_CONNECTION_KWARGS: dict[str, Any] = {
    "autocommit": True,
    "prepare_threshold": 0,
    "row_factory": dict_row,
}


#: Our types in checkpoints, named so LangGraph can load them under
#: LANGGRAPH_STRICT_MSGPACK, which its serializer announces as the future
#: default (langgraph/checkpoint/serde/jsonplus.py). Without this, a run
#: stopped on a gate would not reload after a restart in strict mode.
SERDE = JsonPlusSerializer(
    allowed_msgpack_modules=[SpecialistOutput, SpecialistIdentity, ProposedAction]
)


@asynccontextmanager
async def open_checkpointer(dsn: str) -> AsyncIterator[BaseCheckpointSaver[Any]]:
    """Rend le checkpointer, ouvert pour toute la durée du bloc.

    `dsn` vide : un saver en mémoire, perdu à l'arrêt, et c'est voulu.
    """
    if not dsn:
        yield InMemorySaver(serde=SERDE)
        return
    # Typed as a pool of dict_row connections, the shape the saver requires
    # (psycopg_pool's generic `connection_class`).
    async with AsyncConnectionPool(
        dsn,
        min_size=1,
        max_size=4,
        kwargs=SAVER_CONNECTION_KWARGS,
        connection_class=AsyncConnection[DictRow],
        open=False,
    ) as pool:
        saver = AsyncPostgresSaver(pool, serde=SERDE)
        await saver.setup()
        yield saver
