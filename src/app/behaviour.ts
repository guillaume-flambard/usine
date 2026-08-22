// A behaviour: one unit of the application's logic, written by an agent.
//
// A behaviour is a component like any other, and that is the whole point. It
// owns the name it answers to, so replacing the component replaces the answer
// — through the kernel, with its rollback, rather than by swapping a pointer
// behind everyone's back. A pointer swap would be untestable and unrevertible;
// a component replacement is neither.
//
// Behaviour names live in their own namespace. An agent's `provides` carries
// what it publishes as a value; a behaviour carries what the screen can call.
// Keeping them apart means an agent can neither shadow a behaviour nor reserve
// its name by accident.

import type { Component, ComponentContext } from '../runtime/contract'
import { createIsolate, type Answer, type Isolate, type SpawnWorker } from './isolate'
import { wiredInput, type SourceFetcher } from './sources'

/** The coeffect name a behaviour answers to. */
export const behaviourKey = (name: string): string => `behaviour:${name}`

/** Reads a behaviour name back out of its coeffect name, if it is one. */
export const behaviourName = (key: string): string | undefined =>
  key.startsWith('behaviour:') ? key.slice('behaviour:'.length) : undefined

/** What a screen reaches when it calls a name. */
export interface Behaviour {
  readonly name: string
  /** Starts at 1, and only a replacement moves it. */
  readonly version: number
  call(input: string): Promise<Answer>
}

/** Recognises a published value as a behaviour, without trusting its shape. */
export function isBehaviour(value: unknown): value is Behaviour {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.call === 'function'
  )
}

export interface BehaviourSpec {
  name: string
  version: number
  code: string
  /** Who wrote it. Shown on the node, and in the code panel. */
  author: string
  /**
   * La source à laquelle il est branché, s'il l'est.
   *
   * Un comportement branché ne joint rien lui-même : le service va chercher,
   * et le comportement reçoit `{entree, donnees}` en JSON à la place du texte
   * brut. C'est ce qui lui permet de montrer autre chose que ce que le
   * visiteur a tapé, sans qu'il ait jamais de réseau.
   */
  source?: string
}

/**
 * Builds a behaviour component from code an agent wrote.
 *
 * Compilation happens **before** the component exists: code that does not
 * evaluate to a function must be refused as an action, not surface later as a
 * failed component. What the component owns is a live isolate, and its release
 * disposes it — a behaviour that goes away takes its thread with it.
 */
export async function behaviourComponent(
  spec: BehaviourSpec,
  spawn?: SpawnWorker,
  fetcher?: SourceFetcher,
): Promise<{ component: Component } | { failure: string }> {
  const made = await createIsolate(spec.code, spawn)
  if (!('isolate' in made)) return { failure: made.failure }

  return { component: componentFor(spec, made.isolate, fetcher) }
}

function componentFor(
  spec: BehaviourSpec,
  isolate: Isolate,
  fetcher?: SourceFetcher,
): Component {
  const wired = spec.source !== undefined && fetcher !== undefined
  const behaviour: Behaviour = {
    name: spec.name,
    version: spec.version,
    call: async (input) =>
      isolate.run(wired ? await wiredInput(spec.source as string, input, fetcher) : input),
  }

  return {
    name: `${spec.name}-v${spec.version}`,
    provides: [behaviourKey(spec.name)],
    display: {
      label: spec.name.slice(0, 26),
      role: wired
        ? `Comportement « ${spec.name} » v${spec.version}, branché sur « ${spec.source} », écrit par « ${spec.author} »`
        : `Comportement « ${spec.name} », version ${spec.version}, écrit par « ${spec.author} »`,
      technology: wired ? `fil isolé · ${spec.source}` : 'fil isolé',
    },
    apply(context: ComponentContext) {
      // The thread is an effect: releasing the component must take it with it,
      // otherwise a replaced behaviour would leave a worker running forever.
      context.effect(() => {
        return () => isolate.dispose()
      }, `fil isolé de « ${spec.name} »`)
      context.provide(behaviourKey(spec.name), behaviour)
      context.finish()
    },
  }
}
