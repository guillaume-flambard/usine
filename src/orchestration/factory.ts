// Starting a run. There is no scenario and no plan: there is a need, a master,
// and whatever the agents make of it.
//
// This file knows no agent. It only hands the master what a component cannot
// see for itself: when the worksite settled, and what was actually published.

import { masterAgent } from '../agents/master'
import { BUDGET, createWorksite, type Budget, type Worksite } from '../agents/free-agent'
import { deterministicReasoner } from '../runtime/reasoner'
import type { ComponentId } from '../runtime/contract'
import type { Kernel } from '../runtime/kernel'
import type { Reasoner } from '../runtime/reasoner'
import type { SpawnWorker } from '../app/isolate'
import type { SourceFetcher } from '../app/sources'
import { behaviourName, isBehaviour, type Behaviour } from '../app/behaviour'

export interface RunOptions {
  brief: string
  reasoner?: Reasoner
  budget?: Budget
  /** How an isolated thread is made. Absent in the product; supplied by tests. */
  spawnWorker?: SpawnWorker
  /**
   * Comment on va chercher une source. Absent, le run reste hors ligne : les
   * agents ne se voient proposer aucune source et n'en inventent pas.
   */
  fetchSource?: SourceFetcher
  /** Les sources disponibles. Demandées au service quand rien n'est fourni. */
  sources?: readonly { name: string; description: string }[]
  /** How long a worksite may stay in motion. */
  settleTimeoutMs?: number
  /** The step between two settle checks. Tests shorten it. */
  stepMs?: number
}

export interface Launch {
  /** The master agent, whose release undoes the whole run. */
  master: ComponentId
  /**
   * The worksite the run is working in. Orchestration owns it so the
   * interface can read the screen and the behaviour versions without asking
   * an agent — a component would have to be alive to answer, and the screen
   * must outlive the agent that posted it.
   */
  worksite: Worksite
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
  const worksite = createWorksite(
    options.brief,
    options.reasoner ?? deterministicReasoner(),
    options.budget ?? BUDGET,
    options.spawnWorker,
  )
  // Fournies par l'appelant, jamais demandées ici.
  //
  // La version d'avant interrogeait le service au démarrage — ce qui faisait
  // partir une requête même en mode déterministe, où la page promet de ne
  // joindre personne. Un test l'a rattrapé. Le sondage vit maintenant là où
  // vit déjà celui du relais : dans la page, une fois seulement.
  worksite.sources = options.sources ?? []
  if (options.fetchSource !== undefined) worksite.fetchSource = options.fetchSource
  const master = await kernel.load(
    masterAgent({
      brief: options.brief,
      ...(options.reasoner !== undefined ? { reasoner: options.reasoner } : {}),
      worksite,
      settled: createSettleCheck(kernel, options),
      outputs: () => kernel.providedNames(),
    }),
  )
  if (master === undefined) {
    throw new Error("L'agent maître n'a pas pu être chargé : le run n'a pas commencé.")
  }
  return { master, worksite }
}

/**
 * The application's live behaviours, whatever their names.
 *
 * They cannot be looked up by a known name — nobody knows them, not even the
 * master before its agents have worked. What identifies one is its namespace,
 * not its name, so a behaviour disappearing from this list is exactly a
 * behaviour whose component is no longer providing: the slot goes inert on
 * its own, with nothing to keep in step.
 */
export function liveBehaviours(kernel: Kernel): readonly Behaviour[] {
  const live: Behaviour[] = []
  for (const key of kernel.providedNames()) {
    if (behaviourName(key) === undefined) continue
    const value = kernel.output<unknown>(key)
    if (isBehaviour(value)) live.push(value)
  }
  return live
}
