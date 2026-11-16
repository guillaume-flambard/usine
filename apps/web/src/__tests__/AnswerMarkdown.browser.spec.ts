/**
 * An assistant answer is Markdown, written by a model: rendered, never trusted.
 */
import { defineComponent, h, Suspense } from 'vue'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import ui from '@nuxt/ui/vue-plugin'
import AnswerMarkdown from '../components/AnswerMarkdown'
import { createAppRouter } from '../router'
import '../assets/main.css'

async function show(value: string) {
  // Comark parses in an async setup: ChatPanel wraps it in Suspense too.
  const host = defineComponent({
    render: () =>
      h('div', { 'data-host': '' }, [h(Suspense, null, () => h(AnswerMarkdown, { value }))]),
  })
  await render(host, { global: { plugins: [createAppRouter(), ui] } })
  const root = () => document.querySelector('[data-host]') as HTMLElement
  await expect.poll(() => root()?.textContent?.length ?? 0).toBeGreaterThan(0)
  return root()
}

describe('AnswerMarkdown', () => {
  it('renders headings, emphasis and lists instead of raw marks', async () => {
    const root = await show('## Diagnostic\n\nLe build est **arrêté**.\n\n- un\n- deux')
    expect(root.querySelector('h2')?.textContent).toContain('Diagnostic')
    expect(root.querySelector('strong')?.textContent).toBe('arrêté')
    expect(root.querySelectorAll('li')).toHaveLength(2)
    expect(root.textContent).not.toContain('##')
    expect(root.textContent).not.toContain('**')
  })

  it('never runs what a model writes', async () => {
    ;(window as unknown as { pwned?: boolean }).pwned = false
    const root = await show(
      [
        '<img src="x" onerror="window.pwned = true">',
        '',
        '[clique](javascript:window.pwned=true)',
        '',
        '<script>window.pwned = true</script>',
      ].join('\n'),
    )
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect((window as unknown as { pwned?: boolean }).pwned).toBe(false)
    expect(root.querySelector('script:not([src])')?.textContent ?? '').not.toContain('pwned')
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name.startsWith('on')).toBe(false)
        expect(attribute.value.trim().toLowerCase().startsWith('javascript:')).toBe(false)
      }
    }
  })
})
