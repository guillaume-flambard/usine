// Where the reasoning comes from, and what the screen is allowed to claim
// about it.
//
// Three sources, and the difference between them is what the visitor is told:
// the site's own model behind a relay that keeps the key server-side, the
// visitor's own key held in this tab's memory, or nothing at all — in which
// case the page replays a recorded run and says so. Connecting is never
// silent, and neither is failing to connect.
import { computed, ref, type Ref } from 'vue'
import type { Pilot } from '../../orchestration/pilot'
import { demoReasoner } from '../../examples/demo'
import { relayReasoner, relayState, type RelayState } from '../../runtime/reasoner/relay'
import { availableSources, serviceFetcher } from '../../app/sources'
import type { ReasoningOrigin } from '../../runtime/reasoner'
import type { ModelSource } from '../ModelSwitch.vue'

export interface ModelSourceControl {
  mode: Ref<ReasoningOrigin>
  source: Ref<ModelSource>
  relayReady: Ref<boolean>
  /** Les sources que le service sert. Vide tant qu'il n'a pas répondu. */
  wired: Ref<readonly { name: string; description: string }[]>
  /**
   * What the relay says is left, in runs. Undefined until the probe answers —
   * not zero: "your capacity is spent" and "we have not asked yet" are
   * different facts, and telling the second as the first is a lie.
   */
  capacity: Ref<RelayState['runs'] | undefined>
  replayReason: Ref<string>
  connectSiteRelay: () => void
  connectKey: (key: string) => Promise<void>
  disconnectModel: () => void
  /** Sonde le relais une fois, et branche le modèle du site s'il en porte un. */
  probeRelay: () => Promise<void>
}

export function useModelSource(
  pilot: Pilot,
  reportError: (message: string | undefined) => void,
): ModelSourceControl {
  const mode = ref<ReasoningOrigin>(pilot.reasoningMode())
  const source = ref<ModelSource>('none')
  const relayReady = ref(false)
  const wired = ref<readonly { name: string; description: string }[]>([])
  const capacity = ref<RelayState['runs'] | undefined>()

  /**
   * Why the page is replaying rather than running live. A replay announced with
   * no reason reads as a limitation of the product; the reason is usually that
   * the day's capacity is spent, which is a different thing entirely.
   */
  const replayReason = computed(() => {
    if (source.value === 'key' || source.value === 'relay') return 'Le modèle n’a pas répondu.'
    if (capacity.value === undefined) return 'Aucun modèle n’est branché.'
    if (capacity.value.visitor <= 0) return 'Votre capacité du jour est atteinte.'
    if (capacity.value.site <= 0) return 'La capacité du jour du site est atteinte.'
    return 'Aucun modèle n’est branché.'
  })

  /**
   * The site's model. The key is not here: it lives on the relay, and the
   * browser only ever sees a same-origin route. With no relay configured we
   * stay on the demo without announcing anything false.
   */
  function connectSiteRelay() {
    pilot.connect(relayReasoner())
    source.value = 'relay'
    mode.value = pilot.reasoningMode()
    reportError(undefined)
  }

  async function connectKey(key: string) {
    try {
      // Dynamic import: with nothing connected, the SDK is never loaded and the
      // default bundle carries not a line of it.
      const { claudeReasoner } = await import('../../runtime/reasoner/claude')
      pilot.connect(claudeReasoner({ key }))
      source.value = 'key'
      reportError(undefined)
    } catch (cause) {
      // A chunk that fails to load must say so, not let the screen announce a
      // mode that is not its own.
      reportError(
        `Le modèle n'a pas pu être branché : ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      )
    }
    mode.value = pilot.reasoningMode()
  }

  function disconnectModel() {
    // Disconnecting does not make the page inert: it falls back to the replayed
    // demo, which announces itself as such.
    pilot.connect(demoReasoner())
    source.value = 'none'
    mode.value = pilot.reasoningMode()
  }

  async function probeRelay() {
    const state = await relayState()
    // Only a relay that answered can say anything about capacity. An absent
    // relay leaves it unknown rather than reporting zero, which would blame
    // the visitor for a run they never made.
    if (state.ready) capacity.value = state.runs
    const usable = state.ready && state.runs.visitor > 0 && state.runs.site > 0
    relayReady.value = usable
    if (usable && source.value === 'none') connectSiteRelay()
    // Les sources ne sont demandées que si le service répond. Sondées de toute
    // façon, elles feraient partir une requête là où la page promet de ne
    // joindre personne.
    if (!state.ready) return
    const sources = await availableSources()
    wired.value = sources
    pilot.connectSources(sources, serviceFetcher())
  }

  return {
    mode,
    source,
    relayReady,
    wired,
    capacity,
    replayReason,
    connectSiteRelay,
    connectKey,
    disconnectModel,
    probeRelay,
  }
}
