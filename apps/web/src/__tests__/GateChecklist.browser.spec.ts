/**
 * The checklist gate of the daily triage (ADR 0003, point 6): every proposal
 * checked by default, the person unchecks what stays open, one button approves
 * the selection. A gate without `checklist` keeps the classic screen.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import ui from '@nuxt/ui/vue-plugin'
import GatePanel from '../components/GatePanel.vue'
import type { GateDecisionInput } from '../components/GatePanel.vue'
import '../assets/main.css'

function proposal(number: number, motif: string) {
  const url = `https://github.com/memolabs-dev/usine/issues/${number}`
  return {
    kind: 'external_write',
    target: 'github/triage',
    justification: `memolabs-dev/usine#${number} « Issue ${number} » : ${motif}`,
    preview: JSON.stringify({
      repo: 'memolabs-dev/usine',
      number,
      kind: 'issue',
      title: `Issue ${number}`,
      url,
      motif,
      proof: 'https://github.com/memolabs-dev/usine/pull/52',
      comment: `Fermée par le tri quotidien de l'usine (${number}).`,
      state_reason: 'completed',
    }),
  }
}

const GATE = {
  actions: [proposal(1, 'resolu'), proposal(2, 'doublon'), proposal(3, 'abandonne')],
  notice: '',
  checklist: true,
}

async function mount(gate: object) {
  const decided: GateDecisionInput[] = []
  await render(GatePanel, {
    props: { gate, onDecide: (d: GateDecisionInput) => decided.push(d) } as never,
    global: { plugins: [ui] },
  })
  return decided
}

const approve = () => document.querySelector<HTMLButtonElement>('[data-gate-approve]')!
const boxes = () => [...document.querySelectorAll<HTMLInputElement>('[data-gate-check]')]

describe('GatePanel as a checklist', () => {
  it('checks every action by default and counts them', async () => {
    await mount(GATE)
    await expect.poll(() => boxes().length).toBe(3)
    expect(boxes().every((box) => box.checked)).toBe(true)
    expect(approve().textContent).toContain('Approuver la sélection (3)')
    // What will be published is on screen, word for word, with its proof.
    const row = document.querySelector('[data-gate-item]')!
    expect(row.textContent).toContain("Fermée par le tri quotidien de l'usine (1).")
    expect(row.querySelector('a[href$="/pull/52"]')).not.toBeNull()
    expect(row.querySelector('a[href$="/issues/1"]')?.textContent).toContain('memolabs-dev/usine#1')
  })

  it('emits only the checked indices', async () => {
    const decided = await mount(GATE)
    await userEvent.click(boxes()[1]!)
    expect(approve().textContent).toContain('Approuver la sélection (2)')
    await userEvent.click(approve())
    expect(decided).toEqual([{ decision: 'approve', selected: [0, 2] }])
  })

  it('disables approve when nothing is checked', async () => {
    await mount(GATE)
    for (const box of boxes()) await userEvent.click(box)
    expect(approve().disabled).toBe(true)
  })

  it('rejects everything with a reason', async () => {
    const decided = await mount(GATE)
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-gate-reject]')!)
    await userEvent.fill(
      document.querySelector<HTMLTextAreaElement>('[data-gate-reason]')!,
      'demain',
    )
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-gate-confirm-reject]')!)
    expect(decided).toEqual([{ decision: 'reject', reason: 'demain' }])
  })

  it('keeps the classic gate when checklist is absent', async () => {
    await mount({ ...GATE, checklist: undefined })
    expect(boxes()).toHaveLength(0)
    expect(document.querySelector('[data-gate-edit]')).not.toBeNull()
    expect(approve().textContent).toContain('Approuver')
  })
})
