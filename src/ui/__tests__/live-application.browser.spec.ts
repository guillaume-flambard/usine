// The living application, in a real browser: when the run posted no screen, it
// must say so honestly rather than show a large blank frame that implies a
// working product (change atelier-redesign, scene-legibility).
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import LiveApplication from '../LiveApplication.vue'
import { createSession } from '../../app/session'
import '../../assets/main.css'
import '../../assets/app.css'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Chaque montage laisse son cadre et son écouteur : sans ça le suivant trouve
// celui du précédent et les assertions parlent du mauvais écran.
let mounted: { unmount: () => void } | undefined
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
})

function mountWith(markup: string) {
  mounted = render(LiveApplication, {
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
  return mounted
}

describe('the living application, empty', () => {
  it('says nothing was posted instead of showing a blank frame', async () => {
    mountWith('   ')
    await wait(60)
    const note = document.querySelector('[data-live-empty]')
    expect(note, 'the honest empty state is missing').not.toBeNull()
    expect(note?.textContent ?? '').toContain("n'a encore rien posé")
    // The frame stays in the DOM (the host depends on it) but is not shown.
    const frame = document.querySelector<HTMLIFrameElement>('[data-live-frame]')
    expect(frame).not.toBeNull()
    expect(getComputedStyle(frame!).display).toBe('none')
  })

  it('shows the frame and no empty note once a screen is posted', async () => {
    mountWith('<p>bonjour</p>')
    await wait(60)
    expect(document.querySelector('[data-live-empty]')).toBeNull()
    const frame = document.querySelector<HTMLIFrameElement>('[data-live-frame]')
    expect(frame).not.toBeNull()
    expect(getComputedStyle(frame!).display).not.toBe('none')
  })
})

// Le cadre est une iframe sablée servie par nous. Un bloqueur de contenu, une
// politique de navigateur ou un script en échec suffisent à ce qu'elle ne se
// charge jamais — mesuré le 2026-09-07, `net::ERR_BLOCKED_BY_CLIENT`. Sans
// état nommé, l'écran montrait alors un grand rectangle vide, indistinct d'une
// application qui marche.
describe('the living application, when the frame never answers', () => {
  it('names the failure instead of showing a blank frame', async () => {
    mountWith('<p>bonjour</p>')

    // Avant le délai de grâce, on ne dit rien : le cadre a le droit d'être lent.
    await wait(120)
    expect(document.querySelector('[data-frame-silent]')).toBeNull()

    // Le cadre réel s'annonce en quelques dizaines de millisecondes ; celui-ci
    // est neutralisé pour tenir le cas où il ne s'annonce jamais.
    const frame = document.querySelector<HTMLIFrameElement>('[data-live-frame]')
    expect(frame).not.toBeNull()
    frame!.src = 'about:blank'

    await wait(4600)
    const note = document.querySelector('[data-frame-silent]')
    expect(note, "l'état du cadre muet est manquant").not.toBeNull()
    expect(note?.textContent ?? '').toContain("ne s'est pas chargé")
    // Et il dit quoi faire, plutôt que de constater.
    expect(note?.textContent ?? '').toContain('autre fenêtre')
    // Le cadre reste monté — le host en dépend — mais il n'est plus montré.
    expect(getComputedStyle(frame!).display).toBe('none')
  }, 15_000)

  // La moitié qui empêche cet état d'accuser un échec qui n'a pas eu lieu — un
  // cadre qui s'annonce doit l'éteindre — se vérifie sur le host plutôt qu'ici :
  // mesuré le 2026-09-07, le cadre sablé ne s'annonce jamais sous vitest, aucun
  // message n'atteint le host. Voir `frame-host.browser.spec.ts`.
})
