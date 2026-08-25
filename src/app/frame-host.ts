// The host side of the frame.
//
// It owns nothing the frame owns: the frame holds the screen, the host holds
// the behaviours and the session. Between them, only messages — which is what
// lets a behaviour be replaced without the frame reloading, and lets the frame
// be reposted without the session being lost.

import type { Behaviour } from './behaviour'
import { readFromFrame, type ToFrame } from './protocol'
import type { Interaction, Session } from './session'

export interface FrameHostOptions {
  /** The sandboxed frame. It must already be in the document. */
  frame: HTMLIFrameElement
  /** The behaviours currently serving. Read on every change, never cached. */
  behaviours: () => readonly Behaviour[]
  /** The screen as an agent last posted it. */
  screen: () => { markup: string; revision: number }
  /** Where interactions are recorded. It outlives every replacement. */
  session: Session
  /** Called when the frame reports what it kept and what it refused. */
  onMounted?: (report: { slots: readonly string[]; refused: readonly string[] }) => void
  /** Called after each interaction, so the counter can be repainted. */
  onInteraction?: () => void
  /**
   * Called with each recorded interaction, so it can be carried back to the
   * run as an observation an agent may answer. Distinct from `onInteraction`:
   * that one only asks for a repaint; this one hands out the exchange itself.
   */
  onObservation?: (interaction: Interaction) => void
}

export interface FrameHost {
  /**
   * Pushes whatever changed to the frame: a new screen, a new set of live
   * behaviours, or both. Idempotent — calling it on every run event is the
   * intended use.
   */
  sync(): void
  dispose(): void
}

export function createFrameHost(options: FrameHostOptions): FrameHost {
  let ready = false
  let sentRevision = -1
  let sentSlots = ''
  let disposed = false

  const post = (message: ToFrame): void => {
    if (disposed) return
    options.frame.contentWindow?.postMessage(message, '*')
  }

  const slotSignature = (behaviours: readonly Behaviour[]): string =>
    behaviours
      .map((behaviour) => `${behaviour.name}@${behaviour.version}`)
      .sort()
      .join(',')

  const sync = (): void => {
    if (!ready || disposed) return

    const screen = options.screen()
    if (screen.revision !== sentRevision && screen.markup.length > 0) {
      sentRevision = screen.revision
      // A new screen clears what the frame knew about slots, so the live set
      // is always resent after it — never assume the frame remembers.
      sentSlots = ''
      post({ type: 'mount-screen', markup: screen.markup, revision: screen.revision })
    }

    const behaviours = options.behaviours()
    const signature = slotSignature(behaviours)
    if (signature !== sentSlots) {
      sentSlots = signature
      post({
        type: 'slots-changed',
        live: behaviours.map((behaviour) => ({
          name: behaviour.name,
          version: behaviour.version,
        })),
      })
    }
  }

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (disposed) return
    // Only this frame is heard. Other frames, and the page itself, are not
    // correspondents — and the frame's origin is opaque, so the sender is the
    // only thing worth checking.
    if (event.source !== options.frame.contentWindow) return
    const message = readFromFrame(event.data)
    if (message === undefined) return

    if (message.type === 'frame-ready') {
      ready = true
      sentRevision = -1
      sentSlots = ''
      sync()
      return
    }

    if (message.type === 'screen-mounted') {
      options.onMounted?.({ slots: message.slots, refused: message.refused })
      return
    }

    void answer(message.call, message.name, message.input)
  }

  async function answer(call: number, name: string, input: string): Promise<void> {
    const behaviour = options.behaviours().find((candidate) => candidate.name === name)
    if (behaviour === undefined) {
      // The behaviour went away between the click and here — a replacement
      // that failed, or a component released. Saying so beats a silent slot.
      const recorded = options.session.record({
        name,
        input,
        failure: 'ce comportement ne sert plus',
      })
      options.onInteraction?.()
      options.onObservation?.(recorded)
      post({ type: 'call-settled', call, failure: 'ce comportement ne sert plus' })
      return
    }

    const version = behaviour.version
    const result = await behaviour.call(input)
    if (disposed) return

    // Recorded before the answer is posted: what the visitor did is kept even
    // if the frame is gone by the time it comes back.
    const recorded = options.session.record({
      name,
      input,
      version,
      ...(result.output !== undefined ? { output: result.output } : {}),
      ...(result.failure !== undefined ? { failure: result.failure } : {}),
    })
    options.onInteraction?.()
    options.onObservation?.(recorded)

    post({
      type: 'call-settled',
      call,
      version,
      ...(result.output !== undefined ? { output: result.output } : {}),
      ...(result.failure !== undefined ? { failure: result.failure } : {}),
    })
  }

  window.addEventListener('message', onMessage)

  return {
    sync,
    dispose() {
      disposed = true
      window.removeEventListener('message', onMessage)
    },
  }
}
