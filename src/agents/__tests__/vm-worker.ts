// A stand-in for the isolated thread, for tests that run without a browser.
//
// It speaks the same protocol as `behaviour-worker.ts` and evaluates real
// code, so a node test still proves that what an agent wrote actually runs.
// What it does not reproduce is termination: stopping a runaway call needs a
// real worker, and that promise is proven in `isolate.browser.spec.ts`.
//
// Evaluation goes through `node:vm` rather than `new Function`, for the same
// reason production uses a worker: the code being run was written by a model,
// and it has no business sharing a scope with the test that loaded it.
import { createContext, runInContext } from 'node:vm'
import type { SpawnWorker } from '../../app/isolate'

type Listener = (event: { data: unknown }) => void

/** The slice of `Worker` that `createIsolate` actually uses. */
function fakeWorker(): Worker {
  const listeners = new Set<Listener>()
  let behaviour: ((input: unknown) => unknown) | undefined
  let stopped = false

  const say = (data: unknown): void => {
    if (stopped) return
    for (const listener of listeners) listener({ data })
  }

  const post = (message: unknown): void => {
    if (stopped) return
    const incoming = message as { type?: string; code?: string; call?: number; input?: string }

    if (incoming.type === 'define') {
      try {
        const value: unknown = runInContext(`(${incoming.code ?? ''})`, createContext({}))
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

    if (incoming.type === 'run') {
      const call = incoming.call ?? 0
      if (behaviour === undefined) {
        say({ type: 'settled', call, failure: 'aucun comportement chargé' })
        return
      }
      try {
        const output: unknown = behaviour(incoming.input ?? '')
        say({ type: 'settled', call, output: render(output) })
      } catch (cause) {
        say({
          type: 'settled',
          call,
          failure: cause instanceof Error ? cause.message : String(cause),
        })
      }
    }
  }

  return {
    postMessage: post,
    addEventListener: (type: string, listener: unknown) => {
      if (type === 'message') listeners.add(listener as Listener)
    },
    removeEventListener: (type: string, listener: unknown) => {
      if (type === 'message') listeners.delete(listener as Listener)
    },
    terminate: () => {
      stopped = true
      listeners.clear()
    },
  } as unknown as Worker
}

function render(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

export const spawnVmWorker: SpawnWorker = fakeWorker
