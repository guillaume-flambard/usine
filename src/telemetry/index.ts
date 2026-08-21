// Telemetry, closed to four calls. No free parameter: impossible to slip user
// content in by accident. No cookie, no persistent identifier, no third party.
//
// This is the strict minimum that would make M1, M2 and C2 observable. Beyond
// that it is tracking, and it is refused.
//
// Nothing is measured while no transport is installed, and the shipped build
// installs none: see `deployment/README.md`.

/** The only four facts measured. */
export type Event = 'run-started' | 'gate-reached' | 'payoff-shown' | 'check-submitted'

export interface Transport {
  /** Sends a counter. No payload beyond the name. */
  count(event: Event): void
}

/** The default: nothing is measured while no transport is installed. */
const NONE: Transport = { count: () => {} }

let transport: Transport = NONE
/** A given fact is counted once per run. */
let alreadyCounted = new Set<Event>()

export function installTelemetry(next: Transport | undefined): void {
  transport = next ?? NONE
  // Facts that happened before installation are not caught up: we start clean
  // rather than counting halfway.
  newRun()
}

/** Starts from a blank slate: a new run recounts its four facts. */
export function newRun(): void {
  alreadyCounted = new Set()
}

const countOnce = (event: Event) => {
  if (alreadyCounted.has(event)) return
  alreadyCounted.add(event)
  transport.count(event)
}

export const runStarted = (): void => {
  // A new run starts from a blank slate, then counts its first fact through
  // the same path as the others: two quick clicks do not count as two distinct
  // launches of one run.
  newRun()
  countOnce('run-started')
}
export const gateReached = (): void => countOnce('gate-reached')
export const payoffShown = (): void => countOnce('payoff-shown')
export const checkSubmitted = (): void => countOnce('check-submitted')

/**
 * A transport with no cookie, no identifier and no request body: a plain
 * counting call to a self-hosted endpoint. `keepalive` so that closing the tab
 * does not lose the last fact.
 */
export function cookielessTransport(endpoint: string): Transport {
  return {
    count(event) {
      try {
        // `URL` rather than concatenation: an endpoint that already carries a
        // query would otherwise produce an invalid address.
        const address = new URL(endpoint, globalThis.location?.href ?? 'http://localhost')
        address.searchParams.set('e', event)
        void fetch(address, {
          method: 'POST',
          credentials: 'omit',
          cache: 'no-store',
          keepalive: true,
        }).catch(() => {
          // A lost measurement is not an incident: the product depends on no
          // measurement to work.
        })
      } catch {
        // `fetch` absent or throwing synchronously: same.
      }
    },
  }
}
