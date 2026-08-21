// A free agent's action vocabulary.
//
// An agent has no written behaviour: it has a mission, and on each turn it
// picks actions. This file defines what it is allowed to do, and above all how
// its answer is read — a model returns text, and that text is hostile data
// until proven otherwise.

/** Bring an agent into existence that did not exist. */
export interface CreateAction {
  type: 'create'
  name: string
  label: string
  role: string
  /** What it is asked to accomplish, in French. */
  mission: string
  needs: readonly string[]
  provides: readonly string[]
}

/** Ask a live agent a question and wait for its answer. */
export interface AskAction {
  type: 'ask'
  to: string
  question: string
}

/** Write a tool and load it hot. The code is real code. */
export interface BuildAction {
  type: 'build'
  name: string
  /** The name under which the tool will publish its function. */
  provides: string
  /** A JavaScript expression that evaluates to a function. */
  code: string
}

/** Publish a value under a name this agent is allowed to publish. */
export interface PublishAction {
  type: 'publish'
  name: string
  text: string
}

/** Remove an agent this one created. */
export interface RemoveAction {
  type: 'remove'
  name: string
}

/** Say something into the run's narration. */
export interface SayAction {
  type: 'say'
  message: string
}

/** This agent's work is done. */
export interface DoneAction {
  type: 'done'
  summary: string
}

export type Action =
  | CreateAction
  | AskAction
  | BuildAction
  | PublishAction
  | RemoveAction
  | SayAction
  | DoneAction

const text = (value: unknown, maximum: number): string =>
  typeof value === 'string' ? value.slice(0, maximum) : ''

const list = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 40))
    : []

const NAME = /^[a-z][a-z0-9-]{1,39}$/

/**
 * Rebuilds an action field by field. What does not hold its shape is discarded
 * here and nowhere else: further down, we handle code and hot loads.
 */
export function readAction(raw: unknown): Action | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const object = raw as Record<string, unknown>

  switch (object.type) {
    case 'create': {
      const name = text(object.name, 40)
      if (!NAME.test(name)) return undefined
      return {
        type: 'create',
        name,
        label: text(object.label, 28) || name,
        role: text(object.role, 140) || 'Rôle non précisé',
        mission: text(object.mission, 600),
        needs: list(object.needs),
        provides: list(object.provides).filter((n) => NAME.test(n)),
      }
    }
    case 'ask': {
      const to = text(object.to, 40)
      const question = text(object.question, 600)
      if (to.length === 0 || question.length === 0) return undefined
      return { type: 'ask', to, question }
    }
    case 'build': {
      const name = text(object.name, 40)
      const provides = text(object.provides, 40)
      const code = text(object.code, 8000)
      if (!NAME.test(name) || !NAME.test(provides) || code.trim().length === 0) return undefined
      return { type: 'build', name, provides, code }
    }
    case 'publish': {
      const name = text(object.name, 40)
      const value = text(object.text, 4000)
      if (name.length === 0) return undefined
      return { type: 'publish', name, text: value }
    }
    case 'remove': {
      const name = text(object.name, 40)
      return name.length === 0 ? undefined : { type: 'remove', name }
    }
    case 'say': {
      const message = text(object.message, 400)
      return message.length === 0 ? undefined : { type: 'say', message }
    }
    case 'done':
      return { type: 'done', summary: text(object.summary, 600) }
    default:
      return undefined
  }
}

/** Extracts the first JSON object from an answer, preamble included. */
export function jsonObject(raw: string): unknown {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('aucun objet JSON dans la réponse')
  return JSON.parse(raw.slice(start, end + 1))
}

export interface Turn {
  thought: string
  actions: readonly Action[]
}

/** Reads a whole turn. An unreadable action is discarded, not the whole turn. */
export function readTurn(raw: string): Turn {
  const parsed = jsonObject(raw)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error("la réponse n'est pas un objet")
  }
  const object = parsed as Record<string, unknown>
  const actions = Array.isArray(object.actions) ? object.actions : []
  return {
    thought: text(object.thought, 400),
    actions: actions.map(readAction).filter((action): action is Action => action !== undefined),
  }
}
