import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkSubmitted,
  cookielessTransport,
  gateReached,
  installTelemetry,
  newRun,
  productServed,
  runStarted,
  type Event,
} from '../index'

const log: Event[] = []

afterEach(() => {
  installTelemetry(undefined)
  log.length = 0
})

const connect = () => {
  installTelemetry({ count: (e) => log.push(e) })
}

describe('telemetry', () => {
  it('measures nothing while no transport is installed', () => {
    newRun()
    runStarted()
    gateReached()
    expect(log).toEqual([])
  })

  it('counts exactly the four facts', () => {
    connect()
    runStarted()
    productServed()
    checkSubmitted()
    gateReached()
    expect(log).toEqual(['run-started', 'product-served', 'check-submitted', 'gate-reached'])
  })

  it('does not count the same fact twice within a run', () => {
    connect()
    runStarted()
    checkSubmitted()
    checkSubmitted()
    checkSubmitted()
    expect(log.filter((e) => e === 'check-submitted')).toHaveLength(1)
  })

  it('does not invent an address when the endpoint already carries a query', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        calls.push(String(url))
        return new Response('')
      }),
    )
    installTelemetry(cookielessTransport('/measure?src=lab'))
    runStarted()
    await new Promise<void>((r) => setTimeout(r, 0))

    const address = new URL(calls[0] ?? '')
    expect(address.searchParams.get('src')).toBe('lab')
    expect(address.searchParams.get('e')).toBe('run-started')
    vi.unstubAllGlobals()
  })

  it('counts again on the next run', () => {
    connect()
    runStarted()
    gateReached()
    runStarted()
    gateReached()
    expect(log.filter((e) => e === 'gate-reached')).toHaveLength(2)
  })

  it('sends with no cookie, no body, and never throws', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init])
      throw new Error('réseau coupé')
    })
    vi.stubGlobal('fetch', fake)

    installTelemetry(cookielessTransport('/measure'))
    expect(() => runStarted()).not.toThrow()
    await new Promise<void>((r) => setTimeout(r, 0))

    expect(calls).toHaveLength(1)
    const [url, init] = calls[0] ?? ['', undefined]
    expect(new URL(url).pathname).toBe('/measure')
    expect(new URL(url).searchParams.get('e')).toBe('run-started')
    // No user content can travel: there is no body.
    expect(init?.body).toBeUndefined()
    expect(init?.credentials).toBe('omit')
    vi.unstubAllGlobals()
  })

  it('exposes only four counting functions', async () => {
    const module = await import('../index')
    const counters = Object.keys(module).filter(
      (key) => !['installTelemetry', 'newRun', 'cookielessTransport'].includes(key),
    )
    expect(counters.sort()).toEqual([
      'checkSubmitted',
      'gateReached',
      'productServed',
      'runStarted',
    ])
  })
})
