// The single write path for state. Pure: same event sequence, same final
// state. Nothing else in the application is allowed to write.

import type { ComponentId, ComponentState } from '../runtime/contract'
import type { RunEvent } from '../runtime/events'
import { displayState } from './display-state'
import type { EdgeView, LogMessage, NodeView, RunState } from './model'

/** What the reducer keeps about a node, beyond what is displayed. */
interface Internal {
  lifecycle: ComponentState
  finished: boolean
}

/** The state, plus the internal memory the derivation needs. */
export interface FullState {
  view: RunState
  internal: ReadonlyMap<ComponentId, Internal>
}

export function initialState(): FullState {
  return {
    view: freeze({
      nodes: [],
      edges: [],
      exchanges: [],
      log: [],
      incidents: [],
      tokens: { input: 0, output: 0 },
      liveAgents: 0,
      screen: { markup: '', revision: 0 },
      replacements: 0,
      restarts: 0,
      interactions: 0,
      lastSequence: 0,
    }),
    internal: new Map(),
  }
}

const isLive = (node: NodeView) => node.state !== 'released' && node.state !== 'failed'

/**
 * An agent, as opposed to what an agent wrote. A component carrying a `build`
 * is a behaviour or a tool a model produced: counting it as an agent inflates
 * the only number the visitor is asked to trust.
 */
const isAgent = (node: NodeView) => node.build === undefined

/**
 * Read-only is not just a matter of types: the state is frozen, so a component
 * trying to push something into it fails instead of silently corrupting the
 * view.
 */
function freeze(view: RunState): RunState {
  Object.freeze(view.nodes)
  Object.freeze(view.edges)
  Object.freeze(view.log)
  Object.freeze(view.incidents)
  Object.freeze(view.tokens)
  return Object.freeze(view)
}

export function reduce(state: FullState, event: RunEvent): FullState {
  const internal = new Map(state.internal)
  let nodes = state.view.nodes
  let edges = state.view.edges
  let exchanges = state.view.exchanges
  let log = state.view.log
  let incidents = state.view.incidents
  let narration = state.view.narration
  let gate = state.view.gate
  let tokens = state.view.tokens
  let replacements = state.view.replacements
  let interactions = state.view.interactions
  let screen = state.view.screen

  /** Replaces a node and re-derives its displayed state. */
  const updateNode = (
    id: ComponentId,
    change: (node: NodeView, memory: Internal) => { node: NodeView; memory: Internal },
    despiteFailure = false,
  ) => {
    const index = nodes.findIndex((n) => n.id === id)
    // An event carrying an unknown id is ignored: the store may have connected
    // after the run started.
    if (index === -1) return
    const before = nodes[index]
    const memoryBefore = internal.get(id)
    if (before === undefined || memoryBefore === undefined) return
    // Failure is terminal: neither a later activation nor a later deactivation
    // requalifies a component in fault. Without this, a failed node becomes
    // "pending" again and the graph shows it healthy.
    if (memoryBefore.lifecycle === 'failed' && !despiteFailure) return
    const { node, memory } = change(before, memoryBefore)
    internal.set(id, memory)
    const derived: NodeView = {
      ...node,
      state: displayState({
        lifecycle: memory.lifecycle,
        finished: memory.finished,
        needsSomething: node.needs.length > 0,
      }),
    }
    nodes = nodes.map((n, i) => (i === index ? derived : n))
  }

  switch (event.type) {
    case 'component-created': {
      internal.set(event.id, { lifecycle: 'pending', finished: false })
      const node: NodeView = {
        id: event.id,
        name: event.name,
        display: event.display,
        needs: event.needs,
        provides: event.provides,
        state: displayState({
          lifecycle: 'pending',
          finished: false,
          needsSomething: event.needs.length > 0,
        }),
        appearedAt: event.sequence,
        ...(event.parent !== undefined ? { parent: event.parent } : {}),
      }
      nodes = [...nodes, node]
      edges = rebuildEdges(nodes, edges)
      break
    }

    case 'component-activated':
      // `finished` resets to false: a component that reactivates has not
      // redone its work yet, and showing it "finished" right away would be a
      // lie about a past state.
      updateNode(event.id, (node, memory) => ({
        node: { ...node, cause: undefined },
        memory: { ...memory, lifecycle: 'active', finished: false },
      }))
      break

    case 'work-finished':
      updateNode(event.id, (node, memory) => ({
        node,
        memory: { ...memory, finished: true },
      }))
      break

    case 'component-deactivated':
      updateNode(event.id, (node, memory) => ({
        node: { ...node, cause: event.cause },
        memory: { ...memory, lifecycle: 'pending' },
      }))
      break

    case 'component-failed': {
      incidents = [...incidents, { sequence: event.sequence, error: event.error }]
      const id = event.error.component
      // A load failure: the engine removed the entry, so the node must not
      // stay displayed, otherwise the graph shows what does not exist.
      if (event.error.code === 'load-failed' && id !== undefined) {
        internal.delete(id)
        nodes = nodes.filter((n) => n.id !== id)
        edges = rebuildEdges(nodes, edges)
        break
      }
      // A refused load has no identifier: there is no node to put in fault,
      // only an incident to record.
      if (id !== undefined) {
        updateNode(id, (node, memory) => ({
          node: { ...node, error: event.error },
          memory: { ...memory, lifecycle: 'failed' },
        }))
      }
      break
    }

    case 'component-released':
      updateNode(event.id, (node, memory) => ({
        node,
        memory: { ...memory, lifecycle: 'released' },
      }))
      break

    case 'message-emitted': {
      const author = nodes.find((n) => n.id === event.id)?.name ?? event.id
      const message: LogMessage = {
        sequence: event.sequence,
        id: event.id,
        author,
        message: event.message,
        ...(event.kind !== undefined ? { kind: event.kind } : {}),
      }
      log = [...log, message]
      // The narration is the highest-sequence message, full stop.
      if (narration === undefined || message.sequence > narration.sequence) narration = message
      break
    }

    case 'artifact-published':
      // Only the latest version is kept: "a node's artifact" must always be
      // defined and unique.
      // Published "despite failure": what an agent wrote before falling is
      // still what it wrote, and must stay readable.
      updateNode(
        event.id,
        (node, memory) => ({ node: { ...node, artifact: event.artifact }, memory }),
        true,
      )
      break

    case 'screen-posted':
      screen = { markup: event.markup, revision: event.revision }
      break

    case 'visitor-interacted':
      interactions += 1
      break

    case 'component-replaced':
      replacements += 1
      updateNode(event.id, (node, memory) => ({
        node: { ...node, replaces: event.previous },
        memory,
      }))
      break

    case 'component-built':
      updateNode(event.id, (node, memory) => ({
        node: { ...node, build: event.build, builtBy: event.parent },
        memory,
      }))
      break

    case 'tokens-spent':
      tokens = {
        input: tokens.input + event.input,
        output: tokens.output + event.output,
      }
      updateNode(
        event.id,
        (node, memory) => ({
          node: {
            ...node,
            usedModel: true,
            ...(event.failure !== undefined ? { fallback: event.failure } : {}),
          },
          memory,
        }),
        true,
      )
      break

    case 'gate-reached':
      // A gate already settled does not reopen: without this guard, a
      // reactivation of the component would erase the recorded decision.
      gate =
        gate?.id === event.id && gate.decision !== undefined
          ? gate
          : { id: event.id, subject: event.subject, openedAt: event.sequence }
      break

    case 'gate-withdrawn':
      // The gate vanished with no decision: we stop offering buttons that
      // would no longer do anything.
      gate = gate?.id === event.id && gate.decision === undefined ? undefined : gate
      break

    case 'decision-made':
      // The gate stays visible after the decision: it is the trace of what was
      // settled, and at which point in the stream.
      gate =
        gate?.id === event.id
          ? { ...gate, decision: event.decision, settledAt: event.sequence }
          : gate
      break

    case 'value-passed':
      edges = edges.map((edge) =>
        edge.from === event.from && edge.to === event.to && edge.name === event.name
          ? { ...edge, hasTransited: true, lastTransit: event.sequence }
          : edge,
      )
      break

    case 'question-asked': {
      const author = (id: ComponentId) => nodes.find((n) => n.id === id)?.name ?? id
      exchanges = [
        ...exchanges,
        {
          from: event.from,
          to: event.to,
          question: event.question,
          sequence: event.sequence,
        },
      ]
      const message: LogMessage = {
        sequence: event.sequence,
        id: event.from,
        author: author(event.from),
        message: `demande à ${author(event.to)} : ${event.question}`,
      }
      log = [...log, message]
      if (narration === undefined || message.sequence > narration.sequence) narration = message
      break
    }

    case 'answer-given': {
      const author = (id: ComponentId) => nodes.find((n) => n.id === id)?.name ?? id
      // The answer attaches to the most recent open question between those
      // two: two simultaneous exchanges must not get mixed up.
      let attached = false
      exchanges = [...exchanges]
        .reverse()
        .map((exchange) => {
          if (
            attached ||
            exchange.answer !== undefined ||
            exchange.from !== event.to ||
            exchange.to !== event.from
          ) {
            return exchange
          }
          attached = true
          return { ...exchange, answer: event.answer }
        })
        .reverse()
      const message: LogMessage = {
        sequence: event.sequence,
        id: event.from,
        author: author(event.from),
        message: `répond à ${author(event.to)} : ${event.answer}`,
      }
      log = [...log, message]
      if (narration === undefined || message.sequence > narration.sequence) narration = message
      break
    }

    case 'subscriber-failed':
      incidents = [
        ...incidents,
        {
          sequence: event.sequence,
          error: { code: 'subscriber-incident', message: event.message, name: 'abonné' },
        },
      ]
      break
  }

  return {
    view: freeze({
      nodes,
      edges,
      exchanges,
      ...(narration !== undefined ? { narration } : {}),
      ...(gate !== undefined ? { gate } : {}),
      log,
      incidents,
      tokens,
      liveAgents: nodes.filter((n) => isLive(n) && isAgent(n)).length,
      screen,
      replacements,
      interactions,
      // Zero, and said out loud. It is the number the whole claim rests on:
      // "three hot replacements, no restart" is only worth something if the
      // second half is measured rather than assumed.
      restarts: 0,
      lastSequence: event.sequence,
    }),
    internal,
  }
}

/**
 * Edges follow from the declared names: who publishes, who consumes. Rebuilt
 * on every creation because a new node can close an edge left open.
 */
function rebuildEdges(
  nodes: readonly NodeView[],
  previous: readonly EdgeView[],
): readonly EdgeView[] {
  const byName = new Map<string, ComponentId>()
  for (const node of nodes) {
    for (const name of node.provides) if (!byName.has(name)) byName.set(name, node.id)
  }
  const edges: EdgeView[] = []
  for (const node of nodes) {
    for (const name of node.needs) {
      const source = byName.get(name)
      if (source === undefined || source === node.id) continue
      const before = previous.find((e) => e.from === source && e.to === node.id && e.name === name)
      edges.push(
        before ?? { from: source, to: node.id, name, hasTransited: false, kind: 'coeffect' },
      )
    }
  }
  // Parenthood, when nothing else links the child to its creator: without it,
  // an agent born from another would look like it fell from the sky.
  for (const node of nodes) {
    if (node.parent === undefined) continue
    if (edges.some((edge) => edge.from === node.parent && edge.to === node.id)) continue
    edges.push({
      from: node.parent,
      to: node.id,
      name: 'a créé',
      hasTransited: true,
      kind: 'parenthood',
    })
  }
  return edges
}
