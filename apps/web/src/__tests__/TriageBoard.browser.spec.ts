/**
 * The daily triage reads as a list of repositories (owner, 17 November 2026):
 * each row says its repository and verdict, opens on the items with their
 * links, and a failed agent says why. The banner leads to the gate.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import TriageBoard from '../components/TriageBoard.vue'
import type { RunNode, RunReadModel } from '../run/readModel'
import '../assets/main.css'

const base = { reasoning: { started: 0, settled: 0 }, startedAt: 0 }

function judge(id: string, repo: string, extra: Partial<RunNode>): RunNode {
  return { ...base, id, name: 'judge', state: 'finished', finishedAt: 12.4, task: repo, ...extra }
}

const MODEL: RunReadModel = {
  status: 'waiting',
  at: 40,
  events: 20,
  edges: [],
  gate: {
    checklist: true,
    notice: '',
    actions: [
      { kind: 'external_write', target: 'github/triage', justification: '', preview: '{}' },
    ],
  },
  nodes: [
    {
      ...base,
      id: 't1',
      name: 'pretriage',
      state: 'finished',
      triage: { read: 12, counts: { close: 0, keep: 2, judge: 10 }, items: [] },
    },
    judge('t2', 'memolabs-dev/drop', {
      triage: { repo: 'memolabs-dev/drop', counts: { close: 0, keep: 3, nudge: 0 }, items: [] },
    }),
    judge('t3', 'memolabs-dev/memo-bridge', {
      triage: {
        repo: 'memolabs-dev/memo-bridge',
        counts: { close: 1, keep: 0, nudge: 1 },
        items: [
          {
            number: 280,
            kind: 'issue',
            title: 'Intent-first ChatGPT facade',
            url: 'https://github.com/memolabs-dev/memo-bridge/issues/280',
            decision: 'close',
            motif: 'resolu',
            proof: 'https://github.com/memolabs-dev/memo-bridge/pull/286',
            comment: 'Résolu par la PR #286 fusionnée.',
          },
          {
            number: 311,
            kind: 'pr',
            title: 'Prête, à relire',
            url: 'https://github.com/memolabs-dev/memo-bridge/pull/311',
            decision: 'nudge',
            comment: 'Quelqu’un doit la relire.',
          },
        ],
      },
    }),
    judge('t4', 'memolabs-dev/navirox', {
      state: 'failed',
      failure: 'Le modèle est saturé pour le moment (429).',
      triage: { repo: 'memolabs-dev/navirox', counts: { close: 0, keep: 4, nudge: 0 }, items: [] },
    }),
  ],
}

async function mount() {
  let opened = 0
  await render(TriageBoard, {
    props: { model: MODEL, onDecide: () => (opened += 1) } as never,
    global: { plugins: [ui] },
  })
  return () => opened
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-triage-repo]')]

describe('TriageBoard', () => {
  it('names every repository with its verdict, those with proposals first', async () => {
    await mount()
    await expect.poll(() => rows().length).toBe(3)
    expect(rows().map((r) => r.dataset.triageRepo)).toEqual([
      'memolabs-dev/memo-bridge',
      'memolabs-dev/navirox',
      'memolabs-dev/drop',
    ])
    expect(rows()[0]!.querySelector('summary')!.textContent).toContain('1 à fermer · 1 à relancer')
    expect(document.querySelector('[data-triage-intro]')!.textContent).toContain('12 éléments lus')
  })

  it('opens a repository on its items, with their links and the exact comment', async () => {
    await mount()
    const first = rows()[0]!
    await userEvent.click(first.querySelector('summary')!)
    expect(first.querySelector('details')!.open).toBe(true)
    const item = first.querySelector('[data-triage-item]')!
    expect(item.querySelector('a[href$="/issues/280"]')).not.toBeNull()
    expect(item.querySelector('a[href$="/pull/286"]')?.textContent).toBe('preuve')
    expect(item.textContent).toContain('Résolu par la PR #286 fusionnée.')
  })

  it('says why an agent failed', async () => {
    await mount()
    const failed = rows()[1]!
    await userEvent.click(failed.querySelector('summary')!)
    expect(failed.querySelector('[data-triage-why]')!.textContent).toContain('saturé')
    expect(document.querySelector('[data-triage-failed]')!.textContent).toContain(
      '1 agent n’a pas abouti',
    )
  })

  it('leads to the gate from the banner', async () => {
    const opened = await mount()
    expect(document.querySelector('[data-triage-banner]')!.textContent).toContain(
      '1 proposition attend votre accord',
    )
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-triage-open-gate]')!)
    expect(opened()).toBe(1)
  })
})
