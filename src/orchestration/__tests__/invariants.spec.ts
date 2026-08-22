// The proof that nothing is simulated.
// These tests do not check a feature: they check that what is displayed
// matches what is alive. This is the PRD's C3 counter-metric.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import { createStore } from '../../state/store'
import { startFactory } from '../factory'
import { spawnVmWorker } from '../../agents/__tests__/vm-worker'
import type { Component, ComponentId } from '../../runtime/contract'
import { BRIEF, until } from './helpers'
import { scriptedModel } from '../../agents/__tests__/scripted-model'

/** Crosses the human gate: without it the run stays halted, by construction. */
async function approve(kernel: ReturnType<typeof createKernel>) {
  for (const id of kernel.pendingGates()) kernel.decide(id, 'approved')
}

const tick = async () => {
  for (let index = 0; index < 6; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

/** The name of whoever publishes a given value. Nothing is known in advance. */
const publisherOf = (store: ReturnType<typeof createStore>, what: string) =>
  store.state.value.nodes.find((n) => n.provides.includes(what))?.name ?? ''

/** A replacement provider, to prove reactivation. */
const replacementFor = (name: string, what: string): Component => ({
  name,
  provides: [what],
  display: { label: 'Remplaçant', role: 'Republie ce qui manquait' },
  apply(context) {
    context.provide(what, { from: name, text: 'républié' })
    context.finish()
  },
})

/** Something the run invented that others consume. Chosen at runtime. */
const sharedName = (store: ReturnType<typeof createStore>) =>
  store.state.value.nodes
    .flatMap((n) => n.needs)
    .find(
      (name) =>
        name !== 'reasoner' &&
        name !== 'brief' &&
        name !== 'corpus' &&
        store.state.value.nodes.some((other) => other.provides.includes(name)),
    ) ?? ''

async function startedRun() {
  const kernel = createKernel()
  const store = createStore()
  store.connect(kernel)
  const launch = await startFactory(kernel, {
    brief: BRIEF,
    reasoner: scriptedModel(),
    spawnWorker: spawnVmWorker,
      sources: [],
    stepMs: 10,
    settleTimeoutMs: 3000,
  })
  await until(() => kernel.pendingGates().length > 0)
  await approve(kernel)
  await until(() => kernel.inspect().components.every((c) => c.finished || c.state !== 'active'))
  return { kernel, store, launch }
}

/** The nodes the graph would show as alive. */
const shownAlive = (nodes: readonly { id: string; state: string }[]) =>
  nodes
    .filter((n) => n.state !== 'released')
    .map((n) => n.id)
    .sort()

describe('invariant C3: the graph is the real topology', () => {
  it('shows exactly the runtime live components, identifier by identifier', async () => {
    const { kernel, store } = await startedRun()

    const liveInEngine = kernel
      .inspect()
      .components.map((c) => c.id as string)
      .sort()
    expect(shownAlive(store.state.value.nodes)).toEqual(liveInEngine)
  })

  it('stays true after killing a component hot', async () => {
    const { kernel, store } = await startedRun()
    // We kill any agent of the run: which one does not matter, the display
    // invariant is what is at stake.
    const victim = kernel.inspect().components.find((c) => c.name !== 'master-agent')
    expect(victim).toBeDefined()

    await kernel.release(victim!.id)
    await tick()

    const liveInEngine = kernel
      .inspect()
      .components.map((c) => c.id as string)
      .sort()
    expect(shownAlive(store.state.value.nodes)).toEqual(liveInEngine)
  })

  it('stays true after the whole run is released', async () => {
    const { kernel, store, launch } = await startedRun()
    await kernel.release(launch.master)
    await tick()

    expect(kernel.inspect().components).toHaveLength(0)
    expect(shownAlive(store.state.value.nodes)).toEqual([])
    // Nodes stay visible, marked released: the retraction shows.
    expect(store.state.value.nodes.length).toBeGreaterThan(3)
    expect(store.state.value.nodes.every((n) => n.state === 'released')).toBe(true)
  })
})

describe('reversibility, observable', () => {
  it('deactivates only the dependents when a provider leaves, and reactivates them', async () => {
    const { kernel, store } = await startedRun()
    // A name the run invented, that someone consumes. Built tools are out of
    // this test: their return depends on their parent (see deferred-work.md).
    const what = sharedName(store)
    expect(what.length).toBeGreaterThan(0)
    const dependents = () =>
      store.state.value.nodes.filter(
        (n) => n.needs.includes(what) && !n.provides.includes(what) && n.build === undefined,
      )
    expect(dependents().length).toBeGreaterThan(0)
    expect(dependents().every((n) => n.state === 'finished')).toBe(true)

    const name = publisherOf(store, what)
    const source = kernel.inspect().components.find((c) => c.name === name)
    await kernel.release(source!.id as ComponentId)
    await tick()

    // Nobody asked for anything: they deactivate on their own.
    expect(dependents().every((n) => n.state === 'waiting-for-dependency')).toBe(true)
    for (const node of dependents()) {
      expect(node.cause).toEqual({ kind: 'dependency-gone', names: [what] })
    }

    await kernel.load(replacementFor(`${name}-bis`, what))
    // Reactivation redoes the work: it takes the time it takes.
    await until(() => dependents().every((n) => n.state === 'finished'))

    expect(dependents().every((n) => n.state === 'finished')).toBe(true)
  })

  it('leaves no residual effect after a full release', async () => {
    const { kernel } = await startedRun()
    await kernel.releaseAll()
    await tick()
    expect(kernel.inspect().components).toHaveLength(0)
    expect(kernel.inspect().dependencies).toHaveLength(0)

    // The run can start again: no name stayed reserved.
    const restart = await startFactory(kernel, {
      brief: BRIEF,
      reasoner: scriptedModel(),
    spawnWorker: spawnVmWorker,
      sources: [],
      stepMs: 10,
      settleTimeoutMs: 3000,
    })
    await until(() => kernel.pendingGates().length > 0)
    await approve(kernel)
    await until(() => kernel.inspect().components.every((c) => c.finished || c.state !== 'active'))
    expect(restart.master).toBeDefined()
    expect(kernel.inspect().components.length).toBeGreaterThan(3)
  })

  it('emits no incident event on a nominal run', async () => {
    const { store } = await startedRun()
    expect(store.state.value.incidents).toEqual([])
  })
})
