// La porte d'entrée : une trace étrangère devient une archive interne.
//
// L'atelier promet « importe/rejoue la trajectoire d'un agent qui a planté ».
// Ici on détecte le format d'une trace (LangGraph, OTLP) et on délègue à
// l'adaptateur qui sait la traduire vers `RunArchive`. On ne devine jamais : un
// format non reconnu, ou reconnu mais cassé, est refusé avec une raison.
//
// Frontière d'honnêteté (AD-41/AD-49) : une trace importée est marquée
// `origin: 'foreign'`. Elle ne porte aucun `build.source`, donc rien n'est
// recompilable, donc elle est rejouable et mesurable mais **pas** forkable.

import type { RunArchive } from '../replay'
import { langgraphAdapter } from './langgraph'
import { otlpAdapter } from './otlp'

/** Un import qui a échoué : la raison est destinée à être montrée. */
export interface ImportError {
  ok: false
  reason: string
}

export type ImportResult = RunArchive | ImportError

/** Vrai quand l'import a échoué. `RunArchive` ne porte pas de champ `ok`. */
export const isImportError = (result: ImportResult): result is ImportError =>
  (result as ImportError).ok === false

/**
 * Un adaptateur de trace. `tryAdapt` rend :
 * - `undefined` quand l'entrée n'est pas de son format (l'entrée passe au suivant) ;
 * - un `ImportError` quand elle est de son format mais inexploitable ;
 * - un `RunArchive` quand elle a été traduite.
 */
export interface TraceAdapter {
  /** Nom de la source, pour les messages. */
  readonly source: string
  tryAdapt(input: unknown): ImportResult | undefined
}

/** Les adaptateurs connus, essayés dans l'ordre. */
const ADAPTERS: readonly TraceAdapter[] = [langgraphAdapter, otlpAdapter]

/**
 * Traduit une trace étrangère en `RunArchive` (version 1, `origin: 'foreign'`),
 * ou rend un `ImportError` si aucun adaptateur ne la reconnaît, ou si celui qui
 * la reconnaît ne peut pas la construire.
 */
export function importTrace(input: unknown): ImportResult {
  for (const adapter of ADAPTERS) {
    const result = adapter.tryAdapt(input)
    if (result !== undefined) return result
  }
  return { ok: false, reason: 'format de trace non reconnu' }
}
