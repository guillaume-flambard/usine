import { describe, expect, it, vi } from 'vitest'
import { accountExportUrl, accountSummary, eraseAccount } from '../account-client'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('accountSummary', () => {
  it('returns the held data', async () => {
    const call = vi.fn(async () => response({ email: 'a@b.co', org: 'o1', runs: 2, trashed: 1 }))
    await expect(accountSummary('/api/account', call as never)).resolves.toEqual({
      email: 'a@b.co',
      org: 'o1',
      runs: 2,
      trashed: 1,
    })
  })

  it('returns null when signed out', async () => {
    const call = vi.fn(async () => response({ error: 'connexion requise' }, 401))
    await expect(accountSummary('/api/account', call as never)).resolves.toBeNull()
  })

  it('returns null rather than throwing on error', async () => {
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(accountSummary('/api/account', down)).resolves.toBeNull()
  })
})

describe('eraseAccount', () => {
  it('sends a DELETE and confirms', async () => {
    const seen: { url: string; method?: string }[] = []
    const call = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method })
      return response({ erased: true })
    })
    await expect(eraseAccount('/api/account', call as never)).resolves.toBe(true)
    expect(seen[0]).toEqual({ url: '/api/account', method: 'DELETE' })
  })

  it('reports failure rather than throwing', async () => {
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(eraseAccount('/api/account', down)).resolves.toBe(false)
  })
})

describe('accountExportUrl', () => {
  it('points at the export endpoint', () => {
    expect(accountExportUrl('/api/account')).toBe('/api/account/export')
  })
})
