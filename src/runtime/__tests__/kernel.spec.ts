import { describe, expect, it } from 'vitest'
import { createKernel, mintBranchId } from '../kernel'
import type { Component, ComponentId } from '../contract'
import type { RunEvent } from '../events'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function recorded() {
  const kernel = createKernel()
  const events: RunEvent[] = []
  kernel.subscribe((event) => events.push(event))
  const types = () => events.map((event) => event.type)
  return { kernel, events, types }
}

function tool(name: string, provides: string, value: unknown = { ok: true }): Component {
  return {
    name,
    provides: [provides],
    display: { role: `Fournit ${provides}` },
    apply(context) {
      context.provide(provides, value)
    },
  }
}

function agent(name: string, needs: string[], onApply?: () => void): Component {
  return {
    name,
    needs,
    display: { role: `Consomme ${needs.join(', ')}` },
    apply() {
      onApply?.()
    },
  }
}

describe('composition kernel', () => {
  it('loads a dependency-free component and emits creation then activation', async () => {
    const { kernel, types } = recorded()
    const id = await kernel.load({
      name: 'solo',
      display: { role: 'Ne dépend de rien' },
      apply(context) {
        context.effect(() => () => {}, 'resource')
      },
    })
    await tick()

    expect(id).toBeDefined()
    expect(types()).toEqual(['component-created', 'component-activated'])
    expect(kernel.inspect().components[0]?.state).toBe('active')
  })

  it('leaves a component inactive while its dependency is missing', async () => {
    const { kernel, types } = recorded()
    let activations = 0
    await kernel.load(agent('checker', ['registry'], () => (activations += 1)))
    await tick()

    expect(activations).toBe(0)
    expect(types()).toEqual(['component-created'])
    expect(kernel.inspect().components[0]?.state).toBe('pending')
  })

  it('activates only the dependent when its dependency arrives', async () => {
    const { kernel } = recorded()
    let activations = 0
    await kernel.load(agent('checker', ['registry'], () => (activations += 1)))
    await tick()
    await kernel.load(tool('eu-registry', 'registry'))
    await tick()

    expect(activations).toBe(1)
    const topology = kernel.inspect()
    expect(topology.dependencies).toHaveLength(1)
    expect(topology.dependencies[0]?.name).toBe('registry')
  })

  it('deactivates only the dependent when its dependency leaves', async () => {
    const { kernel, events } = recorded()
    await kernel.load(agent('checker', ['registry']))
    const toolId = await kernel.load(tool('eu-registry', 'registry'))
    await tick()
    await kernel.release(toolId as ComponentId)
    await tick()

    expect(events.some((event) => event.type === 'component-deactivated')).toBe(true)
    const checker = kernel.inspect().components.find((c) => c.name === 'checker')
    expect(checker?.state).toBe('pending')
  })

  it('releases in cascade what a component loaded, teardowns in reverse order', async () => {
    const { kernel } = recorded()
    const trace: string[] = []
    const masterId = await kernel.load({
      name: 'master',
      display: { role: 'Charge un enfant' },
      apply(context) {
        context.effect(() => {
          trace.push('master:open')
          return () => trace.push('master:close')
        }, 'master-resource')
        void context.load({
          name: 'child',
          display: { role: 'Chargé par le maître' },
          apply(inner) {
            inner.effect(() => {
              trace.push('child:open')
              return () => trace.push('child:close')
            }, 'child-resource')
          },
        })
      },
    })
    await tick()
    expect(trace).toEqual(['master:open', 'child:open'])

    await kernel.release(masterId as ComponentId)
    await tick()
    expect(trace).toEqual(['master:open', 'child:open', 'child:close', 'master:close'])
  })

  it('refuses a second provider for a name already taken', async () => {
    const { kernel, events } = recorded()
    await kernel.load(tool('eu-registry', 'registry'))
    await tick()
    const second = await kernel.load(tool('other-registry', 'registry'))
    await tick()

    expect(second).toBeUndefined()
    const failure = events.find((event) => event.type === 'component-failed')
    expect(failure).toBeDefined()
    if (failure?.type === 'component-failed') {
      expect(failure.error.code).toBe('name-already-provided')
    }
    expect(kernel.inspect().components).toHaveLength(1)
  })

  it('turns an activation failure into an event, without throwing', async () => {
    const { kernel, events } = recorded()
    await expect(
      kernel.load({
        name: 'faulty',
        display: { role: "Échoue à l'activation" },
        apply() {
          throw new Error('registre injoignable')
        },
      }),
    ).resolves.toBeDefined()
    await tick()

    const failure = events.find((event) => event.type === 'component-failed')
    expect(failure).toBeDefined()
    if (failure?.type === 'component-failed') {
      expect(failure.error.code).toBe('activation-failed')
      expect(failure.error.message).toBe('registre injoignable')
    }
    expect(kernel.inspect().components[0]?.state).toBe('failed')
  })

  it('returns a topology matching the live components', async () => {
    const { kernel } = recorded()
    await kernel.load(tool('eu-registry', 'registry'))
    await kernel.load(agent('checker', ['registry']))
    await tick()

    const topology = kernel.inspect()
    expect(topology.components.map((c) => c.name).sort()).toEqual(['checker', 'eu-registry'])
    expect(topology.dependencies).toEqual([expect.objectContaining({ name: 'registry' })])

    await kernel.releaseAll()
    await tick()
    expect(kernel.inspect().components).toHaveLength(0)
  })

  it('reserves a dependency name at declaration, before any publication', async () => {
    // Two components declare "registry" without ever publishing: the
    // declaration is the contract, not the publication.
    const declaring = (name: string) => ({
      name,
      provides: ['registry'],
      display: { role: 'Déclare sans publier' },
      apply() {},
    })
    const { kernel, events } = recorded()
    await kernel.load(declaring('first'))
    await tick()
    const second = await kernel.load(declaring('second'))
    await tick()

    expect(second).toBeUndefined()
    const failure = events.find((event) => event.type === 'component-failed')
    expect(failure?.type === 'component-failed' && failure.error.code).toBe(
      'name-already-provided',
    )
  })

  it('never announces as active a component whose activation failed', async () => {
    const { kernel, events } = recorded()
    await kernel.load({
      name: 'faulty',
      display: { role: 'Échoue' },
      apply() {
        throw new Error('boum')
      },
    })
    await tick()

    expect(events.some((event) => event.type === 'component-activated')).toBe(false)
    expect(events.map((event) => event.type)).toEqual(['component-created', 'component-failed'])
  })

  it('frees the reserved name when the provider leaves', async () => {
    const { kernel } = recorded()
    const first = await kernel.load(tool('eu-registry', 'registry'))
    await tick()
    await kernel.release(first as ComponentId)
    await tick()
    const replacement = await kernel.load(tool('other-registry', 'registry'))
    await tick()

    expect(replacement).toBeDefined()
  })

  it('numbers events strictly increasing and gapless', async () => {
    const { kernel, events } = recorded()
    await kernel.load(tool('eu-registry', 'registry'))
    await kernel.load(agent('checker', ['registry']))
    await tick()
    await kernel.releaseAll()
    await tick()

    const sequences = events.map((event) => event.sequence)
    expect(sequences).toEqual(sequences.map((_, index) => index + 1))
  })

  it('mints a visitor interaction into the stream, input and all, with no absolute date', async () => {
    const { kernel, events } = recorded()
    kernel.noteVisitorInteraction({
      name: 'detecteur',
      input: 'Ce produit guérit tout.',
      version: 1,
      output: '[{"interdit":true}]',
    })

    const event = events.find((e) => e.type === 'visitor-interacted')
    expect(event).toBeDefined()
    if (event?.type !== 'visitor-interacted') throw new Error('pas d’événement visiteur')
    // The input travels verbatim: a replay reads it instead of a live click.
    expect(event.input).toBe('Ce produit guérit tout.')
    expect(event.version).toBe(1)
    // Sequenced like any event, and its `at` is an elapsed duration, not a date.
    expect(event.sequence).toBe(1)
    expect(event.at).toBeGreaterThanOrEqual(0)
    expect(event.at).toBeLessThan(Date.now())
  })
})

describe('branch identity (AD-43/44/46)', () => {
  it('mints opaque branch ids, distinct and independent of N', () => {
    const first = mintBranchId()
    const second = mintBranchId()
    expect(first).not.toBe(second)
    // Opaque: a non-empty string that carries no N, no `sequence`.
    expect(typeof first).toBe('string')
    expect(first.length).toBeGreaterThan(0)
  })

  it('a kernel with no branch emits unstamped events (trunk)', async () => {
    const { kernel, events } = recorded()
    await kernel.load(tool('eu-registry', 'registry'))
    await tick()

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => event.branchId === undefined)).toBe(true)
  })

  it('a branch kernel stamps every emitted event with its branchId', async () => {
    const branchId = mintBranchId()
    const kernel = createKernel({ branchId })
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))
    await kernel.load(tool('eu-registry', 'registry'))
    await tick()

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => event.branchId === branchId)).toBe(true)
  })

  it('stamps a subscriber-failed incident with the branchId too', async () => {
    // A subscriber-failed is minted inside `broadcast`, off the normal `emit`
    // path: it must still carry the branch stamp, or a branch's incident would
    // look like it came from the trunk.
    const branchId = mintBranchId()
    const kernel = createKernel({ branchId })
    const events: RunEvent[] = []
    // The recorder goes first so it captures the incident; the thrower second.
    kernel.subscribe((event) => events.push(event))
    kernel.subscribe(() => {
      throw new Error('abonné cassé')
    })
    await kernel.load(tool('eu-registry', 'registry'))
    await tick()

    const failed = events.find((event) => event.type === 'subscriber-failed')
    expect(failed).toBeDefined()
    expect(failed?.branchId).toBe(branchId)
  })

  it('noteFork emits branch-forked first, stamped, carrying {trunkId, from, offset}', () => {
    const branchId = mintBranchId()
    const trunkId = mintBranchId()
    const kernel = createKernel({ branchId })
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))

    kernel.noteFork({ trunkId, from: 12, offset: 340 })

    const first = events[0]
    expect(first?.type).toBe('branch-forked')
    if (first?.type !== 'branch-forked') throw new Error('pas de branch-forked')
    expect(first.branchId).toBe(branchId)
    expect(first.trunkId).toBe(trunkId)
    expect(first.from).toBe(12)
    expect(first.offset).toBe(340)
    // Elapsed, never an absolute date (AD-33).
    expect(first.at).toBeGreaterThanOrEqual(0)
    expect(first.at).toBeLessThan(Date.now())
  })
})
