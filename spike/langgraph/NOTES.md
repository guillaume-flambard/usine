# Spike MEM-10 : LangGraph, checkpointer Postgres, streaming

Lancé le 14 novembre 2026. Code jetable dans `spike.py` (script uv au format
PEP 723), jamais importé par le produit.

## Versions

| Paquet | Version | Source |
|---|---|---|
| `langgraph` | 1.2.22 | PyPI, 14 novembre 2026 |
| `langgraph-checkpoint-postgres` | 3.2.1 | PyPI |
| `langgraph-checkpoint` | 4.3.2 (dépendance) | PyPI |
| `psycopg[binary]` | 3.3.9 | PyPI |
| Postgres | `pgvector/pgvector:pg17` | image du compose de dev |

Versions relevées pour la suite (M1) : `langchain` 1.5.0, `langchain-core`
1.8.0, `langchain-openai` 1.8.0, `psycopg-pool` 3.3.3, `langfuse` 5.2.0.

## Ce qui a été lu

- https://docs.langchain.com/oss/python/langgraph/checkpoints : `thread_id` obligatoire avec un checkpointer ; `get_state` et `get_state_history` (du plus récent au plus ancien) ; `invoke(None, config)` reprend un travail non terminé.
- https://docs.langchain.com/oss/python/langgraph/streaming : modes `values`, `updates`, `messages`, `custom`, `checkpoints`, `tasks`, `debug`. Plusieurs modes à la fois avec `version="v2"` (LangGraph 1.1 ou plus) : chaque morceau est un dict `type`, `ns`, `data`. Événements custom par `get_stream_writer()`.
- https://docs.langchain.com/oss/python/langgraph/graph-api : `StateGraph`, `START`, `END`, et les reducers (`operator.add`, `add_messages`).
- **Code source installé**, pour ce que la doc ne montrait pas (`langgraph/checkpoint/postgres/__init__.py`) :
  - `PostgresSaver.from_conn_string` est un `@contextmanager`. Il ouvre la connexion avec `autocommit=True, prepare_threshold=0, row_factory=dict_row`.
  - `setup()` « MUST be called directly by the user the first time ».
  - Le constructeur accepte une `Connection` ou un `ConnectionPool` de connexions `dict_row` (`_internal.Conn`). C'est ce qu'il faut pour le pool partagé de MEM-12.

## Ce qui a été prouvé

Trois processus successifs contre une base jetable :

1. **`start`** : le flux v2 rend d'abord l'événement custom (`reasoning-started`), puis la mise à jour du nœud `plan`, puis `{'__interrupt__': ()}`. Le run s'arrête avant `review` (`next: ('review',)`).
2. **`resume`**, dans un nouveau processus : `invoke(None, config)` termine le run (`steps: ['plan:…', 'review:ok']`, `next: ()`).
3. **`history`** : 4 checkpoints, du plus récent au plus ancien, chacun avec son `checkpoint_id` et son `next`.

## Écarts entre l'exemple officiel et l'usine

- **Pool partagé** : l'usine a déjà un pool psycopg (`usine_api/db.py`). Le saver doit le réutiliser avec `row_factory=dict_row`, plutôt que d'ouvrir sa propre connexion (MEM-12).
- **Asynchrone** : FastAPI est asynchrone. La production utilisera `AsyncPostgresSaver` (`langgraph.checkpoint.postgres.aio`). Sa doc ne montre pas la création, il faudra la lire dans la source au moment de MEM-12.
- **Breakpoint statique ou `interrupt()`** : le spike utilise `interrupt_before`. La porte humaine utilisera `interrupt()` dans un nœud, avec une charge utile typée (MEM-20).
- **Format du flux** : l'interruption arrive comme une mise à jour `__interrupt__`. Il faudra la traduire en événement `gate-opened` du contrat `RunEvent` (MEM-14).
- **Événements custom** : `get_stream_writer()` fournit exactement ce qu'il faut pour `reasoning-started` et `reasoning-settled`, qui existaient déjà en v1.

## Relancer

```sh
SPIKE_PG_DSN=… uv run --script spike/langgraph/spike.py start
SPIKE_PG_DSN=… uv run --script spike/langgraph/spike.py resume
SPIKE_PG_DSN=… uv run --script spike/langgraph/spike.py history
```
