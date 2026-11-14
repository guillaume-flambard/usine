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

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

SAVER_CONNECTION_KWARGS = {"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row}


@asynccontextmanager
async def open_checkpointer(dsn: str) -> AsyncIterator[BaseCheckpointSaver]:
    """Rend le checkpointer, ouvert pour toute la durée du bloc.

    `dsn` vide : un saver en mémoire, perdu à l'arrêt, et c'est voulu.
    """
    if not dsn:
        yield InMemorySaver()
        return
    async with AsyncConnectionPool(
        dsn, min_size=1, max_size=4, kwargs=SAVER_CONNECTION_KWARGS, open=False
    ) as pool:
        saver = AsyncPostgresSaver(pool)
        await saver.setup()
        yield saver
