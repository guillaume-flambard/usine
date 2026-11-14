import { describe, expect, it } from 'vitest'
import { STACK } from '../stack'

// The ADR names these tools. If one disappears from the shell, the showcase
// stops matching the decision, so the test holds the two together.
const ADR_0001_TOOLS = [
  'LangGraph',
  'LangChain',
  'CrewAI',
  'OpenAI Agents SDK',
  'Pydantic AI',
  'Claude Agent SDK',
  'LlamaIndex',
  'pgvector',
  'Qdrant',
  'MCP',
  'FastMCP',
  'LiteLLM',
  'Langfuse',
  'Ragas',
  'DeepEval',
  'Vercel AI SDK',
  'Nuxt UI 4',
]

describe('stack', () => {
  it('lists every tool decided in ADR 0001', () => {
    const tools = STACK.flatMap((entry) => entry.tools)
    for (const tool of ADR_0001_TOOLS) expect(tools).toContain(tool)
  })

  it('does not list Cordis, which ADR 0001 retires', () => {
    const tools = STACK.flatMap((entry) => entry.tools)
    expect(tools.some((tool) => /cordis/i.test(tool))).toBe(false)
  })

  it('names each layer once', () => {
    const layers = STACK.map((entry) => entry.layer)
    expect(new Set(layers).size).toBe(layers.length)
  })
})
