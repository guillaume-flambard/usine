import { describe, expect, it } from 'vitest'
import { createStore } from '../store'
import { createKernel } from '../../runtime/kernel'
import type { Component } from '../../runtime/contract'

const tick = async () => {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

const tool: Component = {
  name: 'registry-tool',
  provides: ['registry'],
  display: { role: 'Fournit le registre', technology: 'registre EU' },
  apply(context) {
    context.emit('Charge 412 allégations.')
    context.provide('registry', { claims: 412 })
    context.finish()
  },
}

const agent: Component = {
  name: 'checker',
  needs: ['registry'],
  display: { role: 'Vérifie les allégations' },
  apply(context) {
    context.read('registry')
  },
}

describe('store', () => {
  it('reflects a real run connected to the kernel', async () => {
    const kernel = createKernel()
    const store = createStore()
    store.connect(kernel)

    await kernel.load(agent)
    await tick()
    expect(store.state.value.nodes[0]?.state).toBe('waiting-for-dependency')

    await kernel.load(tool)
    await tick()

    const state = store.state.value
    expect(state.nodes.map((n) => n.state).sort()).toEqual(['finished', 'working'])
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]?.hasTransited).toBe(true)
    expect(state.narration?.message).toBe('Charge 412 allégations.')
    expect(state.liveAgents).toBe(2)
  })

  it('stops updating once disconnected', async () => {
    const kernel = createKernel()
    const store = createStore()
    const disconnect = store.connect(kernel)

    await kernel.load(tool)
    await tick()
    const before = store.state.value.lastSequence
    expect(before).toBeGreaterThan(0)

    disconnect()
    await kernel.load(agent)
    await tick()

    expect(store.state.value.lastSequence).toBe(before)
  })

  it('starts from an empty state on reset', async () => {
    const kernel = createKernel()
    const store = createStore()
    store.connect(kernel)
    await kernel.load(tool)
    await tick()
    expect(store.state.value.nodes).not.toHaveLength(0)

    store.reset()
    expect(store.state.value.nodes).toHaveLength(0)
    expect(store.state.value.narration).toBeUndefined()
    expect(store.state.value.lastSequence).toBe(0)
  })

  it('exposes a state nothing can mutate', async () => {
    const kernel = createKernel()
    const store = createStore()
    store.connect(kernel)
    await kernel.load(tool)
    await tick()

    const state = store.state.value
    // Vue freezes the exposed value: the mutation throws in strict mode and is
    // a no-op otherwise. TypeScript already refuses it at compile time.
    expect(() => {
      ;(state.nodes as unknown as { push: (v: unknown) => void }).push({})
    }).toThrow()
    expect(store.state.value.nodes).toHaveLength(1)
  })
})
