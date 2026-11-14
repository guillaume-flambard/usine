/**
 * The v2 stack, as decided in docs/adr/0001-adopter-les-frameworks-agentiques-du-marche.md.
 *
 * Kept as data so the shell can show it and a test can hold it to the ADR.
 * Each entry gains a `provenBy` (file and test) as the milestones land (MEM-64).
 */
export interface StackLayer {
  layer: string
  tools: readonly string[]
}

export const STACK: readonly StackLayer[] = [
  { layer: 'Front', tools: ['Vue 3', 'Nuxt UI 4', 'Vercel AI SDK'] },
  { layer: 'API', tools: ['FastAPI', 'Pydantic'] },
  { layer: 'Orchestration', tools: ['LangGraph'] },
  { layer: 'Agents', tools: ['LangChain'] },
  {
    layer: 'Spécialistes',
    tools: ['CrewAI', 'OpenAI Agents SDK', 'Pydantic AI', 'Claude Agent SDK'],
  },
  { layer: 'RAG', tools: ['LlamaIndex', 'pgvector', 'Qdrant'] },
  { layer: 'Outils', tools: ['MCP', 'FastMCP'] },
  { layer: 'Modèles', tools: ['LiteLLM'] },
  { layer: 'Observabilité', tools: ['Langfuse'] },
  { layer: 'Évaluation', tools: ['Ragas', 'DeepEval'] },
] as const
