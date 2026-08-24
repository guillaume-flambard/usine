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
  /**
   * Milliseconds since the run started, assigned by the kernel.
   *
   * A duration, never a date. AD-33 forbids an absolute date — it would make
   * two replays of the same archive differ — but the elapsed time is recorded
   * once and travels with the event, so a replay reads it instead of reading
   * a clock. It is what turns a measurement into a duration and an archive
   * into a trace.
   */
  at: number
  /**
   * The branch this event belongs to, stamped by a branch's kernel (AD-43).
   *
   * Absent means the trunk. Every kernel numbers `sequence` from 1, so after a
   * fork the same number lives on the trunk prefix and on a branch at once; the
   * effective key of a post-fork event is `(branchId, sequence)`, not `sequence`
   * alone (AD-44). Optional so the whole existing stream — trunk, home runs,
   * v1 archives — stays valid and reduces exactly as before.
   */
  branchId?: string
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

/**
 * What an agent said, and — when it matters — what kind of thing it said.
 *
 * `kind` exists so that a measurement never has to match on French prose. An
 * evaluation that counted refusals by looking for a word would break the day
 * someone rephrased a message, and would break silently.
 */
export type MessageKind = 'refusal' | 'malformed' | 'rollback'

export interface MessageEmitted extends Base {
  type: 'message-emitted'
  id: ComponentId
  message: string
  kind?: MessageKind
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

/**
 * A live component was replaced by a new version, and the new one took.
 *
 * A visible fact deserves its own variant: this is the one the whole product
 * turns on, and deriving it from a build event plus a release event would
 * leave the interface guessing which pair belonged together. A replacement
 * that was rolled back does not produce this event — it did not happen.
 */
export interface ComponentReplaced extends Base {
  type: 'component-replaced'
  /** The component that took over. */
  id: ComponentId
  /** The one it replaced, already released by the time this is emitted. */
  previous: ComponentId
  /** The name they share. */
  name: string
}

/**
 * An agent posted the application's screen.
 *
 * The markup travels in the event rather than living beside the stream,
 * because AD-33 makes the stream the archive format: anything the interface
 * needs and that is not here would be missing from a replayed run, and the
 * screen is the first thing a replay would lose.
 */
export interface ScreenPosted extends Base {
  type: 'screen-posted'
  /** The agent that posted it. */
  id: ComponentId
  /** Raw markup, as written. Sanitising happens where it is rendered. */
  markup: string
  /** Starts at 1, and only a repost moves it. */
  revision: number
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

/**
 * The visitor used the live application, and what came back.
 *
 * This is the cause the product now records, not only the effect. A reactive
 * replacement is an agent's answer to one of these; putting the interaction in
 * the stream — verbatim input included — is what lets a replay reproduce the
 * same recomposition, since the stream is the archive format (AD-33). It
 * references no live object and carries only the exchange, as strings.
 */
export interface VisitorInteracted extends Base {
  type: 'visitor-interacted'
  /** The behaviour the visitor invoked. */
  name: string
  /** The input, verbatim, so a replay is faithful. */
  input: string
  /** Which version answered, when one did. */
  version?: number
  /** Present when it answered. */
  output?: string
  /** Present instead when it refused, threw, or was stopped. */
  failure?: string
}

/** Emitted when a subscriber throws: the run continues, the incident shows. */
export interface SubscriberFailed extends Base {
  type: 'subscriber-failed'
  message: string
}

/**
 * The first event of a branch: it forked from a trunk at a point N (AD-44).
 *
 * It carries `branchId` like every branch event, plus a reference to the trunk
 * it came from. Referencing an immutable recording by id and by N is allowed
 * (AD-44 nuances AD-33, which forbids referencing a *live* object): it is what
 * makes a branch archive self-describing.
 */
export interface BranchForked extends Base {
  type: 'branch-forked'
  /**
   * Always present here, unlike anywhere else. `branchId` is optional on `Base`
   * (absent = trunk), but the one event that opens a branch must carry it — it
   * is what makes the branch archive self-describing. A branch-forked without a
   * branchId is a contradiction, so the type forbids it.
   */
  branchId: string
  /** The recording (trunk) this branch was forked from, by its opaque id. */
  trunkId: string
  /** The `sequence` N on the trunk where the fork was taken (AD-36). */
  from: number
  /**
   * The `at` of event N on the trunk's time axis (AD-46). A branch kernel
   * restarts `at` near zero at the fork, so this offset is what later lets the
   * interface align the two panels' elapsed times. An elapsed duration, like
   * every `at` — never an absolute date (AD-33).
   */
  offset: number
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
  | ComponentReplaced
  | ScreenPosted
  | TokensSpent
  | QuestionAsked
  | AnswerGiven
  | GateReached
  | GateWithdrawn
  | DecisionMade
  | VisitorInteracted
  | SubscriberFailed
  | BranchForked

export type Subscriber = (event: RunEvent) => void

/**
 * An event before the kernel assigns its sequence number, its elapsed time, and
 * its branch stamp — all three are the kernel's to mint, never a caller's.
 * Distributive: without this, `Omit` would apply to the whole union and keep
 * only the common keys — the variants would stop being checked.
 */
export type WithoutSequence<T = RunEvent> = T extends RunEvent
  ? Omit<T, 'sequence' | 'at' | 'branchId'>
  : never
