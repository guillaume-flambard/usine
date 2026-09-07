// The inspector used to be an absolutely positioned aside with a hand-rolled
// z-index and no dialog contract: no role, no focus trap, nothing inert behind
// it, and an Escape handler bolted onto the window by the shell. These
// assertions hold the contract now that it is a real dialog.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import NodePanel from '../NodePanel.vue'
import type { NodeView } from '../../state/model'
import '../../assets/main.css'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let mounted: { unmount: () => void } | undefined
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

const node = {
  id: 'counter' as NodeView['id'],
  name: 'counter',
  display: { label: 'COMPTEUR', role: 'Compte les gestes du visiteur', technology: '' },
  needs: ['storage'],
  provides: ['count'],
  state: 'working',
  appearedAt: 1,
} as unknown as NodeView

function mount() {
  let closed = 0
  mounted = render(NodePanel, {
    props: { node, messages: [], onClose: () => (closed += 1) },
  })
  return () => closed
}

describe('the node inspector', () => {
  it('is a dialog, not a floating aside', async () => {
    mount()
    await wait(120)
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('COMPTEUR')
  })

  it('closes on Escape without the shell listening for keys', async () => {
    const closed = mount()
    await wait(120)
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await wait(120)
    expect(closed()).toBe(1)
  })

  it('takes the focus when it opens', async () => {
    mount()
    await wait(160)
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.contains(document.activeElement)).toBe(true)
  })
})
