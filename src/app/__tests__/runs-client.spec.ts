import { describe, expect, it, vi } from 'vitest'
import { exportUrl, listRuns, purgeRun, restoreRun, trashRun } from '../runs-client'

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('listRuns', () => {
  it('returns the summaries the service lists', async () => {
    const call = vi.fn(async () => response({ runs: [{ id: 'a', brief: 'x', events: 3, shared: false }] }))
    const runs = await listRuns(false, '/api/runs', call as never)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('a')
  })

  it('asks for the trash when requested', async () => {
    const seen: string[] = []
    const call = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return response({ runs: [] })
    })
    await listRuns(true, '/api/runs', call as never)
    expect(seen[0]).toBe('/api/runs?trashed=1')
  })

  it('returns an empty list rather than throwing on error', async () => {
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(listRuns(false, '/api/runs', down)).resolves.toEqual([])
  })
})

describe('lifecycle actions', () => {
  it('trash sends a DELETE and reports success', async () => {
    const seen: { url: string; method?: string }[] = []
    const call = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method })
      return response({ trashed: true })
    })
    await expect(trashRun('a', '/api/runs', call as never)).resolves.toBe(true)
    expect(seen[0]).toEqual({ url: '/api/runs/a', method: 'DELETE' })
  })

  it('restore and purge POST to their endpoints', async () => {
    const seen: string[] = []
    const call = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return response({})
    })
    await restoreRun('a', '/api/runs', call as never)
    await purgeRun('a', '/api/runs', call as never)
    expect(seen).toEqual(['/api/runs/a/restore', '/api/runs/a/purge'])
  })

  it('reports failure rather than throwing', async () => {
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(trashRun('a', '/api/runs', down)).resolves.toBe(false)
  })
})

describe('exportUrl', () => {
  it('points at the run export endpoint', () => {
    expect(exportUrl('a b', '/api/runs')).toBe('/api/runs/a%20b/export')
  })
})
