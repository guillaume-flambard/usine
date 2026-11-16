/**
 * How a gate is worded on screen (MEM-86): the tool an action would call, and
 * the one question the person answers. Shared by the graph's knot and the
 * inspector's gate card, so the two never disagree.
 */
import type { GateView } from './readModel'

type Action = GateView['actions'][number]

/** The tool behind an action: `github/issue_write` gives `issue_write`. */
export function toolOf(action: Action): string {
  return action.target.split('/').pop() || action.target
}

const QUESTIONS: Record<string, string> = {
  issue_write: 'J’ouvre cette issue ?',
  create_issue: 'J’ouvre cette issue ?',
  create_pull_request: 'J’ouvre cette pull request ?',
}

const BY_KIND: Record<string, string> = {
  send: 'J’envoie ce message ?',
  pull_request: 'J’ouvre cette pull request ?',
}

/** The question of the gate, in the voice of the person who decides. */
export function gateQuestion(gate: GateView | undefined): string {
  const first = gate?.actions[0]
  if (!first) return 'Je laisse partir cette action ?'
  return QUESTIONS[toolOf(first)] ?? BY_KIND[first.kind] ?? 'Je laisse partir cette action ?'
}

export const ACTION_KINDS: Record<string, string> = {
  external_write: 'Écriture externe',
  send: 'Envoi',
  pull_request: 'Pull request',
}

/** Seconds, the French way: 1,2 s. */
export function secondsText(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} s`
}
