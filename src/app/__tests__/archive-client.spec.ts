import { describe, expect, it, vi } from 'vitest'
import { fetchRun, linkFor, requestedRun, storeRun } from '../archive-client'
import { ARCHIVE_VERSION, type RunArchive } from '../replay'

const ARCHIVE: RunArchive = {
  version: ARCHIVE_VERSION,
  brief: 'un besoin',
  events: [{ type: 'work-finished', sequence: 1, id: 'a#1' } as never],
}

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('conserver un run', () => {
  it('rend l’identifiant que le service a choisi', async () => {
    const seen: string[] = []
    const call = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return response({ id: 'abc123xyz' }, 201)
    })

    await expect(storeRun(ARCHIVE, '/api/runs', call as unknown as typeof fetch)).resolves.toBe(
      'abc123xyz',
    )
    expect(seen[0]).toBe('/api/runs')
  })

  it('rend undefined plutôt que de lever quand le service refuse', async () => {
    // Un partage qui échoue ne doit pas emporter la page d’un visiteur qui a
    // déjà son run sous les yeux.
    const refused = vi.fn(async () => response({ error: 'trop gros' }, 413))
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })

    await expect(storeRun(ARCHIVE, '/api/runs', refused)).resolves.toBeUndefined()
    await expect(storeRun(ARCHIVE, '/api/runs', down)).resolves.toBeUndefined()
  })
})

describe('relire un run', () => {
  it('relit ce que le service rend', async () => {
    const seen: string[] = []
    const call = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return response(ARCHIVE)
    })

    const back = await fetchRun('abc123xyz', '/api/runs', call as unknown as typeof fetch)

    expect(back?.events).toHaveLength(1)
    expect(seen[0]).toBe('/api/runs/abc123xyz')
  })

  it('refuse ce qu’il ne comprend pas, même venu du service', async () => {
    // Ce qui revient du réseau est une donnée hostile comme une autre.
    const wrong = vi.fn(async () => response({ version: 99, events: [] }))

    await expect(fetchRun('a', '/api/runs', wrong)).resolves.toBeUndefined()
  })

  it('rend undefined sur un run inconnu', async () => {
    const missing = vi.fn(async () => response({ error: 'run inconnu' }, 404))

    await expect(fetchRun('a', '/api/runs', missing)).resolves.toBeUndefined()
  })
})

describe('l’identifiant dans l’adresse', () => {
  it('ne retient qu’un identifiant qui a la forme d’un identifiant', () => {
    expect(requestedRun('?run=abc123xyz')).toBe('abc123xyz')
    expect(requestedRun('?run=../../etc/passwd')).toBeUndefined()
    expect(requestedRun('?run=court')).toBeUndefined()
    expect(requestedRun('')).toBeUndefined()
  })

  it('construit un lien qui ne traîne pas les paramètres de la page', () => {
    expect(linkFor('abc123xyz', 'https://usine.memolabs.dev/?debug=1')).toBe(
      'https://usine.memolabs.dev/?run=abc123xyz',
    )
  })
})
