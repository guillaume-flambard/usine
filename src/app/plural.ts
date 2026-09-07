// French agreement, in one place.
//
// The screen showed « 1 agents ont été créés » and « 0 remplacement(s) » in
// production. A parenthesised plural is a value posted by eye: the number is
// known, so the sentence can agree with it.

/**
 * Agrees a countable phrase with its number: `count(1, 'agent', 'agents')`
 * yields `1 agent`. French treats zero as singular.
 */
export function count(n: number, one: string, many: string): string {
  return `${n} ${Math.abs(n) < 2 ? one : many}`
}

/** Agrees a verb with a subject of `n`: `agree(1, 'a été créé', 'ont été créés')`. */
export function agree(n: number, one: string, many: string): string {
  return Math.abs(n) < 2 ? one : many
}
