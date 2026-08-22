// The read model: what the interface displays, and nothing else.
// Produced exclusively by the reducer, never written anywhere else.

import type {
  Artifact,
  Build,
  ComponentError,
  ComponentId,
  DeactivationCause,
  Decision,
  DecisionSubject,
  Display,
} from '../runtime/contract'
import type { MessageKind } from '../runtime/events'

/**
 * The six states a node can show. The engine only knows four: `finished` and
 * `waiting-for-dependency` are readings, not lifecycle states.
 */
export type DisplayState =
  | 'idle'
  | 'waiting-for-dependency'
  | 'working'
  | 'finished'
  | 'failed'
  | 'released'

export interface NodeView {
  id: ComponentId
  name: string
  display: Display
  needs: readonly string[]
  provides: readonly string[]
  state: DisplayState
  /** The version this node replaced, when it took another's place. */
  replaces?: ComponentId
  /** Why it last deactivated, if it did. */
  cause?: DeactivationCause
  /** The error that put it in fault, if any. */
  error?: ComponentError
  /** What this component wrote, in its latest version. */
  artifact?: Artifact
  /** Set when the part was built during the run. */
  build?: Build
  /** The component that built it. */
  builtBy?: ComponentId
  /** True when this component actually called a model. */
  usedModel?: boolean
  /** What made it fall back to its written answer. */
  fallback?: string
  /** Sequence of its appearance — this is the reveal order. */
  appearedAt: number
  /** Who brought it into existence. This is what makes "an agent creates another" visible. */
  parent?: ComponentId
}

export interface EdgeView {
  from: ComponentId
  to: ComponentId
  name: string
  /**
   * What the edge tells: a value flowing, or a birth. Without the second, an
   * agent created by another would look like it fell from the sky.
   */
  kind?: 'coeffect' | 'parenthood'
  /** True as soon as a value actually transited. */
  hasTransited: boolean
  /** Sequence of the last transit, to animate the most recent one. */
  lastTransit?: number
}

/**
 * An exchange between two agents. This is the system's only round trip:
 * coeffects flow one way.
 */
export interface ExchangeView {
  from: ComponentId
  to: ComponentId
  question: string
  /** Absent while the addressee has not answered, or if it stayed mute. */
  answer?: string
  sequence: number
}

export interface LogMessage {
  sequence: number
  id: ComponentId
  author: string
  message: string
  /** Ce que le message est, quand ça compte. Voir `MessageKind`. */
  kind?: MessageKind
}

export interface LogIncident {
  sequence: number
  error: ComponentError
}

/** The human gate, as the interface must show it. */
export interface GateView {
  id: ComponentId
  subject: DecisionSubject
  /** `undefined` while nobody has decided. */
  decision?: Decision
  /** Sequence at which the gate opened. */
  openedAt: number
  /** Sequence at which it was settled. */
  settledAt?: number
}

export interface RunState {
  nodes: readonly NodeView[]
  edges: readonly EdgeView[]
  /** Questions asked from agent to agent, and their answers. */
  exchanges: readonly ExchangeView[]
  /** The highest-sequence message. A single line on screen. */
  narration?: LogMessage
  log: readonly LogMessage[]
  incidents: readonly LogIncident[]
  /** Present as soon as the run reaches the gate, and kept after the decision. */
  gate?: GateView
  /** Tokens actually spent. Stays at zero with no model connected. */
  tokens: { input: number; output: number }
  /** Number of nodes neither released nor failed. */
  liveAgents: number
  /**
   * The application's screen, as last posted. Empty until an agent posts one.
   * It lives here rather than in the worksite so a replayed run has it too.
   */
  screen: { markup: string; revision: number }
  /**
   * Hot replacements that took, and restarts. The second is there so the
   * first cannot be read as a boast: a counter that can only go up in one
   * direction says nothing.
   */
  replacements: number
  restarts: number
  /** Last sequence reduced. Used to spot a stream that skips. */
  lastSequence: number
}
