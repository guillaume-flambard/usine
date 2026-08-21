// Enough to drive a run in a test without rewriting the same wait ten times.
// The graph is no longer known in advance: so we no longer wait a number of
// ticks, we wait for a state.

import { createPilot, type Pilot } from '../pilot'
import { scriptedModel } from '../../agents/__tests__/scripted-model'

export const BRIEF = 'Un outil qui repère les allégations thérapeutiques interdites.'

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 5))

/** Waits for a condition to become true, or gives up after the deadline. */
export async function until(condition: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await breathe()
  }
  return condition()
}

/** A pilot connected to the scripted model: with no model, nothing is born. */
export const scriptedPilot = (): Pilot => {
  const pilot = createPilot({ stepMs: 10, settleTimeoutMs: 4000 })
  pilot.connect(scriptedModel())
  return pilot
}

/** A run taken to the human gate, whatever graph was invented. */
export async function runToGate(brief = BRIEF): Promise<Pilot> {
  const pilot = scriptedPilot()
  await pilot.start(brief)
  await until(() => pilot.store.state.value.gate !== undefined)
  return pilot
}

/** A run taken to the delivered product. */
export async function runApproved(brief = BRIEF): Promise<Pilot> {
  const pilot = await runToGate(brief)
  pilot.approve()
  await until(() => pilot.product() !== undefined)
  return pilot
}

/** A run taken until nothing moves any more. */
export async function runFinished(brief = BRIEF): Promise<Pilot> {
  const pilot = await runApproved(brief)
  await until(() => pilot.isDone())
  return pilot
}
