import { describe, expect, it } from 'vitest'
import { createSession } from '../session'

describe('the visitor session', () => {
  it('numbers interactions in order, from one', () => {
    const session = createSession()

    session.record({ name: 'compter', input: 'a', output: '1', version: 1 })
    const second = session.record({ name: 'compter', input: 'b', output: '2', version: 2 })

    expect(second.index).toBe(2)
    expect(session.interactions.map((entry) => entry.index)).toEqual([1, 2])
  })

  it('remembers which version answered — that is what makes the counter honest', () => {
    const session = createSession()

    session.record({ name: 'compter', input: 'a', output: '1', version: 1 })
    session.noteReplacement()
    session.record({ name: 'compter', input: 'a', output: '1 syllabe', version: 2 })

    expect(session.interactions.map((entry) => entry.version)).toEqual([1, 2])
    expect(session.counts).toEqual({ interactions: 2, replacements: 1, restarts: 0 })
  })

  it('keeps a failure as an interaction: a call that failed still happened', () => {
    const session = createSession()

    session.record({ name: 'compter', input: 'a', failure: 'arrêté' })

    expect(session.counts.interactions).toBe(1)
    expect(session.interactions[0]?.output).toBeUndefined()
  })

  it('counts no replacement on its own', () => {
    const session = createSession()

    session.record({ name: 'compter', input: 'a', output: '1' })

    expect(session.counts.replacements).toBe(0)
  })

  it('can say a restart happened, so the counter cannot lie by omission', () => {
    const session = createSession()

    session.noteRestart()

    expect(session.counts.restarts).toBe(1)
  })
})
