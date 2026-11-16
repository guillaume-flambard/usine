/**
 * A ticket proposal reads as a ticket in the gate, not as escaped JSON; the
 * exact arguments stay one click away (review, 16 November 2026).
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import GatePanel from '../components/GatePanel.vue'
import '../assets/main.css'

describe('GatePanel', () => {
  it('shows a proposed issue as its title and body, with the exact arguments kept', async () => {
    const preview = JSON.stringify({
      title: 'Production bloquée',
      body: '## Problème\n\nLe build attend.',
    })
    await render(GatePanel, {
      props: {
        gate: {
          actions: [
            {
              kind: 'external_write',
              target: 'github/issue_write',
              justification: 'github/issue_write sur o/r : « Production bloquée »',
              preview,
            },
          ],
          notice: '',
        },
      },
      global: { plugins: [ui] },
    })
    await expect
      .poll(() => document.querySelector('[data-gate-ticket]')?.textContent ?? '')
      .toContain('Le build attend.')
    expect(document.querySelector('[data-gate-ticket] h4')?.textContent).toBe('Production bloquée')
    // The exact JSON is still there, folded.
    expect(document.querySelector('details [data-gate-preview]')?.textContent).toBe(preview)
  })
})
