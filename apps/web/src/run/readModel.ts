/**
 * The run read model (MEM-17): what the scene shows, reduced from run events.
 *
 * The stream is the archive format (CLAUDE.md, rule 2): the model is rebuilt
 * from events only, with no live object and no absolute date, so a recorded
 * run replays to the same model. Every element on screen is paid for by an
 * event: no node, edge or state exists here before an event says so.
 */
import type { RunEventPayload } from '../contracts/ui-stream'

export type NodeState = 'running' | 'waiting' | 'finished' | 'failed'

export interface RunNode {
  /** The short task id the service gives each node run (t1, t2...). */
  id: string
  name: string
  state: NodeState
  startedAt: number
  finishedAt?: number
  /** The sub-task a specialist received. */
  task?: string
  /** What the supervisor planned. */
  subtasks?: string[]
  /** Specialist identities and tokens, once finished. */
  specialists?: {
    name: string
    framework: string
    tokens: number
    tools?: string[]
    /** Why it did not finish; the others went on without it. */
    failed?: string
  }[]
  /** Why this node did not finish, as the service worded it for a person. */
  failure?: string
  /** Reasoning started and settled inside this node (reasoning events). */
  reasoning: { started: number; settled: number }
}

export interface RunEdge {
  from: string
  to: string
}

export type RunStatus = 'idle' | 'running' | 'waiting' | 'finished' | 'failed'

/** A human gate (MEM-20): what is proposed, and the reminder shown with it. */
export interface GateView {
  actions: { kind: string; target: string; justification: string; preview: string }[]
  notice: string
  decision?: string
  reason?: string
}

export interface RunReadModel {
  status: RunStatus
  gate?: GateView
  nodes: RunNode[]
  edges: RunEdge[]
  /** Why the run failed, as the service worded it for a person. */
  error?: string
  /** Seconds since the start of the run, at the last event. */
  at: number
  events: number
}

export const EMPTY_RUN: RunReadModel = { status: 'idle', nodes: [], edges: [], at: 0, events: 0 }

const SUPERVISOR = 'supervisor'
const SPECIALIST = 'specialist'
const SYNTHESIZE = 'synthesize'
const HUMAN_GATE = 'human_gate'
const ACT = 'act'

function taskId(event: RunEventPayload): string | undefined {
  const value = event.data?.taskId
  return typeof value === 'string' ? value : undefined
}

/** The graph's shape: supervisor, then each specialist, then synthesis. */
function edgesFor(nodes: RunNode[]): RunEdge[] {
  const supervisor = nodes.find((n) => n.name === SUPERVISOR)
  const synthesize = nodes.find((n) => n.name === SYNTHESIZE)
  const edges: RunEdge[] = []
  for (const node of nodes.filter((n) => n.name === SPECIALIST)) {
    if (supervisor) edges.push({ from: supervisor.id, to: node.id })
    if (synthesize) edges.push({ from: node.id, to: synthesize.id })
  }
  const gate = nodes.find((n) => n.name === HUMAN_GATE)
  const act = nodes.find((n) => n.name === ACT)
  if (synthesize && gate) edges.push({ from: synthesize.id, to: gate.id })
  if (gate && act) edges.push({ from: gate.id, to: act.id })
  return edges
}

/** Pure: the same events in the same order always give the same model. */
export function reduceRun(model: RunReadModel, event: RunEventPayload): RunReadModel {
  const at = Math.max(model.at, event.at)
  const base = { ...model, at, events: model.events + 1 }
  const id = taskId(event)
  const data = event.data ?? {}

  switch (event.kind) {
    case 'run-started':
      // A resumed run (after a human gate, MEM-21) continues the same scene.
      if (data.resumed === true && model.events > 0) return { ...base, status: 'running' }
      return { ...EMPTY_RUN, status: 'running', at: event.at, events: 1 }
    case 'node-started': {
      if (!id || !event.node || model.nodes.some((n) => n.id === id)) return base
      // On resume LangGraph replays the gate node: it is the same gate, so the
      // waiting node takes the new task id instead of a second node appearing.
      const waitingGate = model.nodes.find((n) => n.name === HUMAN_GATE && n.state === 'waiting')
      if (event.node === HUMAN_GATE && waitingGate) {
        const nodes = model.nodes.map((n) => (n === waitingGate ? { ...n, id } : n))
        return { ...base, nodes, edges: edgesFor(nodes) }
      }
      const node: RunNode = {
        id,
        name: event.node,
        state: 'running',
        startedAt: event.at,
        reasoning: { started: 0, settled: 0 },
        ...(typeof data.task === 'string' ? { task: data.task } : {}),
      }
      const nodes = [...model.nodes, node]
      return { ...base, nodes, edges: edgesFor(nodes) }
    }
    case 'node-finished': {
      const specialists = Array.isArray(data.specialists)
        ? (data.specialists as NonNullable<RunNode['specialists']>)
        : undefined
      // A specialist that failed while the others went on (16 November 2026):
      // its card says so, with the reason the service gave.
      const failure = specialists?.find((s) => typeof s.failed === 'string')?.failed
      const nodes = model.nodes.map((n): RunNode => {
        if (n.id !== id) return n
        return {
          ...n,
          state: failure ? 'failed' : 'finished',
          finishedAt: event.at,
          ...(Array.isArray(data.subtasks) ? { subtasks: data.subtasks as string[] } : {}),
          ...(specialists ? { specialists } : {}),
          ...(failure ? { failure } : {}),
        }
      })
      return { ...base, nodes }
    }
    case 'gate-opened': {
      const request = (data.gate ?? {}) as Partial<GateView>
      const nodes = model.nodes.map((n): RunNode =>
        n.id === id ? { ...n, state: 'waiting', finishedAt: undefined } : n,
      )
      return {
        ...base,
        nodes,
        status: 'waiting',
        gate: { actions: request.actions ?? [], notice: request.notice ?? '' },
      }
    }
    case 'gate-decided': {
      const nodes = model.nodes.map((n): RunNode =>
        n.id === id ? { ...n, state: 'finished', finishedAt: event.at } : n,
      )
      const gate = model.gate
        ? {
            ...model.gate,
            decision: String(data.decision ?? ''),
            ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
          }
        : undefined
      return { ...base, nodes, status: 'running', ...(gate ? { gate } : {}) }
    }
    case 'reasoning-started':
    case 'reasoning-settled': {
      const key = event.kind === 'reasoning-started' ? 'started' : 'settled'
      const nodes = model.nodes.map((n) =>
        n.id === id ? { ...n, reasoning: { ...n.reasoning, [key]: n.reasoning[key] + 1 } } : n,
      )
      return { ...base, nodes }
    }
    case 'run-finished': {
      const failed = data.outcome === 'error'
      const nodes = failed
        ? model.nodes.map((n): RunNode => (n.state === 'running' ? { ...n, state: 'failed' } : n))
        : model.nodes
      return {
        ...base,
        nodes,
        status: failed ? 'failed' : 'finished',
        ...(failed && typeof data.error === 'string' ? { error: data.error } : {}),
      }
    }
    default:
      // Tool calls and gates (M2, M3) arrive later; an unknown kind is counted
      // and otherwise ignored, never invented on screen.
      return base
  }
}

export function replay(events: readonly RunEventPayload[]): RunReadModel {
  return events.reduce(reduceRun, EMPTY_RUN)
}
