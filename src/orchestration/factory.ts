// Starting a run. There is no scenario and no plan: there is a need, a master,
// and whatever the agents make of it.
//
// This file knows no agent. It only hands the master what a component cannot
// see for itself: when the worksite settled, and what was actually published.

import { masterAgent } from '../agents/master'
import type { Budget } from '../agents/free-agent'
import type { ComponentId } from '../runtime/contract'
import type { Kernel } from '../runtime/kernel'
import type { Reasoner } from '../runtime/reasoner'

export interface RunOptions {
  brief: string
  reasoner?: Reasoner
  budget?: Budget
  /** How long a worksite may stay in motion. */
  settleTimeoutMs?: number
  /** The step between two settle checks. Tests shorten it. */
  stepMs?: number
}

export interface Launch {
  /** The master agent, whose release undoes the whole run. */
  master: ComponentId
}

const SETTLE_TIMEOUT = 120_000
const STEP = 300
/** Three checks in a row with no movement: the worksite is done. */
const STABLE_CHECKS = 3

/**
 * The worksite is settled when no component is working any more and none has
 * appeared for a while. There is no other way to know: an agent can create
 * another at any instant.
 */
function createSettleCheck(kernel: Kernel, options: RunOptions) {
  return async function settled(timeoutMs = options.settleTimeoutMs ?? SETTLE_TIMEOUT) {
    const step = options.stepMs ?? STEP
    const end = Date.now() + timeoutMs
    let stable = 0
    let fingerprint = ''

    while (Date.now() < end) {
      await new Promise((next) => setTimeout(next, step))
      const components = kernel.inspect().components
      // The master itself is working: it is the one waiting. We exclude it,
      // otherwise the worksite would never be declared settled.
      const others = components.filter((component) => component.name !== 'master-agent')
      const working = others.some(
        (component) => component.state === 'active' && !component.finished,
      )
      const next = others.map((component) => `${component.id}:${component.state}`).join(',')

      if (!working && next === fingerprint) {
        stable += 1
        if (stable >= STABLE_CHECKS) return true
      } else {
        stable = 0
        fingerprint = next
      }
    }
    return false
  }
}

export async function startFactory(kernel: Kernel, options: RunOptions): Promise<Launch> {
  const master = await kernel.load(
    masterAgent({
      brief: options.brief,
      ...(options.reasoner !== undefined ? { reasoner: options.reasoner } : {}),
      ...(options.budget !== undefined ? { budget: options.budget } : {}),
      settled: createSettleCheck(kernel, options),
      outputs: () => kernel.providedNames(),
    }),
  )
  if (master === undefined) {
    throw new Error("L'agent maître n'a pas pu être chargé : le run n'a pas commencé.")
  }
  return { master }
}

/**
 * The run's product: the first published function, whatever its name. It
 * cannot be looked up by a known name — nobody knows it, not even the master
 * before its agents have worked.
 */
export function runProduct(
  kernel: Kernel,
): { name: string; run: (input: unknown) => unknown } | undefined {
  for (const name of kernel.providedNames()) {
    const value = kernel.output<unknown>(name)
    if (typeof value === 'function') {
      return { name, run: value as (input: unknown) => unknown }
    }
  }
  return undefined
}
