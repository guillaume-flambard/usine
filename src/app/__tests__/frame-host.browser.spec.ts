// Le host, sans cadre réel.
//
// Le cadre sablé a une origine opaque et ne s'annonce pas sous vitest : aucun
// message n'y atteint le host. Ce qui doit être garanti — que le host dise
// quand le cadre s'est annoncé, et qu'il ne pousse rien avant — se vérifie donc
// ici, avec un correspondant simulé.
//
// Ce que ça protège : l'écran nomme un cadre resté muet. Sans cette annonce,
// il ne pourrait pas distinguer « pas encore monté » de « ne répondra jamais »,
// et montrerait un rectangle vide à la place d'un échec nommé.
import { describe, expect, it, vi } from 'vitest'
import { createFrameHost } from '../frame-host'
import { createSession } from '../session'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Un cadre dont le `contentWindow` est la fenêtre courante : le host n'écoute
 * que son cadre, et c'est ce filtre qu'il faut satisfaire pour lui parler.
 */
function fakeFrame(posted: unknown[]): HTMLIFrameElement {
  return {
    contentWindow: {
      postMessage: (message: unknown) => posted.push(message),
    },
  } as unknown as HTMLIFrameElement
}

function hostWith(markup: string) {
  const posted: unknown[] = []
  const onReady = vi.fn()
  const frame = fakeFrame(posted)
  // Le filtre du host compare `event.source` au `contentWindow` du cadre : pour
  // qu'un message posté sur cette fenêtre passe, c'est elle le correspondant.
  Object.defineProperty(frame, 'contentWindow', {
    value: Object.assign(window, { postMessage: window.postMessage.bind(window) }),
    configurable: true,
  })
  const host = createFrameHost({
    frame,
    behaviours: () => [],
    screen: () => ({ markup, revision: 1 }),
    session: createSession(),
    onReady,
  })
  return { host, onReady }
}

describe('le host du cadre', () => {
  it("dit quand le cadre s'annonce", async () => {
    const { host, onReady } = hostWith('<p>bonjour</p>')

    // Rien tant que le cadre n'a rien dit : c'est exactement l'état que l'écran
    // doit pouvoir nommer.
    expect(onReady).not.toHaveBeenCalled()

    window.postMessage({ type: 'frame-ready' }, '*')
    await wait(50)

    expect(onReady).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it("n'annonce plus rien une fois défait", async () => {
    const { host, onReady } = hostWith('<p>bonjour</p>')
    host.dispose()

    window.postMessage({ type: 'frame-ready' }, '*')
    await wait(50)

    expect(onReady).not.toHaveBeenCalled()
  })
})
