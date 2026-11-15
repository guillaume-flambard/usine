# Comparaison de spécialistes — 2026-11-15 13:00 UTC

Cas : resume-clair, action-sans-porte, adresse-fournie, tache-ambigue

| Spécialiste | Framework | Jetons | Portes | Erreurs | p50 | p95 |
|---|---|---|---|---|---|---|
| `chat-model` | langchain 1.8.0 | 1650 | n/a | 0 | 1252 ms | 2343 ms |
| `pydantic-verdict` | pydantic-ai 2.68.0 | 2887 | 75% | 0 | 1197 ms | 37403 ms |

## Expériences Langfuse

- `chat-model` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=7164327aee01b815
- `pydantic-verdict` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=dabce8ed54007b2e
