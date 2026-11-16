import { describe, expect, it } from 'vitest'
import { threadOfName, threadsOf } from '../run/threads'
import type { RunNode } from '../run/readModel'
import { initialsOf } from '../chat/session'

const node = (id: string, name: string): RunNode => ({
  id,
  name,
  state: 'finished',
  startedAt: 0,
  reasoning: { started: 0, settled: 0 },
})

describe('thread colours (MEM-86)', () => {
  it('gives each role its thread', () => {
    expect(threadOfName('supervisor')).toBe('sup')
    expect(threadOfName('synthesize')).toBe('amb')
    expect(threadOfName('human_gate')).toBe('ink')
    expect(threadOfName('act')).toBe('ink')
  })

  it('ranks specialists in start order, and wraps after three', () => {
    const threads = threadsOf([
      node('t1', 'supervisor'),
      node('t2', 'specialist'),
      node('t3', 'specialist'),
      node('t4', 'specialist'),
      node('t5', 'specialist'),
      node('t6', 'synthesize'),
      node('t7', 'human_gate'),
    ])
    expect([...threads.values()]).toEqual(['sup', 'sky', 'mag', 'grn', 'sky', 'amb', 'ink'])
  })

  it('gives the same run the same colours every time', () => {
    const nodes = [node('a', 'supervisor'), node('b', 'specialist'), node('c', 'specialist')]
    expect([...threadsOf(nodes)]).toEqual([...threadsOf([...nodes])])
  })
})

describe('avatar initials', () => {
  it('takes the first letters of the local part', () => {
    expect(initialsOf('guillaume.flambard@example.org')).toBe('GF')
    expect(initialsOf('contact@memolabs.dev')).toBe('C')
    expect(initialsOf(undefined)).toBe('')
  })
})
