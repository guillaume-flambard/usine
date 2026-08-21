// The reversed trade-off, verified in a real browser: the agents write code
// and that code must run. Under the old strict policy this test would fail —
// which is exactly what it is here to make visible.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { runProduct, startFactory } from '../../orchestration/factory'
import { DEMO_BRIEF, demoReasoner } from '../../examples/demo'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('code evaluation in the browser', () => {
  it('evaluates a function written during the run and makes it work', async () => {
    const kernel = createKernel()
    await startFactory(kernel, {
      brief: DEMO_BRIEF,
      reasoner: demoReasoner(20),
      stepMs: 20,
      settleTimeoutMs: 6000,
    })
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline && kernel.pendingGates().length === 0) await wait(20)

    const product = runProduct(kernel)
    expect(product, 'no tool was written').toBeDefined()

    const output = product?.run(
      'Ce complément guérit les carences. Il contribue à réduire la fatigue.',
    ) as { verdict: string; source: string }[]
    expect(output).toHaveLength(2)
    expect(output[0]?.verdict).toBe('interdit')
    expect(output[0]?.source).toContain('1924/2006')
    expect(output[1]?.verdict).toBe('autorisé')

    await kernel.releaseAll()
  }, 20_000)

  it('opens the network toward nobody during a run', async () => {
    // The policy allows evaluation; it does not allow the produced code to
    // leave the page.
    const calls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
      calls.push(String(input))
      return real(input, options)
    }) as typeof fetch

    try {
      const kernel = createKernel()
      await startFactory(kernel, {
        brief: DEMO_BRIEF,
        reasoner: demoReasoner(10),
        stepMs: 20,
        settleTimeoutMs: 4000,
      })
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline && kernel.pendingGates().length === 0) await wait(20)
      expect(calls).toEqual([])
      await kernel.releaseAll()
    } finally {
      globalThis.fetch = real
    }
  }, 20_000)
})
