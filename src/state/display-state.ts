// The single derivation function. Everything that displays a node's state
// goes through here: without it, two views of the same node end up diverging.

import type { ComponentState } from '../runtime/contract'
import type { DisplayState } from './model'

/** What the reducer knows about a node when deriving its state. */
export interface StateSource {
  /** The lifecycle as the kernel reports it. */
  lifecycle: ComponentState
  /** Has the component signalled its work is done. */
  finished: boolean
  /** Does it declare at least one dependency. */
  needsSomething: boolean
}

export function displayState(source: StateSource): DisplayState {
  if (source.lifecycle === 'released') return 'released'
  if (source.lifecycle === 'failed') return 'failed'
  if (source.lifecycle === 'active') return source.finished ? 'finished' : 'working'
  // Pending: the nuance comes from what the component declares. A component
  // with no dependency waits for nothing, it simply has not started.
  return source.needsSomething ? 'waiting-for-dependency' : 'idle'
}
