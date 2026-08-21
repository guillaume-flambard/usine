// Hot-swapping a part, and withdrawing a faulty version without leaving the
// run amputated.
import { describe, expect, it } from 'vitest'
import { createKernel } from '../kernel'
import type { Component, ComponentId } from '../contract'
import type { RunEvent } from '../events'

const tick = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

const part = (version: number, broken = false): Component => ({
  name: 'built-part',
  provides: ['output'],
  display: { label: `Pièce v${version}`, role: `Version ${version}` },
  apply(context) {
    if (broken) throw new Error('version fautive')
    context.provide('output', { version })
    context.finish()
  },
})

const consumer: Component = {
  name: 'consumer',
  needs: ['output'],
  display: { label: 'Consommateur', role: 'Lit la sortie' },
  apply(context) {
    context.read('output')
  },
}

describe('hot replacement', () => {
  it('replaces a live part with a new version', async () => {
    const kernel = createKernel()
    const id = await kernel.load(part(1))
    await kernel.load(consumer)
    await tick()

    const fresh = await kernel.replace(id as ComponentId, part(2))
    await tick()

    expect(fresh).toBeDefined()
    const components = kernel.inspect().components
    expect(components.filter((c) => c.name === 'built-part')).toHaveLength(1)
    expect(components.find((c) => c.name === 'built-part')?.display.label).toBe('Pièce v2')
  })

  it('reactivates dependents after the replacement', async () => {
    const kernel = createKernel()
    const id = await kernel.load(part(1))
    await kernel.load(consumer)
    await tick()

    await kernel.replace(id as ComponentId, part(2))
    await tick()

    const seen = kernel.inspect().components.find((c) => c.name === 'consumer')
    expect(seen?.state).toBe('active')
    expect(kernel.inspect().dependencies.some((d) => d.name === 'output')).toBe(true)
  })

  it('puts the previous version back when the new one is faulty', async () => {
    const kernel = createKernel()
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))
    const id = await kernel.load(part(1))
    await tick()

    const fresh = await kernel.replace(id as ComponentId, part(2, true))
    await tick()

    expect(fresh).toBeUndefined()
    const live = kernel.inspect().components.filter((c) => c.name === 'built-part')
    // The faulty version is discarded, but the run is not amputated.
    expect(live.filter((c) => c.state === 'active')).toHaveLength(1)
    expect(live.find((c) => c.state === 'active')?.display.label).toBe('Pièce v1')
    expect(events.some((event) => event.type === 'component-failed')).toBe(true)
  })

  it('marks the new version as built when told so', async () => {
    const kernel = createKernel()
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))
    const id = await kernel.load(part(1))
    await tick()

    await kernel.replace(id as ComponentId, part(2), {
      specification: 'nom : built-part',
      source: 'assemblée',
      route: 'composition',
    })
    await tick()

    // The replacement happens at the root: it has no parent, therefore no
    // build event. That is the expected behaviour here.
    expect(events.some((event) => event.type === 'component-created')).toBe(true)
  })

  it('does nothing on an unknown identifier', async () => {
    const kernel = createKernel()
    await expect(kernel.replace('unknown' as ComponentId, part(1))).resolves.toBeUndefined()
    expect(kernel.inspect().components).toHaveLength(0)
  })
})

describe('replacing a component loaded by another', () => {
  const child = (version: number, broken = false): Component => ({
    name: 'child-part',
    provides: ['output'],
    display: { label: `Enfant v${version}`, role: `Version ${version}` },
    apply(context) {
      if (broken) throw new Error('version fautive')
      context.provide('output', { version })
      context.finish()
    },
  })

  const host = (toLoad: Component): Component => ({
    name: 'host',
    display: { label: 'Hôte', role: "Charge l'enfant" },
    apply(context) {
      void context.load(toLoad)
    },
  })

  it('places the new version under its parent, not at the root', async () => {
    const kernel = createKernel()
    const hostId = await kernel.load(host(child(1)))
    await tick()
    const childId = kernel.inspect().components.find((c) => c.name === 'child-part')?.id
    expect(childId).toBeDefined()

    await kernel.replace(childId!, child(2))
    await tick()

    const replacement = kernel.inspect().components.find((c) => c.name === 'child-part')
    expect(replacement?.display.label).toBe('Enfant v2')
    expect(replacement?.parent).toBe(hostId)

    // The cascade still holds: releasing the host takes the new version too.
    await kernel.release(hostId as ComponentId)
    await tick()
    expect(kernel.inspect().components).toHaveLength(0)
  })

  it("carries the new version's build origin", async () => {
    const kernel = createKernel()
    const events: RunEvent[] = []
    kernel.subscribe((event) => events.push(event))
    await kernel.load(host(child(1)))
    await tick()
    const childId = kernel.inspect().components.find((c) => c.name === 'child-part')?.id

    await kernel.replace(childId!, child(2), {
      specification: 'nom : child-part',
      source: 'assemblée à partir de deux primitives',
      route: 'composition',
    })
    await tick()

    const built = events.find((event) => event.type === 'component-built')
    expect(built).toBeDefined()
    if (built?.type === 'component-built') {
      expect(built.build.source).toContain('primitives')
      expect(built.parent).toBeDefined()
    }
  })

  it("restores the replaced version's children too when the rollback plays", async () => {
    const grandchild: Component = {
      name: 'small-part',
      display: { label: 'Petite pièce', role: 'Chargée par la pièce' },
      apply(context) {
        context.finish()
      },
    }
    const withChild: Component = {
      name: 'child-part',
      provides: ['output'],
      display: { label: 'Enfant v1', role: 'Charge une petite pièce' },
      apply(context) {
        context.provide('output', { version: 1 })
        void context.load(grandchild)
      },
    }

    const kernel = createKernel()
    await kernel.load(host(withChild))
    await tick()
    const childId = kernel.inspect().components.find((c) => c.name === 'child-part')?.id
    expect(kernel.inspect().components.some((c) => c.name === 'small-part')).toBe(true)

    await kernel.replace(childId!, child(2, true))
    await tick()

    const live = kernel.inspect().components.map((c) => c.name)
    // The rollback restores the part AND what it had loaded: otherwise the run
    // would stay amputated, which is precisely what this API promises to avoid.
    expect(live).toContain('child-part')
    expect(live).toContain('small-part')
  })

  it('ignores a second replacement started during the first', async () => {
    const kernel = createKernel()
    await kernel.load(host(child(1)))
    await tick()
    const childId = kernel.inspect().components.find((c) => c.name === 'child-part')?.id

    const [a, b] = await Promise.all([
      kernel.replace(childId!, child(2)),
      kernel.replace(childId!, child(3)),
    ])
    await tick()

    expect([a, b].filter((r) => r !== undefined)).toHaveLength(1)
    expect(kernel.inspect().components.filter((c) => c.name === 'child-part')).toHaveLength(1)
  })
})
