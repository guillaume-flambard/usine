// The central promise, proven without a browser: nothing is written in
// advance. A fake but scripted model decides who exists, what they ask each
// other, and the tool's code. No agent name from this test appears in src/.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { liveBehaviours, startFactory } from '../../orchestration/factory'
import { spawnVmWorker } from './vm-worker'
import type { RunEvent } from '../../runtime/events'
import { scriptedModel } from './scripted-model'
import type { Reasoner } from '../../runtime/reasoner'

async function freeRun() {
  const kernel = createKernel()
  const events: RunEvent[] = []
  kernel.subscribe((event) => events.push(event))
  await startFactory(kernel, {
    brief: 'Un outil qui repère les allégations thérapeutiques interdites.',
    reasoner: scriptedModel(),
    spawnWorker: spawnVmWorker,
      sources: [],
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
    // The behaviour was born during the run too, and then improved.
    expect(born).toContain('detecteur-v1')
    expect(born).toContain('detecteur-v2')
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
    // And the behaviour was loaded by the artisan, not by the master. The
    // version still live is v2 — the replacement kept the same parent, which
    // is what makes a replaced behaviour still belong to the agent that wrote
    // it, and still fall with it.
    const artisan = events.find((e) => e.type === 'component-created' && e.name === 'artisan')
    expect(parentOf('detecteur-v2')).toBe((artisan as { id: string }).id)
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

  it('runs the behaviour the agent wrote, and it works', async () => {
    const { kernel } = await freeRun()
    const [behaviour] = liveBehaviours(kernel)

    expect(behaviour?.name).toBe('detecteur')
    const answer = await behaviour?.call('Ce produit guérit tout. Il est agréable.')
    const output = JSON.parse(answer?.output ?? '[]') as { interdit: boolean }[]

    expect(output).toHaveLength(2)
    expect(output[0]?.interdit).toBe(true)
    expect(output[1]?.interdit).toBe(false)
    await kernel.releaseAll()
  })

  it('replaces a behaviour while it serves, and the new version answers', async () => {
    const { kernel, events } = await freeRun()
    const [behaviour] = liveBehaviours(kernel)

    // Only one name is live: the replacement took the previous one's place
    // rather than adding a second answer to the same call.
    expect(liveBehaviours(kernel)).toHaveLength(1)
    expect(behaviour?.version).toBe(2)

    const answer = await behaviour?.call('Ce produit guérit tout.')
    const output = JSON.parse(answer?.output ?? '[]') as { motif?: string }[]
    // v1 could not say which word triggered the verdict. v2 can.
    expect(output[0]?.motif).toBe('guérit')

    // And the run says it happened, so the graph can show it.
    const released = events.filter((e) => e.type === 'component-released')
    expect(released.length).toBeGreaterThan(0)
    await kernel.releaseAll()
  })

  it('opens the gate on what exists, not on what was planned', async () => {
    const { kernel, events } = await freeRun()
    const gate = events.find((e) => e.type === 'gate-reached')
    const subject = (gate as { subject: { summary: string; objection: string } }).subject

    expect(subject.summary).toContain('agents ont été créés')
    expect(subject.objection).toContain('trois motifs')
    expect(kernel.pendingGates()).toHaveLength(1)
    await kernel.releaseAll()
  })

  it("keeps every behaviour's code readable, exactly as it runs", async () => {
    const { kernel, events } = await freeRun()
    const builds = events
      .filter((e) => e.type === 'component-built')
      .map((e) => (e as { build: { source: string; route: string } }).build)

    // Both versions are readable, not only the one currently serving.
    expect(builds).toHaveLength(2)
    expect(builds.every((build) => build.route === 'evaluation')).toBe(true)
    expect(builds[0]?.source).toContain('interdit')
    expect(builds[1]?.source).toContain('motif')
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
    expect(liveBehaviours(kernel)).toEqual([])
    await kernel.releaseAll()
  })
})

describe('what an agent is told about the application', () => {
  // The only channel an agent has is its turn context. If the state of the
  // application is not in it, a model happily declares itself done over a
  // screen with no behaviour behind it — and the run produces nothing while
  // announcing success.
  it('says there is no screen, then no behaviour, then names the versions', async () => {
    const seen: string[] = []
    const kernel = createKernel()
    await startFactory(kernel, {
      brief: 'Un outil qui repère les allégations thérapeutiques interdites.',
      reasoner: watching(scriptedModel(), seen),
      spawnWorker: spawnVmWorker,
      sources: [],
      stepMs: 10,
      settleTimeoutMs: 4000,
    })
    const deadline = Date.now() + 8000
    while (Date.now() < deadline && kernel.pendingGates().length === 0) {
      await new Promise((next) => setTimeout(next, 10))
    }

    const joined = seen.join('\n---\n')
    expect(joined).toContain('AUCUN ÉCRAN')
    // And once something serves, the context names what serves and at which
    // version, so an agent can decide to improve rather than to rebuild.
    expect(joined).toContain('detecteur (v1)')
    await kernel.releaseAll()
  })
})

/** Wraps a reasoner to keep every context it was handed. */
function watching(inner: Reasoner, into: string[]): Reasoner {
  return {
    origin: inner.origin,
    reason: async (request) => {
      into.push(request.context)
      return inner.reason(request)
    },
  }
}

describe('ce qu’un agent sait de ce qui l’a précédé', () => {
  it('reçoit dans son contexte les faits qu’un autre a publiés', async () => {
    const seen: string[] = []
    const kernel = createKernel()
    await startFactory(kernel, {
      brief: 'Un outil qui repère les allégations thérapeutiques interdites.',
      reasoner: watching(scriptedModel(), seen),
      spawnWorker: spawnVmWorker,
      sources: [],
      stepMs: 10,
      settleTimeoutMs: 4000,
    })
    const deadline = Date.now() + 8000
    while (Date.now() < deadline && kernel.pendingGates().length === 0) {
      await new Promise((next) => setTimeout(next, 10))
    }

    // Le juriste publie « guérit ; soigne ; traite ». L'artisan ne déclare pas
    // ce coeffet — il n'existait pas quand le nom a été choisi — et le reçoit
    // quand même, parce que sa mission parle des mêmes choses.
    const toArtisan = seen.filter((context) => context.includes('Toi : artisan'))
    expect(toArtisan.join('\n')).toContain('Ce que le chantier a déjà établi')

    await kernel.releaseAll()
  })
})
