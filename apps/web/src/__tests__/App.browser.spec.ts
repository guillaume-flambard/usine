import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import App from '../App.vue'
import { createAppRouter } from '../router'
import '../assets/main.css'

describe('App shell', () => {
  it('renders the brand, the status line and every stack layer', async () => {
    const screen = render(App, { global: { plugins: [createAppRouter(), ui] } })

    await expect
      .element(screen.getByRole('heading', { level: 1, name: "L'usine agentique" }))
      .toBeVisible()
    await expect.element(screen.getByText('Version 2 en construction, branche v2.')).toBeVisible()

    const layers = document.querySelectorAll('[data-stack] [data-layer]')
    expect(layers.length).toBe(10)
  })
})
