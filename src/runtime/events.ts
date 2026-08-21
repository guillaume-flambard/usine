// The single channel. Everything the rest of the application learns about a
// run comes through here. Adding a visible fact means adding a variant.

import type {
  Artifact,
  Build,
  ComponentError,
  ComponentId,
  DeactivationCause,
  Decision,
  DecisionSubject,
  Display,
} from './contract'

interface Base {
  /** Strictly increasing, gapless, assigned by the kernel. */
  sequence: number
}

export interface ComponentCreated extends Base {
  type: 'component-created'
  id: ComponentId
  name: string
  display: Display
  needs: readonly string[]
  provides: readonly string[]
  /** Who brought it into existence. Absent for what orchestration loads. */
  parent?: ComponentId
}

export interface ComponentActivated extends Base {
  type: 'component-activated'
  id: ComponentId
}

export interface ComponentDeactivated extends Base {
  type: 'component-deactivated'
  id: ComponentId
  cause: DeactivationCause
}

export interface ComponentReleased extends Base {
  type: 'component-released'
  id: ComponentId
}

export interface ComponentFailed extends Base {
  type: 'component-failed'
  error: ComponentError
}

export interface MessageEmitted extends Base {
  type: 'message-emitted'
  id: ComponentId
  message: string
}

export interface WorkFinished extends Base {
  type: 'work-finished'
  id: ComponentId
}

export interface ValuePassed extends Base {
  type: 'value-passed'
  from: ComponentId
  to: ComponentId
  name: string
}

export interface ArtifactPublished extends Base {
  type: 'artifact-published'
  id: ComponentId
  artifact: Artifact
}

export interface ComponentBuilt extends Base {
  type: 'component-built'
  id: ComponentId
  /** The component that built it. */
  parent: ComponentId
  build: Build
}

export interface GateReached extends Base {
  type: 'gate-reached'
  id: ComponentId
  subject: DecisionSubject
}

export interface TokensSpent extends Base {
  type: 'tokens-spent'
  id: ComponentId
  input: number
  output: number
  /** What made the agent fall back to its written answer, if anything. */
  failure?: string
}

export interface GateWithdrawn extends Base {
  type: 'gate-withdrawn'
  id: ComponentId
}

export interface DecisionMade extends Base {
  type: 'decision-made'
  id: ComponentId
  decision: Decision
}

/** A question addressed from one component to another. */
export interface QuestionAsked extends Base {
  type: 'question-asked'
  from: ComponentId
  to: ComponentId
  question: string
}

/** The answer to a question. `from` is whoever answers. */
export interface AnswerGiven extends Base {
  type: 'answer-given'
  from: ComponentId
  to: ComponentId
  answer: string
}

/** Emitted when a subscriber throws: the run continues, the incident shows. */
export interface SubscriberFailed extends Base {
  type: 'subscriber-failed'
  message: string
}

export type RunEvent =
  | ComponentCreated
  | ComponentActivated
  | ComponentDeactivated
  | ComponentReleased
  | ComponentFailed
  | MessageEmitted
  | WorkFinished
  | ValuePassed
  | ArtifactPublished
  | ComponentBuilt
  | TokensSpent
  | QuestionAsked
  | AnswerGiven
  | GateReached
  | GateWithdrawn
  | DecisionMade
  | SubscriberFailed

export type Subscriber = (event: RunEvent) => void

/**
 * An event before the kernel assigns its sequence number.
 * Distributive: without this, `Omit` would apply to the whole union and keep
 * only the common keys — the variants would stop being checked.
 */
export type WithoutSequence<T = RunEvent> = T extends RunEvent ? Omit<T, 'sequence'> : never
