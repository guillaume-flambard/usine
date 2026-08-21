// The central promise, proven without a browser: nothing is written in
// advance. A fake but scripted model decides who exists, what they ask each
// other, and the tool's code. No agent name from this test appears in src/.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { runProduct, startFactory } from '../../orchestration/factory'
import type { RunEvent } from '../../runtime/events'
import { scriptedModel } from './scripted-model'

async function freeRun() {
  const kernel = createKernel()
  const events: RunEvent[] = []
  kernel.subscribe((event) => events.push(event))
  await startFactory(kernel, {
    brief: 'Un outil qui repère les allégations thérapeutiques interdites.',
    reasoner: scriptedModel(),
    stepMs: 10,
    settleTimeoutMs: 4000,
  })
  // The gate opens once the worksite has settled: that is the only signal.
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && kernel.pendingGates().length === 0) {
    await new Promise((next) => setTimeout(next, 10))
  }
  return { kernel, events }
}

describe('the factory that invents itself', () => {
  it('brings agents into existence whose names appear nowhere in the product', async () => {
    const { kernel, events } = await freeRun()
    const born = events
      .filter((e) => e.type === 'component-created')
      .map((e) => (e as { name: string }).name)

    expect(born).toContain('master-agent')
    expect(born).toContain('juriste')
    expect(born).toContain('artisan')
    // The tool was born during the run too.
    expect(born).toContain('detecteur')
    await kernel.releaseAll()
  })

  it('lets an agent create another, and the graph shows it', async () => {
    const { kernel, events } = await freeRun()
    const parentOf = (name: string) => {
      const created = events.find((e) => e.type === 'component-created' && e.name === name)
      const id = created === undefined ? undefined : (created as { id: string }).id
      return kernel.inspect().components.find((c) => c.id === id)?.parent
    }
    const master = events.find((e) => e.type === 'component-created' && e.name === 'master-agent')
    // The lawyer was not loaded by orchestration: the master did it.
    expect(parentOf('juriste')).toBe((master as { id: string }).id)
    // And the tool was loaded by the artisan, not by the master.
    const artisan = events.find((e) => e.type === 'component-created' && e.name === 'artisan')
    expect(parentOf('detecteur')).toBe((artisan as { id: string }).id)
    await kernel.releaseAll()
  })

  it('lets two agents talk, question and answer included', async () => {
    const { kernel, events } = await freeRun()
    const question = events.find((e) => e.type === 'question-asked')
    const answer = events.find((e) => e.type === 'answer-given')

    expect(question).toBeDefined()
    expect((question as { question: string }).question).toContain('article')
    expect(answer).toBeDefined()
    expect((answer as { answer: string }).answer).toContain('article')
    await kernel.releaseAll()
  })

  it('runs the tool the agent wrote, and it works', async () => {
    const { kernel } = await freeRun()
    const product = runProduct(kernel)

    expect(product?.name).toBe('detecteur')
    const output = product?.run('Ce produit guérit tout. Il est agréable.') as {
      phrase: string
      interdit: boolean
    }[]
    expect(output).toHaveLength(2)
    expect(output[0]?.interdit).toBe(true)
    expect(output[1]?.interdit).toBe(false)
    await kernel.releaseAll()
  })

  it('opens the gate on what exists, not on what was planned', async () => {
    const { kernel, events } = await freeRun()
    const gate = events.find((e) => e.type === 'gate-reached')
    const subject = (gate as { subject: { summary: string; objection: string } }).subject

    expect(subject.summary).toContain('agents ont été créés')
    expect(subject.summary).toContain('écrits et chargés à chaud')
    expect(subject.objection).toContain('trois motifs')
    expect(kernel.pendingGates()).toHaveLength(1)
    await kernel.releaseAll()
  })

  it("keeps every tool's code readable, exactly as it runs", async () => {
    const { kernel, events } = await freeRun()
    const built = events.find((e) => e.type === 'component-built')
    const build = (built as { build: { source: string; route: string } }).build

    expect(build.route).toBe('evaluation')
    // The code shown is the code that was evaluated, not a paraphrase.
    expect(build.source).toContain('interdit')
    expect(typeof kernel.output('detecteur')).toBe('function')
    await kernel.releaseAll()
  })
})

describe('with no model connected', () => {
  it('brings no agent into existence, and does not pretend otherwise', async () => {
    const kernel = createKernel()
    const born: string[] = []
    kernel.subscribe((e) => {
      if (e.type === 'component-created') born.push(e.name)
    })
    await startFactory(kernel, { brief: 'peu importe', stepMs: 10, settleTimeoutMs: 500 })
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && kernel.pendingGates().length === 0) {
      await new Promise((next) => setTimeout(next, 10))
    }

    expect(born).toEqual(['master-agent'])
    expect(runProduct(kernel)).toBeUndefined()
    await kernel.releaseAll()
  })
})
