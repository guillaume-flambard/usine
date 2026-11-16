/**
 * The comparison banner's divergence point (MEM-25). A branch replays only what
 * comes after its fork: the shared nodes before it are not a divergence.
 */
import { describe, expect, it } from 'vitest'
import { firstDivergence } from '../run/divergence'
import { EMPTY_RUN, type RunNode, type RunReadModel } from '../run/readModel'

const node = (id: string, name: string, extra: Partial<RunNode> = {}): RunNode => ({
  id,
  name,
  state: 'finished',
  startedAt: 0,
  reasoning: { started: 0, settled: 0 },
  ...extra,
})
const model = (nodes: RunNode[]): RunReadModel => ({ ...EMPTY_RUN, status: 'finished', nodes })

const ORIGINAL = model([
  node('t1', 'supervisor'),
  node('t2', 'specialist', {
    task: 'a',
    specialists: [{ name: 'mcp-agent', framework: 'langchain', tokens: 9 }],
  }),
  node('t3', 'synthesize'),
])

describe('firstDivergence', () => {
  it('does not name the shared supervisor when the branch starts at the specialists', () => {
    // Audit, 16 November 2026: the banner said « Superviseur » here.
    const branch = model([
      node('t1', 'specialist', {
        task: 'a',
        specialists: [{ name: 'chat-model', framework: 'langchain', tokens: 4 }],
      }),
      node('t2', 'synthesize'),
    ])
    expect(firstDivergence(ORIGINAL, branch)).toEqual({ kind: 'node', name: 'specialist' })
  })

  it('says identical when the branch replays the same nodes alike', () => {
    expect(firstDivergence(ORIGINAL, model(ORIGINAL.nodes.slice(1)))).toBeNull()
  })

  it('reports a state that differs on the branch', () => {
    const branch = model([{ ...ORIGINAL.nodes[1]!, state: 'failed' }, ORIGINAL.nodes[2]!])
    expect(firstDivergence(ORIGINAL, branch)).toEqual({
      kind: 'state',
      name: 'specialist',
      state: 'failed',
    })
  })

  it('reports a branch that stops short of the original', () => {
    expect(firstDivergence(ORIGINAL, model([ORIGINAL.nodes[1]!]))).toEqual({
      kind: 'node',
      name: 'synthesize',
    })
  })
})
