// The only file allowed to import `cordis` (ESLint rule `no-restricted-imports`).
// It translates the composition engine into a narrow contract and a sequenced
// event stream, and lets nothing of the engine leak past that line.

import { Context } from 'cordis'
import type {
  Answerer,
  Artifact,
  Build,
  Component,
  ComponentContext,
  ComponentError,
  ComponentId,
  ComponentState,
  DeactivationCause,
  Decision,
  DecisionSubject,
  Dependency,
  Teardown,
  Topology,
  TopologyNode,
} from './contract'
import type { MessageKind, RunEvent, Subscriber, WithoutSequence } from './events'

/** A component's shape as Cordis expects it. Internal, never exported. */
interface CordisPlugin {
  name: string
  inject?: string[]
  provide?: string[]
  apply(context: Context): void
}

interface Entry {
  id: ComponentId
  name: string
  component: Component
  state: ComponentState
  finished: boolean
  /** The component that loaded it, when it does not come from the root. */
  parent?: ComponentId
  /** True as soon as a release is requested, even before the fiber exists. */
  releaseRequested: boolean
  /** The release in flight, so a second call does not start another. */
  inFlight?: Promise<void>
  release: () => Promise<void>
}

export interface Kernel {
  /** Loads a component. Returns its id, or `undefined` if the load failed or was refused. */
  load(component: Component): Promise<ComponentId | undefined>
  /** Releases a component and, in cascade, everything it loaded. */
  release(id: ComponentId): Promise<void>
  /**
   * Hot-swaps a live component for a new version.
   * If the new version fails to load, the previous one is put back: a failed
   * self-modification does not leave the run amputated.
   */
  replace(
    id: ComponentId,
    replacement: Component,
    build?: Build,
  ): Promise<ComponentId | undefined>
  /** Releases the whole run, loads still in flight included. */
  releaseAll(): Promise<void>
  /** Snapshot of the live topology. */
  inspect(): Topology
  /**
   * Reads an output published by the run, so the application can consume what
   * was produced. This is a read, never a write: the interface does not take
   * part in the composition.
   */
  output<T = unknown>(name: string): T | undefined
  /**
   * Waits for a name to be published. Returns `true` if it was, `false` if the
   * deadline passed or the run was released meanwhile.
   *
   * This is what lets an agent that loads other agents advance at the pace of
   * real work rather than a timer: without it, a graph built at runtime would
   * appear all at once.
   */
  waitFor(name: string, timeoutMs?: number): Promise<boolean>
  /**
   * The names actually published at this instant. Without this, the
   * application could only consume what it knew in advance — which means
   * nothing once the graph is not known before the run.
   */
  providedNames(): readonly string[]
  /**
   * Settles a pending human gate. Returns `false` if no gate waits under that
   * id — a decision is not taken twice.
   */
  decide(id: ComponentId, decision: Decision): boolean
  /** The gates waiting for a decision, right now. */
  pendingGates(): readonly ComponentId[]
  /** Subscribes to the stream. Returns the unsubscribe function. */
  subscribe(subscriber: Subscriber): Teardown
}

export function createKernel(): Kernel {
  const root = new Context()
  const entries = new Map<ComponentId, Entry>()
  /** Who actually publishes which name. */
  const providers = new Map<string, ComponentId>()
  /**
   * A dependency name is reserved at load time, not at first publication: the
   * declaration is the contract. Otherwise two components declaring the same
   * name would both pass as long as neither had published yet.
   */
  const reservations = new Map<string, ComponentId>()
  const subscribers = new Set<Subscriber>()
  /** Those waiting for a name to be published. Cleared on release. */
  const waiters = new Map<string, Set<(published: boolean) => void>>()
  /** Who knows how to answer questions. A component with no listener is mute. */
  const listeners = new Map<ComponentId, Answerer>()
  /** Each component's Cordis context, to reload a child in the right place. */
  const contextByEntry = new Map<ComponentId, Context>()
  const replacementsInFlight = new Set<ComponentId>()
  /** The screen's revision. Owned by the kernel so no agent can rewind it. */
  let screenRevision = 0
  /** Human decisions in suspense. Nothing crosses them on its own. */
  const gates = new Map<ComponentId, (decision: Decision) => void>()
  /** What has already been settled. A decision is not taken twice. */
  const decisions = new Map<ComponentId, Decision>()
  let sequence = 0
  let counter = 0
  /** L'instant zéro du run. Lu une fois, jamais relu pendant un rejeu. */
  const startedAt = Date.now()

  /**
   * `WithoutSequence` is distributive: the parameter is the union of variants
   * minus `sequence`, so every call stays checked variant by variant. Only the
   * final recomposition needs an assertion.
   */
  function emit(event: WithoutSequence): void {
    if (queue !== undefined) {
      queue.push(event)
      return
    }
    sequence += 1
    broadcast({ ...event, sequence, at: Date.now() - startedAt } as RunEvent)
  }

  /**
   * During `apply`, a component's events are queued: nothing it produces may
   * be announced before its activation. A subscriber seeing "work finished"
   * before "active" could not build a coherent state from it.
   */
  let queue: WithoutSequence[] | undefined

  /**
   * A subscriber that throws must neither interrupt the others nor be confused
   * with a component fault: its incident becomes a separate event.
   */
  function broadcast(event: RunEvent): void {
    const incidents: string[] = []
    for (const subscriber of subscribers) {
      try {
        subscriber(event)
      } catch (cause) {
        incidents.push(cause instanceof Error ? cause.message : String(cause))
      }
    }
    if (event.type === 'subscriber-failed') return
    for (const message of incidents) {
      sequence += 1
      broadcast({ type: 'subscriber-failed', message, sequence, at: Date.now() - startedAt })
    }
  }

  function reportError(error: ComponentError): void {
    emit({ type: 'component-failed', error })
  }

  function takenName(component: Component): string | undefined {
    for (const name of component.provides ?? []) {
      if (reservations.has(name) || providers.has(name)) return name
    }
    return undefined
  }

  function releaseNames(id: ComponentId, names: readonly string[]): void {
    for (const name of names) {
      if (providers.get(name) === id) providers.delete(name)
      if (reservations.get(name) === id) reservations.delete(name)
    }
  }

  function deactivationCause(needs: readonly string[]): DeactivationCause {
    const missing = needs.filter((name) => !providers.has(name))
    return missing.length > 0 ? { kind: 'dependency-gone', names: missing } : { kind: 'release' }
  }

  function buildPlugin(component: Component, id: ComponentId, entry: Entry): CordisPlugin {
    const needs = [...(component.needs ?? [])]
    const provides = [...(component.provides ?? [])]

    return {
      name: component.name,
      ...(needs.length > 0 ? { inject: needs } : {}),
      ...(provides.length > 0 ? { provide: provides } : {}),
      apply(context: Context) {
        contextByEntry.set(id, context)
        // Sentinel: its inverse runs on every deactivation, whether it comes
        // from a dependency leaving or from a full release.
        context.effect(
          () => () => {
            // Neither a release nor a failure is requalified as pending.
            if (entry.state === 'released' || entry.state === 'failed') return
            entry.state = 'pending'
            emit({
              type: 'component-deactivated',
              id,
              cause: deactivationCause(needs),
            })
          },
          'sentinel',
        )

        /** True while the component may still act on the engine. */
        const usable = () => entry.state !== 'released' && entry.state !== 'failed'

        /** Marks the activation as failed: the component will not be announced active. */
        function fail(code: ComponentError['code'], message: string): void {
          entry.state = 'failed'
          reportError({ code, message, component: id, name: component.name })
        }

        const facade: ComponentContext = {
          id,
          effect(install: () => Teardown, label: string) {
            if (!usable()) return
            context.effect(install, label)
          },
          provide(name: string, value: unknown) {
            if (!usable()) return
            if (!provides.includes(name)) {
              fail(
                'unknown-dependency',
                `Le composant « ${component.name} » publie « ${name} » sans l'avoir déclaré.`,
              )
              return
            }
            if (providers.get(name) === id) {
              fail(
                'name-already-provided',
                `Le composant « ${component.name} » publie « ${name} » deux fois.`,
              )
              return
            }
            providers.set(name, id)
            const pending = waiters.get(name)
            if (pending !== undefined) {
              waiters.delete(name)
              for (const resume of pending) resume(true)
            }
            context.provide(name, value)
            context.effect(
              () => () => {
                if (providers.get(name) === id) providers.delete(name)
              },
              `provides:${name}`,
            )
          },
          read<T = unknown>(name: string): T | undefined {
            if (!usable()) return undefined
            if (!needs.includes(name)) {
              fail(
                'unknown-dependency',
                `Le composant « ${component.name} » lit « ${name} » sans l'avoir déclaré.`,
              )
              return undefined
            }
            // Non-strict read: the component is only active when all its
            // dependencies are provided, so the engine's guard would be
            // redundant and would throw instead of returning.
            const value = context.get(name, false) as T | undefined
            const source = providers.get(name)
            // Emitted even when the value is `undefined`: a published
            // undefined value is still a real transit.
            if (source !== undefined) {
              emit({ type: 'value-passed', from: source, to: id, name })
            }
            return value
          },
          emit(message: string, kind?: MessageKind) {
            if (!usable()) return
            emit({ type: 'message-emitted', id, message, ...(kind !== undefined ? { kind } : {}) })
          },
          finish() {
            if (!usable()) return
            entry.finished = true
            emit({ type: 'work-finished', id })
          },
          publishArtifact(artifact: Artifact) {
            if (!usable()) return
            emit({ type: 'artifact-published', id, artifact })
          },
          postScreen(markup: string) {
            if (!usable()) return screenRevision
            screenRevision += 1
            emit({ type: 'screen-posted', id, markup, revision: screenRevision })
            return screenRevision
          },
          countTokens(input: number, output: number, failure?: string) {
            if (!usable()) return
            emit({
              type: 'tokens-spent',
              id,
              input,
              output,
              ...(failure !== undefined ? { failure } : {}),
            })
          },
          awaitDecision(subject: DecisionSubject, onDecision: (decision: Decision) => void) {
            if (!usable()) return
            if (decisions.has(id)) {
              // A decision already taken is not replayed: reactivating the
              // component must not ask again.
              return
            }
            if (gates.has(id)) {
              fail('name-already-provided', 'Une porte attend déjà pour ce composant.')
              return
            }
            gates.set(id, onDecision)
            context.effect(
              () => () => {
                // An abandoned gate must withdraw visibly, otherwise the
                // interface keeps buttons that no longer do anything.
                if (gates.delete(id)) emit({ type: 'gate-withdrawn', id })
              },
              'gate',
            )
            emit({ type: 'gate-reached', id, subject })
          },
          load(child: Component, build?: Build) {
            if (!usable()) return Promise.resolve(undefined)
            return loadInto(context, child, id, build)
          },
          async release(child: ComponentId) {
            // A component only undoes what it did: without that bound, an
            // agent could remove its own master.
            if (!usable() || entries.get(child)?.parent !== id) return false
            await api.release(child)
            return true
          },
          async replace(child: ComponentId, replacement: Component, build?: Build) {
            if (!usable() || entries.get(child)?.parent !== id) return undefined
            return api.replace(child, replacement, build)
          },
          listen(answer: Answerer) {
            if (!usable()) return
            listeners.set(id, answer)
            context.effect(
              () => () => {
                listeners.delete(id)
              },
              'listen',
            )
          },
          async ask(addressee: string, question: string, timeoutMs = 30_000) {
            if (!usable()) return undefined
            const target = [...entries.values()].find(
              (other) => other.name === addressee && other.state === 'active' && other.id !== id,
            )
            const answer = target === undefined ? undefined : listeners.get(target.id)
            if (target === undefined || answer === undefined) return undefined

            emit({ type: 'question-asked', from: id, to: target.id, question })
            try {
              // Bounded: an answerer that never returns would freeze whoever
              // questions it, and the whole run behind them.
              const reply = await Promise.race([
                Promise.resolve(answer(question, id)),
                new Promise<undefined>((next) => setTimeout(() => next(undefined), timeoutMs)),
              ])
              if (reply === undefined) return undefined
              emit({ type: 'answer-given', from: target.id, to: id, answer: reply })
              return reply
            } catch (cause) {
              // An answer that throws is a silence, not a fault of the asker.
              const message = cause instanceof Error ? cause.message : String(cause)
              emit({
                type: 'message-emitted',
                id: target.id,
                message: `Ne peut pas répondre : ${message}`,
              })
              return undefined
            }
          },
        }

        // Nothing the component emits gets out before its activation.
        const parentQueue = queue
        queue = []
        try {
          component.apply(facade)
        } catch (cause) {
          fail('activation-failed', cause instanceof Error ? cause.message : String(cause))
        }
        const deferred = queue
        queue = parentQueue

        if (entry.state === 'failed') {
          // A component that failed does not keep the names it reserved:
          // otherwise no replacement could ever take its place.
          releaseNames(id, provides)
          // Chronological order: what the component said before falling is
          // replayed before the error itself.
          for (const event of deferred) emit(event)
          return
        }

        // Activation is only announced once `apply` passed without fault: a
        // failed component must never have been seen active.
        entry.state = 'active'
        emit({ type: 'component-activated', id })
        for (const event of deferred) emit(event)
      },
    }
  }

  async function loadInto(
    context: Context,
    component: Component,
    parent?: ComponentId,
    build?: Build,
  ): Promise<ComponentId | undefined> {
    const conflict = takenName(component)
    if (conflict !== undefined) {
      reportError({
        code: 'name-already-provided',
        message: `« ${conflict} » est déjà fourni par un autre composant.`,
        name: component.name,
      })
      return undefined
    }

    counter += 1
    const id = `${component.name}#${counter}` as ComponentId
    const provides = [...(component.provides ?? [])]
    for (const name of provides) reservations.set(name, id)

    const entry: Entry = {
      id,
      name: component.name,
      component,
      state: 'pending',
      finished: false,
      ...(parent !== undefined ? { parent } : {}),
      releaseRequested: false,
      // While the fiber does not exist, a requested release is remembered and
      // honoured as soon as the load completes.
      release: async () => {
        entry.releaseRequested = true
      },
    }
    entries.set(id, entry)

    emit({
      type: 'component-created',
      id,
      name: component.name,
      display: { ...component.display },
      needs: [...(component.needs ?? [])],
      provides,
      ...(parent !== undefined ? { parent } : {}),
    })

    if (build !== undefined && parent !== undefined) {
      emit({ type: 'component-built', id, parent, build })
    }

    let fiber: Awaited<ReturnType<Context['plugin']>>
    try {
      fiber = await context.plugin(buildPlugin(component, id, entry))
    } catch (cause) {
      entries.delete(id)
      releaseNames(id, provides)
      reportError({
        code: 'load-failed',
        message: cause instanceof Error ? cause.message : String(cause),
        component: id,
        name: component.name,
      })
      return undefined
    }

    entry.release = () => {
      if (entry.inFlight !== undefined) return entry.inFlight
      entry.inFlight = (async () => {
        if (!entries.has(id)) return
        // Children first, in reverse load order: the cascade is ours, not the
        // engine's, so that it can be awaited and therefore observed.
        for (const child of [...entries.values()].reverse()) {
          if (child.parent === id) await child.release()
        }
        entry.state = 'released'
        await fiber.dispose()
        releaseNames(id, provides)
        entries.delete(id)
        contextByEntry.delete(id)
        emit({ type: 'component-released', id })
      })()
      return entry.inFlight
    }

    if (entry.releaseRequested) {
      await entry.release()
      return undefined
    }
    return id
  }

  /**
   * Replaces a live entry. The children it had loaded are raised again first:
   * without that, a rollback would restore the part but not what it had built,
   * and the run would stay amputated — precisely the case this API promises to
   * cover.
   */
  async function performReplacement(
    entry: Entry,
    replacement: Component,
    build?: Build,
  ): Promise<ComponentId | undefined> {
    const id = entry.id
    const previous = entry.component
    const parent = entry.parent
    const parentContext = parent !== undefined ? (contextByEntry.get(parent) ?? root) : root
    const children = [...entries.values()]
      .filter((other) => other.parent === id)
      .map((other) => other.component)

    await entry.release()
    const fresh = await loadInto(parentContext, replacement, parent, build)
    // A version that loads but then falls into failure has not "taken".
    const failed = fresh !== undefined && entries.get(fresh)?.state === 'failed'
    if (fresh !== undefined && !failed) {
      // Emitted only here, once the new version has taken. A rollback leaves
      // no replacement event, because no replacement happened.
      emit({
        type: 'component-replaced',
        id: fresh,
        previous: id,
        name: replacement.name,
      })
      return fresh
    }

    if (fresh !== undefined) await entries.get(fresh)?.release()
    const restored = await loadInto(parentContext, previous, parent)
    if (restored === undefined) {
      reportError({
        code: 'load-failed',
        message: `Le retour arrière sur « ${previous.name} » a échoué : le run est amputé.`,
        name: previous.name,
      })
      return undefined
    }
    const restoredContext = contextByEntry.get(restored) ?? parentContext
    for (const child of children) await loadInto(restoredContext, child, restored)
    return undefined
  }

  // Named: a component's facade leans on it to release or replace a child,
  // without the component ever reaching the engine.
  const api: Kernel = {
    load(component: Component) {
      return loadInto(root, component)
    },
    async release(id: ComponentId) {
      const entry = entries.get(id)
      if (entry === undefined) return
      await entry.release()
    },
    async replace(id: ComponentId, replacement: Component, build?: Build) {
      const entry = entries.get(id)
      if (entry === undefined) return undefined
      // Two interleaved replacements would read the same entry.
      if (replacementsInFlight.has(id)) return undefined
      replacementsInFlight.add(id)
      try {
        return await performReplacement(entry, replacement, build)
      } finally {
        replacementsInFlight.delete(id)
      }
    },
    async releaseAll() {
      // Nobody will be waiting for anything any more: leaving a wait in flight
      // would keep a loading loop of the previous run alive.
      for (const pending of waiters.values()) {
        for (const resume of pending) resume(false)
      }
      waiters.clear()
      // One pass is not enough: a load still in flight registers afterwards.
      // We repeat as long as releasing moves something.
      let remaining = entries.size
      for (let pass = 0; pass < 10 && entries.size > 0; pass += 1) {
        for (const entry of [...entries.values()].reverse()) {
          await entry.release()
        }
        if (entries.size === remaining) break
        remaining = entries.size
      }
    },
    output<T = unknown>(name: string): T | undefined {
      // Non-strict: at rest or between two runs, absence is normal.
      return root.get(name, false) as T | undefined
    },
    providedNames(): readonly string[] {
      return [...providers.keys()]
    },
    waitFor(name: string, timeoutMs?: number): Promise<boolean> {
      if (providers.has(name)) return Promise.resolve(true)
      return new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (published: boolean) => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          waiters.get(name)?.delete(finish)
          resolve(published)
        }
        // Without a bound, an agent that died would freeze whoever loads the
        // rest forever: the run would stop with no screen saying so.
        const timer =
          timeoutMs === undefined ? undefined : setTimeout(() => finish(false), timeoutMs)
        const pending = waiters.get(name) ?? new Set<(published: boolean) => void>()
        pending.add(finish)
        waiters.set(name, pending)
      })
    },
    inspect(): Topology {
      const components: TopologyNode[] = [...entries.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        state: entry.state,
        display: { ...entry.component.display },
        needs: [...(entry.component.needs ?? [])],
        provides: [...(entry.component.provides ?? [])],
        finished: entry.finished,
        ...(entry.parent !== undefined ? { parent: entry.parent } : {}),
      }))
      const dependencies: Dependency[] = []
      for (const entry of entries.values()) {
        for (const name of entry.component.needs ?? []) {
          const source = providers.get(name)
          // A component that provides and consumes the same name does not link
          // to itself: that would be a cycle in the graph.
          if (source !== undefined && source !== entry.id) {
            dependencies.push({ from: source, to: entry.id, name })
          }
        }
      }
      return { components, dependencies }
    },
    decide(id: ComponentId, decision: Decision): boolean {
      const onDecision = gates.get(id)
      if (onDecision === undefined) return false
      gates.delete(id)
      decisions.set(id, decision)
      emit({ type: 'decision-made', id, decision })
      try {
        onDecision(decision)
      } catch (cause) {
        // A component that throws on learning the decision must not surface
        // the exception all the way up to the user's click.
        reportError({
          code: 'activation-failed',
          message: cause instanceof Error ? cause.message : String(cause),
          component: id,
          name: entries.get(id)?.name ?? 'gate',
        })
      }
      return true
    },
    pendingGates: () => [...gates.keys()],
    subscribe(subscriber: Subscriber): Teardown {
      subscribers.add(subscriber)
      return () => {
        subscribers.delete(subscriber)
      }
    },
  }

  return api
}
