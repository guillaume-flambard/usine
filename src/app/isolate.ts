// The host side of the isolated thread.
//
// It owns one worker per behaviour and holds the only thing the worker cannot
// hold for itself: the clock. A behaviour that never returns is stopped from
// here, because a worker cannot interrupt its own loop.
//
// After a stop the isolate rebuilds itself with the same code. That is the
// honest outcome: the *call* was abandoned, the behaviour still exists, and
// the next input deserves a chance.

const DEFAULT_TIMEOUT_MS = 2_000

export interface Answer {
  output?: string
  failure?: string
}

export interface Isolate {
  /** Runs the behaviour on one input. Never rejects: a failure is an answer. */
  run(input: string, timeoutMs?: number): Promise<Answer>
  /** Releases the worker. Calling `run` afterwards answers with a failure. */
  dispose(): void
}

/** How a worker is made. Overridable so tests can watch what happens. */
export type SpawnWorker = () => Worker

const defaultSpawn: SpawnWorker = () =>
  new Worker(new URL('./behaviour-worker.ts', import.meta.url), { type: 'module' })

/**
 * Compiles and holds one behaviour.
 *
 * The returned promise settles when the worker has accepted the code — or
 * refused it, in which case the isolate is `undefined` and the caller knows
 * the behaviour never existed rather than discovering it on first use.
 */
export async function createIsolate(
  code: string,
  spawn: SpawnWorker = defaultSpawn,
): Promise<{ isolate: Isolate } | { failure: string }> {
  let worker: Worker | undefined
  let disposed = false
  let nextCall = 1
  const pending = new Map<number, (answer: Answer) => void>()

  const attach = (fresh: Worker): void => {
    fresh.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: string; call?: number } | undefined
      if (typeof message !== 'object' || message === null) return
      if (message.type !== 'settled' || typeof message.call !== 'number') return
      const settle = pending.get(message.call)
      if (settle === undefined) return
      pending.delete(message.call)
      const answer = message as { output?: unknown; failure?: unknown }
      settle({
        ...(typeof answer.output === 'string' ? { output: answer.output } : {}),
        ...(typeof answer.failure === 'string' ? { failure: answer.failure } : {}),
      })
    })
  }

  const compile = async (fresh: Worker): Promise<string | undefined> =>
    new Promise((resolve) => {
      const onMessage = (event: MessageEvent<unknown>): void => {
        const message = event.data as { type?: string; failure?: unknown } | undefined
        if (typeof message !== 'object' || message === null || message.type !== 'defined') return
        fresh.removeEventListener('message', onMessage)
        resolve(typeof message.failure === 'string' ? message.failure : undefined)
      }
      fresh.addEventListener('message', onMessage)
      fresh.addEventListener('error', () => resolve('le worker a échoué au chargement'), {
        once: true,
      })
      fresh.postMessage({ type: 'define', code })
    })

  const first = spawn()
  const failure = await compile(first)
  if (failure !== undefined) {
    first.terminate()
    return { failure }
  }
  attach(first)
  worker = first

  /** Rebuilds after a stop. The behaviour survives; the abandoned call does not. */
  const revive = async (): Promise<void> => {
    if (disposed) return
    const fresh = spawn()
    const refused = await compile(fresh)
    if (refused !== undefined || disposed) {
      fresh.terminate()
      return
    }
    attach(fresh)
    worker = fresh
  }

  return {
    isolate: {
      async run(input, timeoutMs = DEFAULT_TIMEOUT_MS) {
        if (disposed || worker === undefined) {
          return { failure: 'ce comportement a été retiré' }
        }
        const call = nextCall
        nextCall += 1
        const current = worker

        const answer = await new Promise<Answer>((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(call)
            // The only defence that actually works against an endless loop.
            current.terminate()
            if (worker === current) worker = undefined
            resolve({ failure: `arrêté : plus de ${timeoutMs} ms sans réponse` })
          }, timeoutMs)

          pending.set(call, (settled) => {
            clearTimeout(timer)
            resolve(settled)
          })
          current.postMessage({ type: 'run', call, input })
        })

        if (worker === undefined) await revive()
        return answer
      },
      dispose() {
        disposed = true
        pending.clear()
        worker?.terminate()
        worker = undefined
      },
    },
  }
}
