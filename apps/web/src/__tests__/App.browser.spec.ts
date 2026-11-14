import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import '../assets/main.css'

describe('App shell', () => {
  it('renders the brand, the status line, the conversation and the composer', async () => {
    const screen = render(App, { global: { plugins: [createAppRouter(), ui] } })

    await expect
      .element(screen.getByRole('heading', { level: 1, name: "L'usine agentique" }))
      .toBeVisible()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Prêt')
    await expect.element(screen.getByRole('region', { name: 'Conversation' })).toBeVisible()
    expect(document.querySelector('[data-composer] textarea')).not.toBeNull()
    // Four zones and not one more (CLAUDE.md). The scene is the fourth, and
    // it appears with the first run event (ChatPanel.browser.spec.ts).
    expect(document.querySelector('[data-scene]')).toBeNull()
  })
})
