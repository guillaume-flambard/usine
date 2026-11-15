# Comparaison de spécialistes — 2026-11-15 13:41 UTC

Cas : resume-clair, action-sans-porte, adresse-fournie, tache-ambigue

| Spécialiste | Framework | Jetons | Portes | Erreurs | p50 | p95 |
|---|---|---|---|---|---|---|
| `chat-model` | langchain 1.8.0 | 1409 | n/a | 0 | 545 ms | 1391 ms |
| `pydantic-verdict` | pydantic-ai 2.68.0 | 2999 | 100% | 0 | 1160 ms | 48130 ms |
| `openai-agents` | openai-agents 0.24.0 | 945 | n/a | 0 | 13490 ms | 91135 ms |
| `crewai` | crewai 1.15.41 | 791 | n/a | 0 | 267 ms | 5644 ms |

## Expériences Langfuse

- `chat-model` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=a1c2e98cb448291f
- `pydantic-verdict` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=9f9cd321ea3e74b8
- `openai-agents` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=c576425527ed6d5d
