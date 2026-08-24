import { describe, expect, it } from 'vitest'
import { replayInto, type RunArchive } from '../replay'
import type { RunEvent } from '../../runtime/events'

// A minimal, valid stream: five events, sequences 1..5, ascending. `at` is an
// elapsed duration, never an absolute date (AD-33).
const archive = (): RunArchive => ({
  version: 1,
  brief: 'peu importe',
  events: Array.from(
    { length: 5 },
    (_unused, index): RunEvent => ({
      type: 'subscriber-failed',
      message: `e${index + 1}`,
      sequence: index + 1,
      at: index,
    }),
  ),
})

const sink = () => {
  const seen: number[] = []
  return { seen, emit: (event: RunEvent) => seen.push(event.sequence) }
}

describe('replayInto — bounded replay up to a sequence N', () => {
  it('emits every event, in order, when no stopAt is given (unchanged)', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto(archive(), emit)

    expect(seen).toEqual([1, 2, 3, 4, 5])
    expect(outcome.reachedEnd).toBe(true)
    expect(outcome.lastSequence).toBe(5)
  })

  it('stops after the event whose sequence equals N, keeping order', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto(archive(), emit, { stopAt: 3 })

    // Exactly the events with sequence <= 3, and nothing after.
    expect(seen).toEqual([1, 2, 3])
    expect(outcome.reachedEnd).toBe(false)
    expect(outcome.lastSequence).toBe(3)
  })

  it('emits everything when stopAt is beyond the last sequence', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto(archive(), emit, { stopAt: 99 })

    expect(seen).toEqual([1, 2, 3, 4, 5])
    expect(outcome.reachedEnd).toBe(true)
    expect(outcome.lastSequence).toBe(5)
  })

  it('emits nothing when stopAt is 0 — no event carries sequence 0', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto(archive(), emit, { stopAt: 0 })

    expect(seen).toEqual([])
    expect(outcome.reachedEnd).toBe(false)
    expect(outcome.lastSequence).toBe(0)
  })

  it('is deterministic: two bounded replays to N yield the same emission', async () => {
    const a = sink()
    const b = sink()
    await replayInto(archive(), a.emit, { stopAt: 4 })
    await replayInto(archive(), b.emit, { stopAt: 4 })

    expect(a.seen).toEqual(b.seen)
    expect(a.seen).toEqual([1, 2, 3, 4])
  })

  it('stops before emitting when the signal is already aborted', async () => {
    const { seen, emit } = sink()
    const controller = new AbortController()
    controller.abort()
    const outcome = await replayInto(archive(), emit, { signal: controller.signal })

    expect(seen).toEqual([])
    expect(outcome.reachedEnd).toBe(false)
    expect(outcome.lastSequence).toBe(0)
  })

  it('handles the boundaries: stopAt at the first and at the exact last sequence', async () => {
    const first = sink()
    const outFirst = await replayInto(archive(), first.emit, { stopAt: 1 })
    expect(first.seen).toEqual([1])
    expect(outFirst).toEqual({ reachedEnd: false, lastSequence: 1 })

    // stopAt exactly on the last sequence emits everything and reaches the end.
    const last = sink()
    const outLast = await replayInto(archive(), last.emit, { stopAt: 5 })
    expect(last.seen).toEqual([1, 2, 3, 4, 5])
    expect(outLast).toEqual({ reachedEnd: true, lastSequence: 5 })
  })

  it('emits nothing for an empty stream, and says it reached the end', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto({ version: 1, brief: '', events: [] }, emit)

    expect(seen).toEqual([])
    expect(outcome).toEqual({ reachedEnd: true, lastSequence: 0 })
  })

  it('treats a negative stopAt as before the first event: emits nothing', async () => {
    const { seen, emit } = sink()
    const outcome = await replayInto(archive(), emit, { stopAt: -1 })

    expect(seen).toEqual([])
    expect(outcome).toEqual({ reachedEnd: false, lastSequence: 0 })
  })

  it('stops mid-stream when the signal fires during a paced replay, reporting how far it got', async () => {
    const { seen, emit } = sink()
    const controller = new AbortController()
    // Abort once the third event has been emitted; the paced loop checks the
    // signal at the top of the next iteration.
    const guarded = (event: RunEvent) => {
      emit(event)
      if (event.sequence === 3) controller.abort()
    }
    const outcome = await replayInto(archive(), guarded, { paceMs: 1, signal: controller.signal })

    expect(seen).toEqual([1, 2, 3])
    expect(outcome).toEqual({ reachedEnd: false, lastSequence: 3 })
  })
})
