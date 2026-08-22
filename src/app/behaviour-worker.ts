// Where code written by a model actually runs.
//
// This file is a worker entry point, not a module the application imports. It
// has no document, no local storage, and — because the page never grants it
// one — no reason to reach the network. What it can still do is loop forever,
// and that is precisely why it lives here: a worker can be terminated, and a
// main thread cannot.
//
// One worker holds exactly one behaviour. Termination is therefore surgical:
// stopping a runaway call costs that behaviour's current run and nothing else.

/// <reference lib="webworker" />

/** Host to worker: the code this worker will hold, once. */
interface Define {
  type: 'define'
  code: string
}

/** Host to worker: run the held behaviour on one input. */
interface Run {
  type: 'run'
  call: number
  input: string
}

type Incoming = Define | Run

/** Worker to host. */
interface Settled {
  type: 'settled'
  call: number
  output?: string
  failure?: string
}

interface Defined {
  type: 'defined'
  failure?: string
}

/**
 * Removes what a behaviour has no business reaching before any of its code is
 * evaluated.
 *
 * A worker has no document, but it *does* have `fetch`, `WebSocket` and
 * `importScripts` — and the page's policy would happily allow a same-origin
 * call to the relay. Isolation therefore cannot rest on "a worker has no
 * network": the globals are taken away here, in the same realm the behaviour
 * will run in, so there is nothing left for it to reach for.
 */
function harden(): void {
  const globals = self as unknown as Record<string, unknown>
  for (const name of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'importScripts',
    'indexedDB',
    'caches',
    'Notification',
    'BroadcastChannel',
    'SharedWorker',
    'Worker',
    'navigator',
  ]) {
    // Most of these are not own properties of `self` — `fetch` lives on
    // `WorkerGlobalScope.prototype`. Deleting from `self` alone would leave
    // the prototype's copy in place, so the whole chain is walked first.
    let level: object | null = globals
    while (level !== null) {
      try {
        delete (level as Record<string, unknown>)[name]
      } catch {
        // Non-configurable: the own definition below shadows it instead.
      }
      level = Object.getPrototypeOf(level) as object | null
    }
    try {
      Object.defineProperty(globals, name, {
        value: undefined,
        writable: false,
        configurable: false,
      })
    } catch {
      // Already gone, or refused. `typeof` resolving to `undefined` is what
      // matters, and the deletion above has done it.
    }
  }
}

harden()

let behaviour: ((input: unknown) => unknown) | undefined

/** The longest answer a behaviour may hand back. Beyond, it is truncated. */
const MAX_OUTPUT = 20_000

/** Renders whatever comes out readable, whatever its shape. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // A cyclic or exotic value is not an incident: the behaviour answered,
    // we simply cannot render it as it stands.
    return String(value)
  }
}

const say = (message: Settled | Defined): void => {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message)
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data as Incoming | undefined
  if (typeof message !== 'object' || message === null) return

  if (message.type === 'define') {
    try {
      // The evaluation. It is confined to this file by an ESLint rule, and
      // this file is confined to a worker by never being imported elsewhere.
      const factory = new Function(`"use strict"; return (${message.code});`) as () => unknown
      const value = factory()
      if (typeof value !== 'function') {
        say({ type: 'defined', failure: "le code ne s'évalue pas en fonction" })
        return
      }
      behaviour = value as (input: unknown) => unknown
      say({ type: 'defined' })
    } catch (cause) {
      say({
        type: 'defined',
        failure: cause instanceof Error ? cause.message : String(cause),
      })
    }
    return
  }

  if (message.type === 'run') {
    if (behaviour === undefined) {
      say({ type: 'settled', call: message.call, failure: 'aucun comportement chargé' })
      return
    }
    try {
      const output = behaviour(message.input)
      // A behaviour may return a promise; awaiting it here keeps the host's
      // timeout the single authority on how long a call may take.
      if (output instanceof Promise) {
        void output.then(
          (value) => say({ type: 'settled', call: message.call, output: asText(value).slice(0, MAX_OUTPUT) }),
          (cause: unknown) =>
            say({
              type: 'settled',
              call: message.call,
              failure: cause instanceof Error ? cause.message : String(cause),
            }),
        )
        return
      }
      say({ type: 'settled', call: message.call, output: asText(output).slice(0, MAX_OUTPUT) })
    } catch (cause) {
      say({
        type: 'settled',
        call: message.call,
        failure: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }
})
