// The pilot: everything that makes a run live — the kernel, the store, the
// layout — outside any Vue component. This is what makes the wiring verifiable
// without a browser.
//
// There is no scenario to choose any more. There is a brief, and whatever the
// factory makes of it.

import { computed, shallowRef, type Ref } from 'vue'
import { liveLayout, topologySignature, type Layout } from '../state/layout'
import { createStore, type RunStore } from '../state/store'
import { createKernel, type Kernel } from '../runtime/kernel'
import { deterministicReasoner, type Reasoner, type ReasoningOrigin } from '../runtime/reasoner'
import type { Budget } from '../agents/free-agent'
import { runProduct, startFactory } from './factory'

/** A run's product: a published function whose name nobody knew. */
export interface DeliveredProduct {
  name: string
  run: (input: unknown) => unknown
}

export type RunPhase =
  | 'Au repos'
  | 'Amorçage'
  | 'Construction'
  | 'Décision'
  | 'Écarté'
  | 'Terminé'
  | 'Incident'
  | 'Libéré'

export interface Pilot {
  readonly store: RunStore
  /** The layout of the graph as it stands. Recomputed as it grows. */
  readonly layout: Ref<Layout>
  phase(): RunPhase
  /** True when nothing will move any more without a human action. */
  isDone(): boolean
  error(): string | undefined
  start(brief: string): Promise<void>
  /**
   * Connects a real model to the agents that reason. Without this call the run
   * stays deterministic: no key, no token, no request.
   */
  connect(reasoner: Reasoner | undefined): void
  /** The reasoning mode in force for the next run. */
  reasoningMode(): ReasoningOrigin
  stop(): Promise<void>
  /** Approves the pending gate. Returns `false` if none waits. */
  approve(): boolean
  /**
   * Rejects the pending gate: delivery will not happen, and the built parts are
   * released so the graph shows the retraction.
   */
  reject(): Promise<boolean>
  /**
   * The delivered product, once the run went all the way. It is the function
   * the built part publishes — the application consumes it, it does not take
   * part in the composition.
   */
  product(): DeliveredProduct | undefined
  /** The current run's kernel, for introspection. Absent at rest. */
  kernel(): Kernel | undefined
}

const EMPTY_LAYOUT: Layout = {
  boxes: new Map(),
  links: [],
  width: 0,
  height: 0,
}

export interface PilotOptions {
  /** What bounds a free run: agents, depth, turns, tokens. */
  budget?: Budget
  /** How long a worksite may stay in motion. */
  settleTimeoutMs?: number
  /** The step between two settle checks. Tests shorten it. */
  stepMs?: number
}

export function createPilot(options: PilotOptions = {}): Pilot {
  const store = createStore()
  let currentKernel: Kernel | undefined
  let disconnect: (() => void) | undefined
  let lastError: string | undefined
  let starting = false
  let currentReasoner: Reasoner = deterministicReasoner()

  // The layout is only recomputed when the topology changes: a message or a
  // node state change has no reason to move a node.
  const latest = shallowRef<{ signature: string; layout: Layout }>({
    signature: '',
    layout: EMPTY_LAYOUT,
  })
  const layout = computed(() => {
    const { nodes, edges } = store.state.value
    if (nodes.length === 0) return EMPTY_LAYOUT
    const signature = topologySignature(nodes, edges)
    if (signature !== latest.value.signature) {
      latest.value = { signature, layout: liveLayout(nodes, edges) }
    }
    return latest.value.layout
  })

  const phase = (): RunPhase => {
    const nodes = store.state.value.nodes
    if (nodes.length === 0) return 'Au repos'
    if (nodes.every((n) => n.state === 'released')) return 'Libéré'
    const gate = store.state.value.gate
    // A pending gate halts the run: neither an end nor a breakdown.
    if (gate !== undefined && gate.decision === undefined) return 'Décision'
    // A rejected run is stopped, not running: calling it "Construction" would
    // suggest it is still working.
    if (gate?.decision === 'rejected') return 'Écarté'
    // Incidents come after the gate: while a decision is pending, saying
    // "Incident" and declaring the run done would leave live buttons on a run
    // announced as finished.
    if (nodes.some((n) => n.state === 'failed')) return 'Incident'
    if (nodes.every((n) => n.state === 'finished')) return 'Terminé'
    // While the master is alone, nothing has been created yet: saying
    // "Construction" would suggest agents are working.
    if (nodes.length > 1) return 'Construction'
    return 'Amorçage'
  }

  async function stop() {
    disconnect?.()
    disconnect = undefined
    await currentKernel?.releaseAll()
    currentKernel = undefined
  }

  return {
    store,
    layout,
    phase,
    isDone: () => ['Terminé', 'Écarté', 'Libéré', 'Incident'].includes(phase()),
    error: () => lastError,
    kernel: () => currentKernel,
    product() {
      // Only after approval: the product is delivered once the gate is crossed,
      // and rejecting takes it back.
      if (store.state.value.gate?.decision !== 'approved') return undefined
      // Nor from a run that broke down or was released: serving the product of
      // a run the graph shows as failed would be incoherent.
      if (phase() === 'Incident' || phase() === 'Libéré') return undefined
      // The product's name is not known in advance: we look for whatever
      // executable was published, whatever name its authors chose.
      return currentKernel === undefined ? undefined : runProduct(currentKernel)
    },
    stop,
    async start(brief: string) {
      // Two interleaved starts would share the same kernel.
      if (starting) return
      starting = true
      try {
        await stop()
        store.reset()
        lastError = undefined
        currentKernel = createKernel()
        disconnect = store.connect(currentKernel)
        await startFactory(currentKernel, {
          brief,
          reasoner: currentReasoner,
          ...(options.budget !== undefined ? { budget: options.budget } : {}),
          ...(options.settleTimeoutMs !== undefined
            ? { settleTimeoutMs: options.settleTimeoutMs }
            : {}),
          ...(options.stepMs !== undefined ? { stepMs: options.stepMs } : {}),
        })
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : String(cause)
        await stop()
      } finally {
        starting = false
      }
    },
    approve() {
      const gate = store.state.value.gate
      if (gate === undefined || gate.decision !== undefined) return false
      return currentKernel?.decide(gate.id, 'approved') ?? false
    },
    async reject() {
      const gate = store.state.value.gate
      if (gate === undefined || gate.decision !== undefined) return false
      // The kernel is captured: if the user restarts during the retraction, the
      // remaining ids would target the new run.
      const kernel = currentKernel
      if (kernel === undefined) return false
      if (!kernel.decide(gate.id, 'rejected')) return false
      // Rejecting must be visible: built parts are released, and the graph
      // shows the retraction instead of freezing.
      for (const node of store.state.value.nodes) {
        if (currentKernel !== kernel) return true
        if (node.build === undefined || node.state === 'released') continue
        try {
          await kernel.release(node.id)
        } catch {
          // A release that fails does not interrupt the retraction of the
          // other parts.
        }
      }
      return true
    },
    connect(reasoner: Reasoner | undefined) {
      currentReasoner = reasoner ?? deterministicReasoner()
    },
    reasoningMode: () => currentReasoner.origin,
  }
}
