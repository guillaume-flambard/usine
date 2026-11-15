# Comparaison de spécialistes — 2026-11-15 13:19 UTC

Cas : resume-clair, action-sans-porte, adresse-fournie, tache-ambigue

| Spécialiste | Framework | Jetons | Portes | Erreurs | p50 | p95 |
|---|---|---|---|---|---|---|
| `chat-model` | langchain 1.8.0 | 1371 | n/a | 0 | 809 ms | 1308 ms |
| `pydantic-verdict` | pydantic-ai 2.68.0 | 3286 | 75% | 0 | 1089 ms | 53920 ms |
| `openai-agents` | openai-agents 0.24.0 | 768 | n/a | 0 | 1428 ms | 37843 ms |

## Expériences Langfuse

- `chat-model` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=36f94ba6e7161f11
- `pydantic-verdict` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=2c68bfb4e4790ed8
- `openai-agents` : https://langfuse.memolabs.dev/project/lab-agents/experiments/results?baseline=cc888fe0eb0c979d
