// Covers the facade handed to components and the event stream, where
// `kernel.spec.ts` does not go: dependency reads, narration, work completion,
// unsubscribing, topology shape, and subscriber incidents.
import { describe, expect, it, vi } from 'vitest'
import { createKernel } from '../kernel'
import type { Component, ComponentId } from '../contract'
import type { RunEvent } from '../events'

const tick = async () => {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

function recorded() {
  const kernel = createKernel()
  const events: RunEvent[] = []
  const unsubscribe = kernel.subscribe((event) => events.push(event))
  return { kernel, events, unsubscribe }
}

const provider = (name: string, key: string, value: unknown): Component => ({
  name,
  provides: [key],
  display: { role: `Fournit ${key}`, technology: 'registre EU' },
  apply(context) {
    context.provide(key, value)
  },
})

describe('the component facade', () => {
  it('returns the published value and reports the transit', async () => {
    const { kernel, events } = recorded()
    let received: unknown
    await kernel.load(provider('eu-registry', 'registry', { articles: 12 }))
    await kernel.load({
      name: 'checker',
      needs: ['registry'],
      display: { role: 'Lit le registre' },
      apply(context) {
        received = context.read('registry')
      },
    })
    await tick()

    expect(received).toEqual({ articles: 12 })
    const transit = events.find((event) => event.type === 'value-passed')
    expect(transit).toBeDefined()
    if (transit?.type === 'value-passed') {
      expect(transit.name).toBe('registry')
      expect(transit.from).toContain('eu-registry')
      expect(transit.to).toContain('checker')
    }
  })

  it('reports the transit even when the published value is undefined', async () => {
    const { kernel, events } = recorded()
    await kernel.load(provider('empty', 'registry', undefined))
    await kernel.load({
      name: 'reader',
      needs: ['registry'],
      display: { role: 'Lit' },
      apply(context) {
        context.read('registry')
      },
    })
    await tick()

    expect(events.some((event) => event.type === 'value-passed')).toBe(true)
  })

  it('refuses to provide or read an undeclared name, and activation fails', async () => {
    for (const move of ['provide', 'read'] as const) {
      const { kernel, events } = recorded()
      await kernel.load({
        name: `undisciplined-${move}`,
        display: { role: 'Sort de sa déclaration' },
        apply(context) {
          if (move === 'provide') context.provide('unknown', 1)
          else context.read('unknown')
        },
      })
      await tick()

      const failure = events.find((event) => event.type === 'component-failed')
      expect(failure?.type === 'component-failed' && failure.error.code).toBe(
        'unknown-dependency',
      )
      expect(events.some((event) => event.type === 'component-activated')).toBe(false)
      expect(kernel.inspect().components[0]?.state).toBe('failed')
    }
  })

  it('carries narration and work completion through to the stream and topology', async () => {
    const { kernel, events } = recorded()
    await kernel.load({
      name: 'planner',
      display: { role: 'Découpe le besoin' },
      apply(context) {
        context.emit('Découpe le besoin en quatre histoires.')
        context.finish()
      },
    })
    await tick()

    const message = events.find((event) => event.type === 'message-emitted')
    expect(message?.type === 'message-emitted' && message.message).toBe(
      'Découpe le besoin en quatre histoires.',
    )
    expect(events.some((event) => event.type === 'work-finished')).toBe(true)
    expect(kernel.inspect().components[0]?.finished).toBe(true)
  })

  it('names the departed dependency in the deactivation cause', async () => {
    const { kernel, events } = recorded()
    await kernel.load({
      name: 'checker',
      needs: ['registry'],
      display: { role: 'Attend le registre' },
      apply() {},
    })
    const toolId = await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()
    expect(toolId).toBeDefined()

    await kernel.release(toolId as ComponentId)
    await tick()

    const deactivated = events.find((event) => event.type === 'component-deactivated')
    expect(deactivated?.type === 'component-deactivated' && deactivated.cause).toEqual({
      kind: 'dependency-gone',
      names: ['registry'],
    })
    expect(events.some((event) => event.type === 'component-released')).toBe(true)
  })

  it('describes each node with its role, technology and declared names', async () => {
    const { kernel } = recorded()
    await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()

    const node = kernel.inspect().components[0]
    expect(node?.display.role).toBe('Fournit registry')
    expect(node?.display.technology).toBe('registre EU')
    expect(node?.provides).toEqual(['registry'])
    expect(node?.needs).toEqual([])
  })

  it('exposes the parent link of components loaded in cascade', async () => {
    const { kernel } = recorded()
    await kernel.load({
      name: 'master',
      display: { role: 'Charge un enfant' },
      apply(context) {
        void context.load({
          name: 'child',
          display: { role: 'Chargé par le maître' },
          apply() {},
        })
      },
    })
    await tick()

    const child = kernel.inspect().components.find((c) => c.name === 'child')
    expect(child?.parent).toContain('master')
  })

  it('does not link to itself a component that provides and consumes one name', async () => {
    const { kernel } = recorded()
    await kernel.load({
      name: 'loop',
      provides: ['memory'],
      needs: ['memory'],
      display: { role: 'Publie et consomme' },
      apply(context) {
        context.provide('memory', {})
      },
    })
    await tick()

    expect(kernel.inspect().dependencies).toHaveLength(0)
  })

  it('stops delivering after unsubscribing', async () => {
    const { kernel, events, unsubscribe } = recorded()
    await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()
    const before = events.length
    expect(before).toBeGreaterThan(0)

    unsubscribe()
    await kernel.load({
      name: 'other',
      display: { role: 'Après désabonnement' },
      apply() {},
    })
    await tick()

    expect(events).toHaveLength(before)
  })

  it('isolates a throwing subscriber: others receive, the component stays active', async () => {
    const kernel = createKernel()
    const received: RunEvent[] = []
    kernel.subscribe(() => {
      throw new Error('abonné fautif')
    })
    kernel.subscribe((event) => received.push(event))

    await kernel.load({
      name: 'sane',
      display: { role: 'Ne fait rien de mal' },
      apply() {},
    })
    await tick()

    expect(kernel.inspect().components[0]?.state).toBe('active')
    expect(received.some((event) => event.type === 'component-activated')).toBe(true)
    const incident = received.find((event) => event.type === 'subscriber-failed')
    expect(incident?.type === 'subscriber-failed' && incident.message).toBe('abonné fautif')
  })

  it('releases a component whose load was still in flight', async () => {
    const { kernel } = recorded()
    // Deliberately without `await`: the release is requested before the fiber
    // exists.
    void kernel.load({
      name: 'in-flight',
      display: { role: 'Chargement non attendu' },
      apply() {},
    })
    await kernel.releaseAll()
    await tick()

    expect(kernel.inspect().components).toHaveLength(0)
  })

  it('stays idempotent when the same component is released twice', async () => {
    const { kernel, events } = recorded()
    const id = await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()
    await Promise.all([kernel.release(id as ComponentId), kernel.release(id as ComponentId)])
    await tick()

    expect(events.filter((event) => event.type === 'component-released')).toHaveLength(1)
  })

  it('makes a facade kept past release inert', async () => {
    const { kernel, events } = recorded()
    let facade: Parameters<Component['apply']>[0] | undefined
    const id = await kernel.load({
      name: 'talkative',
      display: { role: 'Garde sa façade' },
      apply(context) {
        facade = context
      },
    })
    await tick()
    await kernel.release(id as ComponentId)
    await tick()
    const before = events.length

    expect(() => facade?.emit('trop tard')).not.toThrow()
    expect(() => facade?.effect(() => () => {}, 'too late')).not.toThrow()
    expect(events).toHaveLength(before)
  })

  it("frees the reserved name when the provider's activation fails", async () => {
    const { kernel } = recorded()
    await kernel.load({
      name: 'faulty-provider',
      provides: ['registry'],
      display: { role: 'Échoue avant de publier' },
      apply() {
        throw new Error('boum')
      },
    })
    await tick()

    const replacement = await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()
    expect(replacement).toBeDefined()
  })

  it('emits no console output', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { kernel } = recorded()
    await kernel.load(provider('eu-registry', 'registry', {}))
    await tick()
    await kernel.releaseAll()

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('stream ordering', () => {
  it('announces activation before anything the component emits', async () => {
    const { kernel, events } = recorded()
    await kernel.load({
      name: 'talkative',
      display: { role: 'Parle et termine dans apply' },
      apply(context) {
        context.emit('premier mot')
        context.finish()
      },
    })
    await tick()

    expect(events.map((event) => event.type)).toEqual([
      'component-created',
      'component-activated',
      'message-emitted',
      'work-finished',
    ])
  })

  it('keeps the narration of a failing component, before its error', async () => {
    const { kernel, events } = recorded()
    await kernel.load({
      name: 'talkative-faulty',
      display: { role: 'Parle puis échoue' },
      apply(context) {
        context.emit('je commence')
        throw new Error('boum')
      },
    })
    await tick()

    // Chronological order: the component spoke, then it failed. The narration
    // must not be replayed after the error.
    expect(events.map((event) => event.type)).toEqual([
      'component-created',
      'message-emitted',
      'component-failed',
    ])
    expect(events.some((event) => event.type === 'component-activated')).toBe(false)
  })
})
