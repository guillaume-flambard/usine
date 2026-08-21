// The application's real wiring — kernel, store, layout, need — tested
// outside any component. Without this, the whole application can be broken at
// the wiring level with a fully green suite.
import { describe, expect, it, vi } from 'vitest'
import { createPilot } from '../pilot'
import type { Reasoner } from '../../runtime/reasoner'
import { scriptedModel } from '../../agents/__tests__/scripted-model'
import { BRIEF, runToGate, runFinished, scriptedPilot, until } from './helpers'

const model = (reason: Reasoner['reason']): Reasoner => ({ origin: 'llm', reason })

describe('pilot', () => {
  it('carries a full run through and fills the view', async () => {
    const pilot = scriptedPilot()
    expect(pilot.phase()).toBe('Au repos')

    await pilot.start(BRIEF)
    await until(() => pilot.phase() === 'Décision')

    // The run halts on the human gate by itself: nothing crosses it.
    expect(pilot.phase()).toBe('Décision')
    expect(pilot.isDone()).toBe(false)
    expect(pilot.approve()).toBe(true)
    await until(() => pilot.isDone())

    expect(pilot.store.state.value.nodes.length).toBeGreaterThan(3)
    expect(pilot.store.state.value.narration).toBeDefined()
    expect(pilot.error()).toBeUndefined()
    await pilot.stop()
  })

  it('really lets the typed need drive the run', async () => {
    const seen: string[] = []
    const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 1000 })
    pilot.connect(
      model(async (request) => {
        seen.push(request.context)
        return { text: '{"thought":"","actions":[{"type":"done","summary":""}]}', origin: 'llm' }
      }),
    )
    await pilot.start('Un compteur de syllabes pour poètes pressés.')
    await until(() => seen.length > 0)

    // The field would be decorative if the model did not receive it.
    expect(seen.join('\n')).toContain('syllabes')
    await pilot.stop()
  })

  it('resets everything between two runs', async () => {
    const pilot = await runToGate()
    const first = pilot.store.state.value.lastSequence

    await pilot.start(BRIEF)
    await until(() => pilot.store.state.value.nodes.length > 1)

    expect(pilot.store.state.value.lastSequence).toBeLessThanOrEqual(first)
    expect(pilot.store.state.value.incidents).toEqual([])
    await pilot.stop()
  })

  it('releases everything on stop', async () => {
    const pilot = await runToGate()
    const kernel = pilot.kernel()
    expect(kernel?.inspect().components.length).toBeGreaterThan(0)

    await pilot.stop()
    expect(kernel?.inspect().components).toHaveLength(0)
    expect(pilot.kernel()).toBeUndefined()
  })

  it('has a place for every node, including those born mid-run', async () => {
    const pilot = await runFinished()
    for (const node of pilot.store.state.value.nodes) {
      expect(pilot.layout.value.boxes.has(node.name), node.name).toBe(true)
    }
    await pilot.stop()
  })

  it('gives a short label to every node, invented ones included', async () => {
    // Without a label, the technical name overflows a 140 px box.
    const pilot = await runFinished()
    const unlabelled = pilot.store.state.value.nodes.filter(
      (node) => node.display.label === undefined,
    )
    expect(unlabelled.map((n) => n.name)).toEqual([])
    await pilot.stop()
  })
})

describe('the reasoning mode', () => {
  it('is deterministic by default, and nothing leaves for the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 500 })
    expect(pilot.reasoningMode()).toBe('deterministic')

    await pilot.start(BRIEF)
    await until(() => pilot.store.state.value.gate !== undefined)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(pilot.store.state.value.tokens).toEqual({ input: 0, output: 0 })
    fetchSpy.mockRestore()
    await pilot.stop()
  })

  it('brings no agent into existence without a model, and writes it in the gate', async () => {
    const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 500 })
    await pilot.start(BRIEF)
    await until(() => pilot.store.state.value.gate !== undefined)

    // A factory inventing without a model would be a disguised catalogue.
    expect(pilot.store.state.value.nodes).toHaveLength(1)
    expect(pilot.store.state.value.gate?.subject.summary).toContain("Aucun agent n'a été créé")
    await pilot.stop()
  })

  it('counts the tokens actually spent, and marks the connected agents', async () => {
    const pilot = await runToGate()

    const { input, output } = pilot.store.state.value.tokens
    expect(input).toBeGreaterThan(0)
    expect(output).toBeGreaterThan(0)
    const connected = pilot.store.state.value.nodes.filter((n) => n.usedModel === true)
    expect(connected.map((n) => n.name)).toContain('master-agent')
    await pilot.stop()
  })

  it('carries the run on and says so when the model fails', async () => {
    const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 800 })
    pilot.connect(
      model(async () => ({ text: '', origin: 'llm' as const, failure: 'quota dépassé' })),
    )

    await pilot.start(BRIEF)
    await until(() => pilot.store.state.value.gate !== undefined)

    // An unavailable model does not prevent reaching the gate: the run goes to
    // the end and says it produced nothing.
    expect(pilot.store.state.value.gate).toBeDefined()
    const master = pilot.store.state.value.nodes.find((n) => n.name === 'master-agent')
    expect(master?.fallback).toContain('quota dépassé')
    await pilot.stop()
  })

  it('does not freeze the run when the port rejects', async () => {
    const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 800 })
    pilot.connect(
      model(async () => {
        throw new Error('boum')
      }),
    )

    await pilot.start(BRIEF)
    await until(() => pilot.store.state.value.gate !== undefined)

    expect(pilot.store.state.value.gate).toBeDefined()
    const master = pilot.store.state.value.nodes.find((n) => n.name === 'master-agent')
    expect(master?.fallback).toContain('boum')
    await pilot.stop()
  })

  it('goes back to deterministic when disconnected', () => {
    const pilot = createPilot()
    pilot.connect(scriptedModel())
    expect(pilot.reasoningMode()).toBe('llm')
    pilot.connect(undefined)
    expect(pilot.reasoningMode()).toBe('deterministic')
  })
})
