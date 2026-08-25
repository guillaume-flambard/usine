import { describe, expect, it, vi } from 'vitest'
import { logout, requestLink, sessionStatus } from '../auth-client'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('requestLink', () => {
  it('sends the email and reports success', async () => {
    const seen: { url: string; body: unknown }[] = []
    const call = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return response({ sent: true })
    })
    await expect(requestLink('a@b.co', '/api/auth/request-link', call as never)).resolves.toBe(true)
    expect(seen[0]?.url).toBe('/api/auth/request-link')
    expect(seen[0]?.body).toEqual({ email: 'a@b.co' })
  })

  it('reports failure rather than throwing when the network is down', async () => {
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })
    await expect(requestLink('a@b.co', '/api/auth/request-link', down)).resolves.toBe(false)
  })
})

describe('sessionStatus', () => {
  it('reports the signed-in identity', async () => {
    const call = vi.fn(async () => response({ authenticated: true, email: 'a@b.co', org: 'org1' }))
    await expect(sessionStatus('/api/auth/session', call as never)).resolves.toEqual({
      authenticated: true,
      email: 'a@b.co',
      org: 'org1',
    })
  })

  it('reports signed-out when the service says so', async () => {
    const call = vi.fn(async () => response({ authenticated: false }))
    await expect(sessionStatus('/api/auth/session', call as never)).resolves.toEqual({
      authenticated: false,
    })
  })

  it('reports signed-out rather than throwing on error', async () => {
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    })
    await expect(sessionStatus('/api/auth/session', down)).resolves.toEqual({ authenticated: false })
  })

  it('does not trust a malformed authenticated payload', async () => {
    const call = vi.fn(async () => response({ authenticated: true }))
    await expect(sessionStatus('/api/auth/session', call as never)).resolves.toEqual({
      authenticated: false,
    })
  })
})

describe('logout', () => {
  it('confirms when the service accepts', async () => {
    const call = vi.fn(async () => response({ loggedOut: true }))
    await expect(logout('/api/auth/logout', call as never)).resolves.toBe(true)
  })
})
