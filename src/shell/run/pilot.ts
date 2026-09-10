import { createPilot } from '../../orchestration/pilot'
import { demoReasoner } from '../../examples/demo'

// The shell's one run. A single pilot, module-level, because two would mean two
// answers to "what is happening right now" and the status bar could then
// disagree with the page under it.
//
// The demo reasoner is connected for the same reason it is in `FactoryApp`:
// with no key the factory can invent nothing, so it replays prepared answers
// rather than showing a blank screen, and it never pretends otherwise.
export const pilot = createPilot()

pilot.connect(demoReasoner())

/** The read model the views render. Never written from a view. */
export const state = pilot.store.state
