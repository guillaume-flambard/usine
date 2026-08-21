// Public boundary of the composition kernel.
// No `cordis` type appears here: that is what lets the rest of the
// application ignore the engine entirely.

declare const componentIdBrand: unique symbol

/** Identifier of a live component. Only the kernel can mint one. */
export type ComponentId = string & { readonly [componentIdBrand]: true }

/** What a graph node shows of this component. */
export interface Display {
  /**
   * Short label shown inside the node. A component's `name` is its technical
   * identity and routinely overflows a 140 px box.
   */
  label?: string
  /** The role, in one line, as shown on hover. */
  role: string
  /**
   * The technology this component actually runs.
   * Leave empty when it runs none: a node never advertises a stack it does
   * not execute.
   */
  technology?: string
}

/**
 * What an agent actually wrote, readable by the visitor.
 * This is the antidote to "it's hollow": you must be able to open a node and
 * read what it produced.
 */
export interface Artifact {
  title: string
  /** The body, in French, readable by a non-technical person. */
  body: string
  /** What it follows from: the brief, the memory, or an upstream artifact. */
  derivedFrom?: string
}

/** What a human decision bears on. */
export interface DecisionSubject {
  /** What was produced, and is submitted for approval. */
  summary: string
  /** The objection raised before the gate. Without it the decision is empty. */
  objection: string
}

export type Decision = 'approved' | 'rejected'

/** Where a part built during the run came from, for inspection. */
export interface Build {
  /** The specification the part follows from, made readable. */
  specification: string
  /** The part's code, exactly as assembled and loaded. */
  source: string
  /** How it was produced. */
  route: 'composition' | 'evaluation'
}

/** Undoes an effect. Returned by the function passed to `effect`. */
export type Teardown = () => void

/**
 * What a component receives on activation. Deliberately narrow: this is what
 * prevents it from reaching the engine directly.
 *
 * Every method here is inert once the component is deactivated or released —
 * a component holding on to its facade past an `await` cannot surface an
 * error from the engine.
 */
export interface ComponentContext {
  /** This component's identifier. */
  readonly id: ComponentId
  /** Installs an effect and its inverse. The inverse runs on release. */
  effect(install: () => Teardown, label: string): void
  /** Publishes a value under a dependency name declared in `provides`. */
  provide(name: string, value: unknown): void
  /** Reads a dependency declared in `needs`. */
  read<T = unknown>(name: string): T | undefined
  /** Emits a message for the narration. */
  emit(message: string): void
  /** Signals that this component's work is done. */
  finish(): void
  /** Publishes a readable artifact, attributed to this component. */
  publishArtifact(artifact: Artifact): void
  /**
   * Declares a real token spend. The counter on screen only ever shows what
   * was actually spent — never an animation.
   */
  countTokens(input: number, output: number, failure?: string): void
  /**
   * Halts the run on a human decision. No delay crosses it: until someone
   * decides, nothing proceeds.
   */
  awaitDecision(subject: DecisionSubject, onDecision: (decision: Decision) => void): void
  /**
   * Loads a child component. Its release follows this component's.
   * Returns `undefined` when the load is refused — a dependency name already
   * taken, for instance.
   *
   * `build` marks a part produced at runtime: it is distinguished in the
   * graph and its code becomes readable.
   */
  load(component: Component, build?: Build): Promise<ComponentId | undefined>
  /**
   * Releases a component this one loaded. A component may only undo what it
   * did: without that bound, an agent could remove its own master and the run
   * would come apart from the middle.
   */
  release(child: ComponentId): Promise<boolean>
  /**
   * Replaces a component this one loaded. If the replacement fails, the
   * previous one is put back: a failed restructuring leaves no hole.
   */
  replace(
    child: ComponentId,
    replacement: Component,
    build?: Build,
  ): Promise<ComponentId | undefined>
  /**
   * Declares how this component answers questions addressed to it. With no
   * listener declared it is simply unreachable — a silence, not an error.
   */
  listen(answer: Answerer): void
  /**
   * Asks another component a question, by name, and waits for its answer.
   * Returns `undefined` if nobody carries that name, if the addressee is not
   * listening, or if the deadline passes.
   *
   * This is the system's only round trip: coeffects flow one way.
   */
  ask(addressee: string, question: string, timeoutMs?: number): Promise<string | undefined>
}

/** How a component answers when questioned. */
export type Answerer = (question: string, from: ComponentId) => Promise<string> | string

/**
 * An agent or a tool. Both have exactly the same shape.
 *
 * `apply` is **synchronous**. Asynchronous work starts from an effect, with
 * its teardown: a promise rejected outside `apply` would escape the kernel and
 * the component would be announced active when it is not.
 */
export interface Component {
  name: string
  /** Required dependency names. The component stays inactive while any is missing. */
  needs?: readonly string[]
  /** Dependency names this component publishes. */
  provides?: readonly string[]
  display: Display
  apply(context: ComponentContext): void
}

/** Every error crossing the kernel boundary takes this shape. */
export interface ComponentError {
  code: ErrorCode
  message: string
  /** Absent when the error precedes identifier allocation. */
  component?: ComponentId
  /** The name of the component concerned, always set. */
  name: string
}

export type ErrorCode =
  | 'name-already-provided'
  | 'activation-failed'
  | 'unknown-dependency'
  | 'load-failed'
  /** A stream subscriber threw. That is not the component's fault. */
  | 'subscriber-incident'

/** A component's lifecycle state, as the kernel knows it. */
export type ComponentState = 'pending' | 'active' | 'failed' | 'released'

/**
 * Why a component deactivated. Discriminated rather than textual: a
 * dependency name and a release must not be confusable.
 */
export type DeactivationCause =
  | { kind: 'dependency-gone'; names: readonly string[] }
  | { kind: 'release' }

/** A graph edge: who depends on what, under which name. */
export interface Dependency {
  from: ComponentId
  to: ComponentId
  name: string
}

/** A component as the topology describes it. */
export interface TopologyNode {
  id: ComponentId
  name: string
  state: ComponentState
  display: Display
  needs: readonly string[]
  provides: readonly string[]
  /** True once the component signalled its work is done. */
  finished: boolean
  /** The component that loaded it; absent when it came from the root. */
  parent?: ComponentId
}

/** Snapshot of the topology at a given instant. */
export interface Topology {
  components: readonly TopologyNode[]
  dependencies: readonly Dependency[]
}
