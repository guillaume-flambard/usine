// The product's central promise: the graph does not exist before the brief,
// and nobody — not even the master — knows what it will contain.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { runProduct, startFactory } from '../factory'
import { scriptedModel } from '../../agents/__tests__/scripted-model'
import { until } from './helpers'

const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'

async function run() {
  const kernel = createKernel()
  const born: string[] = []
  kernel.subscribe((event) => {
    if (event.type === 'component-created') born.push(event.name)
  })
  await startFactory(kernel, {
    brief: BRIEF,
    reasoner: scriptedModel(),
    stepMs: 10,
    settleTimeoutMs: 4000,
  })
  await until(() => kernel.pendingGates().length > 0)
  return { kernel, born }
}

describe('the factory started on a need', () => {
  it('knows no agent at launch time', async () => {
    const kernel = createKernel()
    const born: string[] = []
    kernel.subscribe((e) => {
      if (e.type === 'component-created') born.push(e.name)
    })
    await startFactory(kernel, { brief: BRIEF, reasoner: scriptedModel(), stepMs: 10 })

    // The run's first component is the master, and it is the only one born
    // from the outside: everything else depends on what a model will decide.
    expect(born[0]).toBe('master-agent')
    expect(born.length).toBeLessThanOrEqual(2)
    await kernel.releaseAll()
  })

  it('grows a graph that nothing in the code names', async () => {
    const { kernel, born } = await run()

    expect(born.length).toBeGreaterThan(3)
    expect(kernel.providedNames()).toContain('detecteur')
    await kernel.releaseAll()
  })

  it('delivers a function whose name nobody knew', async () => {
    const { kernel } = await run()
    const product = runProduct(kernel)

    expect(product).toBeDefined()
    expect(typeof product?.run).toBe('function')
    await kernel.releaseAll()
  })

  it('bounds a worksite that would otherwise drift', async () => {
    const kernel = createKernel()
    const born: string[] = []
    kernel.subscribe((e) => {
      if (e.type === 'component-created') born.push(e.name)
    })
    await startFactory(kernel, {
      brief: BRIEF,
      reasoner: scriptedModel(),
      // One agent at most: the budget is not advisory.
      budget: { maxAgents: 1, maxDepth: 1, maxTurns: 2, maxTokens: 10_000 },
      stepMs: 10,
      settleTimeoutMs: 2000,
    })
    await until(() => kernel.pendingGates().length > 0)

    expect(born.filter((n) => n !== 'master-agent').length).toBeLessThanOrEqual(2)
    await kernel.releaseAll()
  })
})
