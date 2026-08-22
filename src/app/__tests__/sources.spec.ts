// Brancher un comportement sur une source.
//
// Ce que ces tests protègent : le navigateur ne joint jamais une source
// directement, et une source en panne ne fait pas taire un créneau.
import { describe, expect, it, vi } from 'vitest'
import { availableSources, serviceFetcher, wiredInput } from '../sources'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('aller chercher par le service', () => {
  it('passe par notre origine, avec le nom et jamais une adresse', async () => {
    const seen: { url: string; body: unknown }[] = []
    const call = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return response({ body: '{"taux":1.09}', truncated: false })
    })

    const fetcher = serviceFetcher('/api/sources', call as unknown as typeof fetch)
    await expect(fetcher('exchange-rates', 'EUR')).resolves.toEqual({
      body: '{"taux":1.09}',
      truncated: false,
    })
    expect(seen[0]?.url).toBe('/api/sources/exchange-rates')
    expect(seen[0]?.body).toEqual({ query: 'EUR' })
  })

  it('lève avec la raison du service quand il refuse', async () => {
    const call = vi.fn(async () => response({ error: 'source inconnue : ailleurs' }, 400))

    await expect(
      serviceFetcher('/api/sources', call as unknown as typeof fetch)('ailleurs', 'x'),
    ).rejects.toThrow('source inconnue')
  })
})

describe('le catalogue', () => {
  it('ne retient que des entrées complètes', async () => {
    const call = vi.fn(async () =>
      response({ sources: [{ name: 'a', description: 'une source' }, { name: 'b' }, 'c'] }),
    )

    await expect(availableSources('/api/sources', call as unknown as typeof fetch)).resolves.toEqual([
      { name: 'a', description: 'une source' },
    ])
  })

  it('rend une liste vide plutôt que de lever quand le service est absent', async () => {
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })

    await expect(availableSources('/api/sources', down as unknown as typeof fetch)).resolves.toEqual(
      [],
    )
  })
})

describe('l’entrée d’un comportement branché', () => {
  it('porte l’entrée du visiteur et la donnée allée chercher', async () => {
    const payload = JSON.parse(
      await wiredInput('exchange-rates', 'EUR', async () => ({
        body: '{"taux":1.09}',
        truncated: false,
      })),
    ) as { entree: string; donnees: string }

    expect(payload.entree).toBe('EUR')
    expect(payload.donnees).toBe('{"taux":1.09}')
  })

  it('porte la panne plutôt que de faire taire le créneau', async () => {
    // Un créneau vide serait pire qu'un message imparfait : le visiteur ne
    // saurait pas si l'application est cassée ou si la source est absente.
    const payload = JSON.parse(
      await wiredInput('exchange-rates', 'EUR', async () => {
        throw new Error('la source exchange-rates a répondu 503')
      }),
    ) as { entree: string; donnees: string; panne?: string }

    expect(payload.entree).toBe('EUR')
    expect(payload.donnees).toBe('')
    expect(payload.panne).toContain('503')
  })
})
