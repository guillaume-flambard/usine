// The visitor's session: what they did with the application, and what it
// answered.
//
// This is the state the whole product hangs on. A hot replacement is only
// worth something if nothing here is lost when it happens — so it lives
// outside the frame and outside every component an agent can replace. An
// agent never touches it; the host writes it, and the screen reads a count.

/** One thing the visitor asked of the application, and what came back. */
export interface Interaction {
  /** Position in the session, starting at 1. Not a date: a run has no clock. */
  index: number
  /** The behaviour that was called. */
  name: string
  input: string
  /** Present when it answered. */
  output?: string
  /** Present instead when it refused, threw, or was stopped. */
  failure?: string
  /** Which version answered, when one did. */
  version?: number
}

/** What the visitor is told, and what the counter must never overstate. */
export interface SessionCounts {
  interactions: number
  /** Hot replacements that took. */
  replacements: number
  /** Restarts. Zero, and the point of saying it out loud. */
  restarts: number
}

export interface Session {
  readonly interactions: readonly Interaction[]
  readonly counts: SessionCounts
  record(entry: Omit<Interaction, 'index'>): Interaction
  /** Called when a replacement took. Nothing else may move this counter. */
  noteReplacement(): void
  /**
   * Called if the application were ever torn down and rebuilt. It exists so
   * the counter cannot lie by omission: if a restart ever happens, it shows.
   */
  noteRestart(): void
}

export function createSession(): Session {
  const interactions: Interaction[] = []
  let replacements = 0
  let restarts = 0

  return {
    get interactions() {
      return interactions
    },
    get counts(): SessionCounts {
      return { interactions: interactions.length, replacements, restarts }
    },
    record(entry) {
      const recorded: Interaction = { ...entry, index: interactions.length + 1 }
      interactions.push(recorded)
      return recorded
    },
    noteReplacement() {
      replacements += 1
    },
    noteRestart() {
      restarts += 1
    },
  }
}
