import { describe, expect, it } from 'vitest'
import { measureRun, measureDelta, type RunMeasure } from '../measure'
import { behaviourKey } from '../behaviour'
import type { RunArchive } from '../replay'
import type { RunEvent } from '../../runtime/events'
import type { ComponentId } from '../../runtime/contract'

const M = 'master#0' as ComponentId

function archive(...factories: ((seq: number) => Omit<RunEvent, 'sequence' | 'at'>)[]): RunArchive {
  return {
    version: 1,
    brief: 'à mesurer',
    events: factories.map((make, index) => {
      const seq = index + 1
      return { ...make(seq), sequence: seq, at: index } as RunEvent
    }),
  }
}

const agent = (id: string) => () => ({
  type: 'component-created' as const,
  id: id as ComponentId,
  name: id,
  display: { role: 'agent' },
  needs: [],
  provides: [],
  parent: M,
})
const behaviour = (id: string, name: string) => () => ({
  type: 'component-created' as const,
  id: id as ComponentId,
  name,
  display: { role: 'comportement' },
  needs: [],
  provides: [behaviourKey(name)],
  parent: M,
})
const screen = (id: string) => () => ({
  type: 'screen-posted' as const,
  id: id as ComponentId,
  markup: '<h1>x</h1>',
  revision: 1,
})
const replaced = (id: string, previous: string, name: string) => () => ({
  type: 'component-replaced' as const,
  id: id as ComponentId,
  previous: previous as ComponentId,
  name,
})
const tokens = (id: string, input: number, output: number) => () => ({
  type: 'tokens-spent' as const,
  id: id as ComponentId,
  input,
  output,
})
const message = (id: string, kind?: 'malformed' | 'rollback') => () => ({
  type: 'message-emitted' as const,
  id: id as ComponentId,
  message: 'peu importe',
  ...(kind !== undefined ? { kind } : {}),
})

describe('measureRun — port client de measure()', () => {
  it('mesure un run servi : écran + comportement, agents, remplacement, tokens', () => {
    const m = measureRun(
      archive(
        agent('a#1'), // 1
        screen('a#1'), // 2
        behaviour('d#1', 'detecteur'), // 3
        tokens('a#1', 100, 40), // 4
        replaced('d#2', 'd#1', 'detecteur'), // 5
      ),
    )
    const expected: RunMeasure = {
      events: 5,
      agents: 1,
      served: true,
      replacements: 1,
      rollbacks: 0,
      firstScreenAt: 3, // max(screen rank 2, behaviour rank 3)
      tokens: 140,
      malformed: 0,
    }
    expect(m).toEqual(expected)
  })

  it('n’est pas servi sans comportement, et firstScreenAt est null', () => {
    const m = measureRun(archive(agent('a#1'), screen('a#1')))
    expect(m.served).toBe(false)
    expect(m.firstScreenAt).toBeNull()
  })

  it('compte rollbacks et malformed sur le champ kind, pas sur la prose', () => {
    const m = measureRun(
      archive(message('a#1', 'rollback'), message('a#1', 'malformed'), message('a#1')),
    )
    expect(m.rollbacks).toBe(1)
    expect(m.malformed).toBe(1)
  })

  it('un comportement n’est pas compté comme agent', () => {
    const m = measureRun(archive(behaviour('d#1', 'detecteur')))
    expect(m.agents).toBe(0)
  })

  it('measureDelta calcule branch - trunk, et null si un côté manque', () => {
    expect(measureDelta(3, 5)).toEqual({ trunk: 3, branch: 5, delta: 2 })
    expect(measureDelta(null, 5)).toEqual({ trunk: null, branch: 5, delta: null })
  })
})
