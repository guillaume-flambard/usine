// The Vue wrapper around the reducer. This is the only file in `src/state/`
// that knows Vue, and the only place where state is written.

import { readonly, shallowRef, type DeepReadonly, type Ref } from 'vue'
import type { Teardown } from '../runtime/contract'
import type { RunEvent } from '../runtime/events'
import type { Kernel } from '../runtime/kernel'
import type { RunState } from './model'
import { initialState, reduce, type FullState } from './reducer'

export interface RunStore {
  /** The displayable state, read-only. No component can write it. */
  readonly state: Readonly<Ref<DeepReadonly<RunState>>>
  /** Connects the store to a kernel. Returns the disconnect function. */
  connect(kernel: Kernel): Teardown
  /** Starts from an empty state, without touching the connection. */
  reset(): void
}

export function createStore(): RunStore {
  let full: FullState = initialState()
  const inner = shallowRef<RunState>(full.view)

  const apply = (event: RunEvent) => {
    full = reduce(full, event)
    inner.value = full.view
  }

  let disconnect: Teardown | undefined

  return {
    state: readonly(inner),
    connect(kernel: Kernel): Teardown {
      // A second connection without disconnecting would reduce every event
      // twice: duplicate nodes, duplicate log.
      disconnect?.()
      const stop = kernel.subscribe(apply)
      disconnect = () => {
        stop()
        disconnect = undefined
      }
      return disconnect
    },
    reset() {
      full = initialState()
      inner.value = full.view
    },
  }
}
