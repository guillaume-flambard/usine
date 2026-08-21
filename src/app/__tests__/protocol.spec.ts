import { describe, expect, it } from 'vitest'
import { MAX_INPUT, readFromFrame, readToFrame } from '../protocol'

describe('reading a message from the frame', () => {
  it('rebuilds a call, bounding the input', () => {
    const message = readFromFrame({
      type: 'call-requested',
      call: 3,
      name: 'count-syllables',
      input: 'x'.repeat(MAX_INPUT + 500),
      extra: 'ignoré',
    })

    expect(message).toEqual({
      type: 'call-requested',
      call: 3,
      name: 'count-syllables',
      input: 'x'.repeat(MAX_INPUT),
    })
  })

  it('refuses a call with no name rather than inventing one', () => {
    expect(readFromFrame({ type: 'call-requested', call: 1, name: '', input: 'a' })).toBeUndefined()
  })

  it('refuses a call number that is not a whole count', () => {
    expect(readFromFrame({ type: 'call-requested', call: -1, name: 'a', input: '' })).toBeUndefined()
    expect(readFromFrame({ type: 'call-requested', call: 1.5, name: 'a', input: '' })).toBeUndefined()
  })

  it('takes a mounted screen and keeps what it declares', () => {
    expect(
      readFromFrame({
        type: 'screen-mounted',
        revision: 2,
        slots: ['compter', 42, 'trier'],
        refused: ['<script>'],
      }),
    ).toEqual({
      type: 'screen-mounted',
      revision: 2,
      slots: ['compter', 'trier'],
      refused: ['<script>'],
    })
  })

  it('says nothing about a message it does not know', () => {
    expect(readFromFrame({ type: 'navigate', to: 'https://ailleurs' })).toBeUndefined()
    expect(readFromFrame('frame-ready')).toBeUndefined()
    expect(readFromFrame(null)).toBeUndefined()
  })
})

describe('reading a message sent to the frame', () => {
  it('rebuilds a screen', () => {
    expect(readToFrame({ type: 'mount-screen', markup: '<p>a</p>', revision: 1 })).toEqual({
      type: 'mount-screen',
      markup: '<p>a</p>',
      revision: 1,
    })
  })

  it('drops a slot with no version: an unversioned slot is not live', () => {
    expect(
      readToFrame({
        type: 'slots-changed',
        live: [{ name: 'compter', version: 2 }, { name: 'trier' }, 'trier'],
      }),
    ).toEqual({ type: 'slots-changed', live: [{ name: 'compter', version: 2 }] })
  })

  it('carries a failure and an answer apart, never merged', () => {
    expect(readToFrame({ type: 'call-settled', call: 1, failure: 'arrêté' })).toEqual({
      type: 'call-settled',
      call: 1,
      failure: 'arrêté',
    })
    expect(readToFrame({ type: 'call-settled', call: 1, output: '3', version: 2 })).toEqual({
      type: 'call-settled',
      call: 1,
      output: '3',
      version: 2,
    })
  })

  it('refuses a settlement that names no call', () => {
    expect(readToFrame({ type: 'call-settled', output: '3' })).toBeUndefined()
  })
})
