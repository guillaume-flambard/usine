// The only language spoken across the frame boundary.
//
// The frame is sandboxed with an opaque origin: it cannot reach the host page,
// and the host cannot reach into it. Everything travels as a structured-cloned
// message, and both sides rebuild what they receive field by field — a message
// arriving from a frame that renders model-written markup is hostile data, the
// same way a model's answer is.

/** A screen, as an agent wrote it, before any sanitising. */
export interface MountScreen {
  type: 'mount-screen'
  /** Raw markup. The frame sanitises it; the host never trusts it. */
  markup: string
  /** Bumped on every screen replacement, so the frame can ignore a late one. */
  revision: number
}

/** Which names currently have a behaviour behind them. */
export interface SlotsChanged {
  type: 'slots-changed'
  /** Names a behaviour answers to, with the version now serving. */
  live: readonly { name: string; version: number }[]
}

/** The answer to one call, or the reason there is none. */
export interface CallSettled {
  type: 'call-settled'
  call: number
  /** Present when the behaviour answered. */
  output?: string
  /** Present instead when it refused, threw, or was stopped. */
  failure?: string
  /** Which version answered. Absent when nothing did. */
  version?: number
}

/** Host to frame. */
export type ToFrame = MountScreen | SlotsChanged | CallSettled

/** The frame reporting that it is mounted and ready to receive a screen. */
export interface FrameReady {
  type: 'frame-ready'
}

/** A visitor asked a named behaviour to run. */
export interface CallRequested {
  type: 'call-requested'
  /** Monotonic, assigned by the frame; the host echoes it back. */
  call: number
  name: string
  input: string
}

/** What the frame dropped while sanitising, so an agent can be told. */
export interface ScreenMounted {
  type: 'screen-mounted'
  revision: number
  /** Slot names the screen declares, whether or not they are live. */
  slots: readonly string[]
  /** Tags and attributes refused, deduplicated. Empty when nothing was cut. */
  refused: readonly string[]
}

/** Frame to host. */
export type FromFrame = FrameReady | CallRequested | ScreenMounted

/** The longest input a visitor may hand a behaviour. */
export const MAX_INPUT = 20_000

/** The longest answer a behaviour may hand back. */
export const MAX_OUTPUT = 20_000

/** The largest screen an agent may post. */
export const MAX_MARKUP = 40_000

const text = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit) : ''

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : -1

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/**
 * Rebuilds a message coming from the frame. Returns `undefined` rather than
 * throwing: a malformed message is a message that did not happen, not an
 * incident that should reach the run.
 */
export function readFromFrame(value: unknown): FromFrame | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const message = value as Record<string, unknown>

  if (message.type === 'frame-ready') return { type: 'frame-ready' }

  if (message.type === 'call-requested') {
    const call = count(message.call)
    const name = text(message.name, 64)
    if (call < 0 || name.length === 0) return undefined
    return { type: 'call-requested', call, name, input: text(message.input, MAX_INPUT) }
  }

  if (message.type === 'screen-mounted') {
    const revision = count(message.revision)
    if (revision < 0) return undefined
    return {
      type: 'screen-mounted',
      revision,
      slots: names(message.slots).slice(0, 64),
      refused: names(message.refused).slice(0, 64),
    }
  }

  return undefined
}

/**
 * Rebuilds a message coming from the host. The frame is the paranoid side too:
 * it is embedded in a page it does not control, and any window may post to it.
 */
export function readToFrame(value: unknown): ToFrame | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const message = value as Record<string, unknown>

  if (message.type === 'mount-screen') {
    const revision = count(message.revision)
    if (revision < 0) return undefined
    return { type: 'mount-screen', markup: text(message.markup, MAX_MARKUP), revision }
  }

  if (message.type === 'slots-changed') {
    const raw = Array.isArray(message.live) ? message.live : []
    const live: { name: string; version: number }[] = []
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue
      const slot = entry as Record<string, unknown>
      const name = text(slot.name, 64)
      const version = count(slot.version)
      if (name.length > 0 && version > 0) live.push({ name, version })
    }
    return { type: 'slots-changed', live }
  }

  if (message.type === 'call-settled') {
    const call = count(message.call)
    if (call < 0) return undefined
    const version = count(message.version)
    const settled: CallSettled = { type: 'call-settled', call }
    if (typeof message.output === 'string') settled.output = text(message.output, MAX_OUTPUT)
    if (typeof message.failure === 'string') settled.failure = text(message.failure, 400)
    if (version > 0) settled.version = version
    return settled
  }

  return undefined
}
