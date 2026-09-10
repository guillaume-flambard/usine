import { ref } from 'vue'
import { createPilot } from '../../orchestration/pilot'
import { demoReasoner } from '../../examples/demo'
import { relayReasoner, relayState } from '../../runtime/reasoner/relay'

// The shell's one run. A single pilot, module-level, because two would mean two
// answers to "what is happening right now" and the status bar could then
// disagree with the page under it.
export const pilot = createPilot()

/** The read model the views render. Never written from a view. */
export const state = pilot.store.state

/**
 * Where the reasoning comes from, as the screen is allowed to describe it.
 *
 * `demo` replays prepared answers, `site` runs a real model behind the service.
 * The distinction is not decoration: a visitor must never be shown a recorded
 * run and left to believe a model produced it.
 */
export type ReasoningSource = 'demo' | 'site'

export const source = ref<ReasoningSource>('demo')

// Until the service answers, the factory can invent nothing, so it replays.
pilot.connect(demoReasoner())

/**
 * Asks the service whether it carries a provider key, and connects the real
 * model if it does.
 *
 * The key never reaches this file, this bundle, or this browser: the service
 * holds it and answers only whether it has one. That is the whole reason the
 * question is asked over the network instead of read from a variable.
 */
export async function probeSiteModel(): Promise<void> {
  const status = await relayState()
  if (!status.ready) return
  pilot.connect(relayReasoner())
  source.value = 'site'
}
