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

/** Write a behaviour of the application and load it hot. The code is real. */
export interface BuildAction {
  type: 'build'
  /** The name the screen calls. It is also the behaviour's own coeffect. */
  name: string
  /** A JavaScript expression that evaluates to a function. */
  code: string
  /**
   * Une source à laquelle brancher ce comportement, par son nom.
   *
   * Jamais une adresse : le nom est résolu côté service, dans une liste que
   * nous tenons. Branché, le comportement reçoit `{entree, donnees}` en JSON.
   */
  source?: string
}

/**
 * Replace a live behaviour with a new version, while it serves.
 *
 * This is the action the whole product turns on. It is deliberately separate
 * from `build`: writing something that did not exist and improving something
 * a visitor is using are not the same gesture, and an agent that confuses the
 * two should be refused rather than guessed at.
 */
export interface ReplaceAction {
  type: 'replace'
  /** A behaviour this agent built. It may not replace another's. */
  name: string
  code: string
  /** La source, comme pour `build`. Absente, le comportement est débranché. */
  source?: string
}

/** Post or repost the application's screen. Markup only, never logic. */
export interface ScreenAction {
  type: 'screen'
  markup: string
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
  | ReplaceAction
  | ScreenAction
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
    case 'build':
    case 'replace': {
      const name = text(object.name, 40)
      const code = text(object.code, 8000)
      if (!NAME.test(name) || code.trim().length === 0) return undefined
      const kind = object.type === 'build' ? ('build' as const) : ('replace' as const)
      const source = text(object.source, 40)
      return { type: kind, name, code, ...(NAME.test(source) ? { source } : {}) }
    }
    case 'screen': {
      const markup = text(object.markup, 40000)
      return markup.trim().length === 0 ? undefined : { type: 'screen', markup }
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
  /**
   * True when the provider cut its output at the budget. What the turn says
   * then stops mid-sentence, and only the caller knows whether an unfinished
   * sentence is publishable.
   */
  truncated?: boolean
}

/**
 * Lit un tour rendu en appels d'outils.
 *
 * C'est la voie fiable : le nom de l'action arrive dans son propre champ, hors
 * du corps JSON, donc aucun ordre de clés ne peut le brouiller. Le texte libre
 * du modèle devient sa pensée.
 */
export function readCalls(
  thought: string,
  calls: readonly { name: string; arguments: string }[],
): Turn {
  const actions: Action[] = []
  for (const call of calls) {
    let parsed: unknown
    try {
      parsed = call.arguments.trim().length === 0 ? {} : JSON.parse(call.arguments)
    } catch {
      // Des arguments illisibles font tomber l'action, pas le tour : les
      // autres appels du même tour restent bons.
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    const action = readAction({ ...(parsed as Record<string, unknown>), type: call.name })
    if (action !== undefined) actions.push(action)
  }
  return { thought: text(thought, 400), actions }
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
