import { describe, expect, it } from 'vitest'
import { archiveOf, isForeign, readArchive, type RunArchive } from '../replay'
import type { RunEvent } from '../../runtime/events'

// A minimal valid stream, enough for readArchive to accept it.
const events = (): RunEvent[] => [{ type: 'subscriber-failed', message: 'e1', sequence: 1, at: 0 }]

describe('archive origin marker', () => {
  it('treats a v1 archive with no origin as internal (and forkable)', () => {
    const internal = archiveOf('un brief', events())
    expect(internal.origin).toBeUndefined()
    expect(isForeign(internal)).toBe(false)
  })

  it('omits the origin key entirely when internal, so serialization is unchanged', () => {
    const internal = archiveOf('un brief', events())
    expect('origin' in internal).toBe(false)
  })

  it('marks an archive foreign when asked, and reports it as not forkable', () => {
    const foreign = archiveOf('trace importée', events(), 'foreign')
    expect(foreign.origin).toBe('foreign')
    expect(isForeign(foreign)).toBe(true)
  })

  it('readArchive preserves a foreign origin across a round trip', () => {
    const stored = JSON.parse(JSON.stringify(archiveOf('t', events(), 'foreign'))) as unknown
    const read = readArchive(stored)
    expect(read?.origin).toBe('foreign')
    expect(isForeign(read as RunArchive)).toBe(true)
  })

  it('readArchive leaves a legacy archive (no origin) internal', () => {
    const legacy = { version: 1, brief: 'ancien', events: events() }
    const read = readArchive(legacy)
    expect(read?.origin).toBeUndefined()
    expect(isForeign(read as RunArchive)).toBe(false)
  })

  it('readArchive ignores an unrecognized origin value, staying internal', () => {
    const weird = { version: 1, brief: 'x', events: events(), origin: 'bogus' }
    const read = readArchive(weird)
    expect(read?.origin).toBeUndefined()
  })
})
