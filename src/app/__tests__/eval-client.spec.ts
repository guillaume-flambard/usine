import { describe, expect, it, vi } from 'vitest'
import { fetchEvaluation, formatEvaluation, type Evaluation } from '../eval-client'

const REPORT: Evaluation = {
  runs: 12,
  servedRatio: 0.833,
  replacedRatio: 0.5,
  medianFirstScreenRank: 7,
  meanTokens: 4210.5,
  meanAgents: 3.25,
  totalRollbacks: 2,
  totalMalformed: 1,
}

const EMPTY: Evaluation = {
  runs: 0,
  servedRatio: 0,
  replacedRatio: 0,
  medianFirstScreenRank: null,
  meanTokens: 0,
  meanAgents: 0,
  totalRollbacks: 0,
  totalMalformed: 0,
}

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('reading the evaluation report', () => {
  it('parses a well-formed report and probes the default endpoint', async () => {
    const seen: string[] = []
    // No explicit endpoint: the default one must be the one hit.
    const call = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return response(REPORT)
    }) as unknown as typeof fetch

    const report = await fetchEvaluation(undefined, call)

    expect(report).toEqual(REPORT)
    expect(seen[0]).toBe('/api/evaluation')
  })

  it('accepts a report with no runs, medianFirstScreenRank null included', async () => {
    const call = vi.fn(async () => response(EMPTY)) as unknown as typeof fetch
    await expect(fetchEvaluation('/api/evaluation', call)).resolves.toEqual(EMPTY)
  })

  it('rejects a report with any required field missing, rather than guessing', async () => {
    // Every required field, dropped in turn, must sink the whole report.
    for (const field of Object.keys(REPORT) as (keyof Evaluation)[]) {
      const { [field]: _omitted, ...missing } = REPORT
      const call = vi.fn(async () => response(missing)) as unknown as typeof fetch
      await expect(fetchEvaluation('/api/evaluation', call)).resolves.toBeUndefined()
    }
  })

  it('rejects a field of the wrong type', async () => {
    const call = vi.fn(async () => response({ ...REPORT, servedRatio: 'x' })) as unknown as typeof fetch
    await expect(fetchEvaluation('/api/evaluation', call)).resolves.toBeUndefined()
  })

  it('rejects a medianFirstScreenRank that is neither a number nor null', async () => {
    const call = vi.fn(async () =>
      response({ ...REPORT, medianFirstScreenRank: 'sept' }),
    ) as unknown as typeof fetch
    await expect(fetchEvaluation('/api/evaluation', call)).resolves.toBeUndefined()
  })

  it('rejects a ratio outside [0,1] rather than reporting it as a percentage', async () => {
    const tooHigh = vi.fn(async () => response({ ...REPORT, servedRatio: 1.5 })) as unknown as typeof fetch
    const negative = vi.fn(async () =>
      response({ ...REPORT, replacedRatio: -0.2 }),
    ) as unknown as typeof fetch
    await expect(fetchEvaluation('/api/evaluation', tooHigh)).resolves.toBeUndefined()
    await expect(fetchEvaluation('/api/evaluation', negative)).resolves.toBeUndefined()
  })

  it('rejects a negative run count', async () => {
    const call = vi.fn(async () => response({ ...REPORT, runs: -3 })) as unknown as typeof fetch
    await expect(fetchEvaluation('/api/evaluation', call)).resolves.toBeUndefined()
  })

  it('returns undefined when the service refuses or falls over', async () => {
    // An absent or erroring service must not take the page down with it.
    const down = vi.fn(async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch
    const error = vi.fn(async () => response({ error: 'boom' }, 500)) as unknown as typeof fetch

    await expect(fetchEvaluation('/api/evaluation', down)).resolves.toBeUndefined()
    await expect(fetchEvaluation('/api/evaluation', error)).resolves.toBeUndefined()
  })
})

describe('formatting the measurement line', () => {
  it('shows nothing when there is no report or no kept run', () => {
    // The honesty rule: nothing on screen without a real measure behind it.
    expect(formatEvaluation(undefined)).toBeUndefined()
    expect(formatEvaluation(EMPTY)).toBeUndefined()
  })

  it('scales ratios to whole percentages and rounds the token mean', () => {
    const line = formatEvaluation(REPORT)
    expect(line).toBeDefined()
    expect(line).toContain('12 runs')
    expect(line).toContain('83% servent une app') // 0.833 -> 83
    expect(line).toContain('50% avec remplacement à chaud')
    expect(line).toContain('rang médian du 1er écran 7')
    expect(line).toContain('4211 tokens moyens') // 4210.5 -> 4211
  })

  it('falls back to a dash when no first-screen rank exists', () => {
    const line = formatEvaluation({ ...REPORT, medianFirstScreenRank: null })
    expect(line).toContain('rang médian du 1er écran —')
  })
})
