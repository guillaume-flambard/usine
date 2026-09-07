// The living application, in a real browser: when the run posted no screen, it
// must say so honestly rather than show a large blank frame that implies a
// working product (change atelier-redesign, scene-legibility).
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import LiveApplication from '../LiveApplication.vue'
import { createSession } from '../../app/session'
import '../../assets/main.css'
import '../../assets/tokens.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function mountWith(markup: string) {
  return render(LiveApplication, {
    props: {
      behaviours: [],
      screen: { markup, revision: 1 },
      session: createSession(),
      pulse: 0,
      contact: 'x@y.z',
      archive: false,
      replay: false,
      sharing: false,
      forkable: false,
    },
  })
}

describe('the living application, empty', () => {
  it('says nothing was posted instead of showing a blank frame', async () => {
    mountWith('   ')
    await wait(60)
    const note = document.querySelector('.live-empty')
    expect(note, 'the honest empty state is missing').not.toBeNull()
    expect(note?.textContent ?? '').toContain("n'a encore rien posé")
    // The frame stays in the DOM (the host depends on it) but is not shown.
    const frame = document.querySelector<HTMLIFrameElement>('.live-frame')
    expect(frame).not.toBeNull()
    expect(getComputedStyle(frame!).display).toBe('none')
  })

  it('shows the frame and no empty note once a screen is posted', async () => {
    mountWith('<p>bonjour</p>')
    await wait(60)
    expect(document.querySelector('.live-empty')).toBeNull()
    const frame = document.querySelector<HTMLIFrameElement>('.live-frame')
    expect(frame).not.toBeNull()
    expect(getComputedStyle(frame!).display).not.toBe('none')
  })
})
