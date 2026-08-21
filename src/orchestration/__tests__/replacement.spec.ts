// What the hot replacement costs the visitor, measured rather than claimed.
//
// The counter on screen says "N replacements, 0 restarts, M interactions
// kept". Each of those three numbers is only worth something if it comes from
// the runtime rather than from an agent's word — this file pins that down.
import { describe, expect, it } from 'vitest'
import { runToGate } from './helpers'

describe('what a replacement leaves behind', () => {
  it('counts a replacement that took, from the runtime event', async () => {
    const pilot = await runToGate()

    // The scripted run writes a behaviour, then improves it while it serves.
    expect(pilot.session().counts.replacements).toBe(1)
    expect(pilot.session().counts.restarts).toBe(0)
    await pilot.stop()
  })

  it('keeps a single live name across the replacement', async () => {
    const pilot = await runToGate()
    const behaviours = pilot.behaviours()

    expect(behaviours).toHaveLength(1)
    expect(behaviours[0]?.version).toBe(2)
    await pilot.stop()
  })

  it('leaves the replaced version in the graph, released, not erased', async () => {
    const pilot = await runToGate()
    const built = pilot.store.state.value.nodes.filter((node) => node.build !== undefined)

    // Two versions in the graph: the trace is the point. Erasing the previous
    // one would hide exactly what the product claims to show.
    expect(built).toHaveLength(2)
    expect(built[0]?.state).toBe('released')
    expect(built[1]?.state).toBe('finished')
    // And the new one says whose place it took.
    expect(built[1]?.replaces).toBe(built[0]?.id)
    await pilot.stop()
  })

  it('reduces the same count into the read model', async () => {
    const pilot = await runToGate()

    expect(pilot.store.state.value.replacements).toBe(1)
    expect(pilot.store.state.value.restarts).toBe(0)
    await pilot.stop()
  })

  it('starts a new session on a new run, rather than carrying the old count', async () => {
    const pilot = await runToGate()
    expect(pilot.session().counts.replacements).toBe(1)

    await pilot.start('Un autre besoin, tout à fait différent.')

    // A counter that accumulated across runs would be flattering and false.
    expect(pilot.session().counts.interactions).toBe(0)
    await pilot.stop()
  })
})
