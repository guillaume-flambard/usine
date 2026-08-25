import { describe, expect, it } from 'vitest'
import { importTrace, isImportError, type ImportResult } from '../index'
import { normalizeStream } from '../normalize'
import { isForeign, type RunArchive } from '../../replay'
import { initialState, reduce } from '../../../state/reducer'
import type { RunEvent } from '../../../runtime/events'
import type { ComponentId } from '../../../runtime/contract'

const id = (name: string) => name as ComponentId

const archiveOrThrow = (result: ImportResult): RunArchive => {
  if (isImportError(result)) throw new Error(`import unexpectedly failed: ${result.reason}`)
  return result
}

const readModel = (archive: RunArchive) =>
  archive.events.reduce(reduce, initialState()).view

describe('normalizeStream — absolute stamps to elapsed time', () => {
  it('anchors the first event at 0 and never emits a negative at', () => {
    const stream = normalizeStream([
      { at: 1_000_500, event: { type: 'work-finished', id: id('b') } },
      { at: 1_000_000, event: { type: 'component-activated', id: id('a') } },
    ])
    expect(stream[0]?.at).toBe(0)
    expect(stream.every((event) => event.at >= 0)).toBe(true)
  })

  it('orders out-of-order steps by increasing sequence', () => {
    const stream = normalizeStream([
      { at: 30, event: { type: 'subscriber-failed', message: 'c' } },
      { at: 10, event: { type: 'subscriber-failed', message: 'a' } },
      { at: 20, event: { type: 'subscriber-failed', message: 'b' } },
    ])
    expect(stream.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(stream.map((event) => (event as { message: string }).message)).toEqual(['a', 'b', 'c'])
  })

  it('keeps an empty stream empty', () => {
    expect(normalizeStream([])).toEqual([])
  })
})

describe('importTrace — format detection', () => {
  it('refuses an unrecognized format with a reason and no archive', () => {
    const result = importTrace({ nope: true })
    expect(isImportError(result)).toBe(true)
    if (isImportError(result)) expect(result.reason).toMatch(/non reconnu/)
  })

  it('refuses a non-object input', () => {
    expect(isImportError(importTrace('a string'))).toBe(true)
    expect(isImportError(importTrace(null))).toBe(true)
  })
})

describe('LangGraph adapter', () => {
  const trace = {
    graph: 'agent-recherche',
    steps: [
      { node: 'planner', start: 1_710_000_000_000, end: 1_710_000_000_500, output: 'plan prêt' },
      { node: 'tool', start: 1_710_000_000_600, error: 'timeout réseau' },
    ],
  }

  it('produces a version-1 foreign archive', () => {
    const archive = archiveOrThrow(importTrace(trace))
    expect(archive.version).toBe(1)
    expect(isForeign(archive)).toBe(true)
    expect(archive.brief).toBe('agent-recherche')
  })

  it('is replayable: reducing its stream reconstructs the run', () => {
    const view = readModel(archiveOrThrow(importTrace(trace)))
    const planner = view.nodes.find((node) => node.name === 'planner')
    const tool = view.nodes.find((node) => node.name === 'tool')
    expect(planner?.state).toBe('finished')
    expect(tool?.state).toBe('failed')
    expect(view.incidents).toHaveLength(1)
  })

  it('reduces the same way twice (deterministic replay)', () => {
    const archive = archiveOrThrow(importTrace(trace))
    expect(readModel(archive)).toEqual(readModel(archive))
  })

  it('creates each distinct node once, even across repeated steps', () => {
    const repeated = {
      steps: [
        { node: 'loop', start: 100, end: 200 },
        { node: 'loop', start: 300, end: 400 },
      ],
    }
    const archive = archiveOrThrow(importTrace(repeated))
    const created = archive.events.filter((event) => event.type === 'component-created')
    expect(created).toHaveLength(1)
  })

  it('refuses a recognized-but-broken trace (step missing start)', () => {
    const broken = { steps: [{ node: 'x' }] }
    const result = importTrace(broken)
    expect(isImportError(result)).toBe(true)
  })

  it('refuses an empty LangGraph trace', () => {
    expect(isImportError(importTrace({ steps: [] }))).toBe(true)
  })
})

describe('OTLP adapter', () => {
  const otlp = {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              { name: 'retrieve', startTimeUnixNano: '1710000000000000000', endTimeUnixNano: '1710000000500000000' },
              {
                name: 'generate',
                startTimeUnixNano: '1710000000600000000',
                endTimeUnixNano: '1710000000900000000',
                status: { code: 2, message: 'model refused' },
              },
            ],
          },
        ],
      },
    ],
  }

  it('produces a version-1 foreign archive replayable end-to-end', () => {
    const archive = archiveOrThrow(importTrace(otlp))
    expect(archive.version).toBe(1)
    expect(isForeign(archive)).toBe(true)
    const view = readModel(archive)
    expect(view.nodes.find((node) => node.name === 'retrieve')?.state).toBe('finished')
    expect(view.nodes.find((node) => node.name === 'generate')?.state).toBe('failed')
  })

  it('normalizes nanosecond stamps to elapsed milliseconds', () => {
    const archive = archiveOrThrow(importTrace(otlp))
    expect(archive.events[0]?.at).toBe(0)
    // generate starts 600ms after retrieve.
    const activate = archive.events.find(
      (event) => event.type === 'component-activated' && event.at === 600,
    )
    expect(activate).toBeDefined()
  })

  it('refuses a recognized-but-broken OTLP trace (span without name)', () => {
    const broken = { resourceSpans: [{ scopeSpans: [{ spans: [{ startTimeUnixNano: '1' }] }] }] }
    expect(isImportError(importTrace(broken))).toBe(true)
  })

  it('refuses an OTLP payload with no spans', () => {
    expect(isImportError(importTrace({ resourceSpans: [{ scopeSpans: [{ spans: [] }] }] }))).toBe(true)
  })
})

// A foreign archive carries no build.source, so nothing is recompilable — the
// property the UI's fork gate relies on (AD-49). Proven here at the data level.
describe('foreign traces carry no behaviour source', () => {
  it('emits no component-built event', () => {
    const archive = archiveOrThrow(
      importTrace({ steps: [{ node: 'a', start: 1, end: 2, output: 'x' }] }),
    )
    expect(archive.events.some((event: RunEvent) => event.type === 'component-built')).toBe(false)
  })
})
