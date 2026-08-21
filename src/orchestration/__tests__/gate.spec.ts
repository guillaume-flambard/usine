// The human decision. The run halts, shows what it asks to settle, and the
// decision has visible consequences.
import { describe, expect, it, vi } from 'vitest'
import { createKernel } from '../../runtime/kernel'
import type { Component, ComponentId } from '../../runtime/contract'
import { runToGate, until } from './helpers'

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((r) => setTimeout(r, 0))
}

describe('the gate halts and waits', () => {
  it('halts the run with nothing crossing it', async () => {
    const pilot = await runToGate()

    expect(pilot.phase()).toBe('Décision')
    expect(pilot.store.state.value.gate?.decision).toBeUndefined()
    // Nothing is delivered while nobody has decided.
    expect(pilot.product()).toBeUndefined()
  })

  it('shows what was actually produced, and what is held against it', async () => {
    const pilot = await runToGate()
    const gate = pilot.store.state.value.gate

    expect(gate?.subject.summary).toContain('agents ont été créés')
    expect(gate?.subject.summary).toContain('Approuver')
    // A decision bearing on nothing would be worth nothing.
    expect((gate?.subject.objection ?? '').trim().length).toBeGreaterThan(20)
  })
})

describe('no delay crosses the gate', () => {
  it('holds through ten minutes of simulated time', async () => {
    const pilot = await runToGate()
    expect(pilot.phase()).toBe('Décision')

    // Zero-millisecond ticks prove nothing: a five-second `setTimeout` would
    // slip through. We really advance time.
    vi.useFakeTimers()
    try {
      await vi.advanceTimersByTimeAsync(600_000)
    } finally {
      vi.useRealTimers()
    }
    await tick()

    expect(pilot.store.state.value.gate?.decision).toBeUndefined()
    expect(pilot.phase()).toBe('Décision')
    expect(pilot.product()).toBeUndefined()
  })
})

describe('approving', () => {
  it('carries the run through to delivery', async () => {
    const pilot = await runToGate()
    expect(pilot.approve()).toBe(true)

    await until(() => pilot.product() !== undefined)
    expect(pilot.store.state.value.gate?.decision).toBe('approved')
    // Delivery is the product become usable: the function the run wrote,
    // runnable from the page.
    expect(typeof pilot.product()?.run).toBe('function')
  })

  it('traces the decision in the log', async () => {
    const pilot = await runToGate()
    pilot.approve()
    await until(() => pilot.store.state.value.log.some((m) => m.message.includes('approuvé')))

    expect(pilot.store.state.value.log.some((m) => m.message.includes('approuvé'))).toBe(true)
    expect(pilot.store.state.value.gate?.decision).toBe('approved')
  })

  it('cannot be taken twice', async () => {
    const pilot = await runToGate()
    expect(pilot.approve()).toBe(true)
    await tick()
    expect(pilot.approve()).toBe(false)
  })
})

describe('rejecting', () => {
  it('prevents delivery', async () => {
    const pilot = await runToGate()
    expect(await pilot.reject()).toBe(true)
    await tick()

    expect(pilot.store.state.value.gate?.decision).toBe('rejected')
    expect(pilot.phase()).toBe('Écarté')
    expect(pilot.isDone()).toBe(true)
    expect(pilot.product()).toBeUndefined()
  })

  it('shows the retraction instead of freezing the graph', async () => {
    const pilot = await runToGate()
    const part = () => pilot.store.state.value.nodes.find((n) => n.build !== undefined)
    expect(part()?.state).toBe('finished')

    await pilot.reject()
    await tick()

    // The built part is released, and it shows.
    expect(part()?.state).toBe('released')
    // The gate stays visible: it is the trace of what was settled.
    expect(pilot.store.state.value.gate?.decision).toBe('rejected')
  })

  it('records the refusal in the log', async () => {
    const pilot = await runToGate()
    await pilot.reject()
    await until(() => pilot.store.state.value.log.some((m) => m.message.includes('écarté')))

    expect(pilot.store.state.value.log.some((m) => m.message.includes('écarté'))).toBe(true)
  })

  it('cannot be taken after an approval', async () => {
    const pilot = await runToGate()
    pilot.approve()
    await tick()
    expect(await pilot.reject()).toBe(false)
  })
})

describe('the objection', () => {
  it('bears on what was actually produced', async () => {
    const pilot = await runToGate()
    const objection = pilot.store.state.value.gate?.subject.objection ?? ''

    // A generic objection would not satisfy the requirement: it must lean on
    // what this particular run produced.
    expect(objection).toContain('motifs')
  })
})

describe('the kernel, at the boundary', () => {
  const gateComponent = (onDecision?: () => void): Component => ({
    name: 'test-gate',
    display: { label: 'Porte', role: 'Attend' },
    apply(context) {
      context.awaitDecision({ summary: 'résumé', objection: 'objection' }, () => {
        onDecision?.()
      })
    },
  })

  it('registers then withdraws the gate', async () => {
    const kernel = createKernel()
    const id = await kernel.load(gateComponent())
    await tick()
    expect(kernel.pendingGates()).toEqual([id])

    expect(kernel.decide(id as ComponentId, 'approved')).toBe(true)
    expect(kernel.pendingGates()).toEqual([])
  })

  it('returns false and calls nothing when no gate waits', async () => {
    const kernel = createKernel()
    let calls = 0
    const id = await kernel.load(gateComponent(() => (calls += 1)))
    await tick()
    kernel.decide(id as ComponentId, 'approved')
    expect(kernel.decide(id as ComponentId, 'rejected')).toBe(false)
    expect(calls).toBe(1)
  })

  it('withdraws the gate when its component is released', async () => {
    const kernel = createKernel()
    const id = await kernel.load(gateComponent())
    await tick()
    await kernel.release(id as ComponentId)
    await tick()
    expect(kernel.pendingGates()).toEqual([])
    expect(kernel.decide(id as ComponentId, 'approved')).toBe(false)
  })

  it('does not surface the exception of a component throwing on the decision', async () => {
    const kernel = createKernel()
    const events: string[] = []
    kernel.subscribe((e) => events.push(e.type))
    const id = await kernel.load({
      name: 'faulty-gate',
      display: { label: 'Porte', role: 'Lève à la décision' },
      apply(context) {
        context.awaitDecision({ summary: 'r', objection: 'o' }, () => {
          throw new Error('boum')
        })
      },
    })
    await tick()

    expect(() => kernel.decide(id as ComponentId, 'approved')).not.toThrow()
    expect(events).toContain('component-failed')
  })
})
