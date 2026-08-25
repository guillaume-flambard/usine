// Normaliser une trace étrangère vers le temps de l'atelier.
//
// Une source (LangGraph, OTLP) horodate en absolu. Le flux interne, lui, ne
// porte jamais de date absolue : seulement `at`, la durée écoulée depuis le
// début du run (AD-33). Ce module est la charnière : un adaptateur émet des
// étapes horodatées en absolu, on les ordonne, on ancre au premier stamp, et on
// attribue les `sequence` croissants que le réducteur suppose.

import type { RunEvent, WithoutSequence } from '../../runtime/events'

/** Une étape brute produite par un adaptateur : l'événement, et son heure absolue. */
export interface RawStep {
  /** Horodatage absolu en millisecondes (l'époque importe peu : seul l'écart compte). */
  at: number
  /** L'événement, sans `sequence`/`at`/`branchId` — le kernel les mintait, ici c'est nous. */
  event: WithoutSequence
}

/**
 * Ordonne les étapes par leur heure absolue, ancre au premier stamp, et rend un
 * flux `RunEvent` : `at` élapsé depuis l'ancre (jamais négatif, jamais une date),
 * `sequence` réattribué de 1 en croissant. Un flux vide reste vide.
 */
export function normalizeStream(steps: readonly RawStep[]): RunEvent[] {
  if (steps.length === 0) return []
  // Tri stable par heure : deux étapes au même instant gardent l'ordre d'émission
  // de l'adaptateur (création avant activation, par exemple).
  const ordered = [...steps].sort((a, b) => a.at - b.at)
  const anchor = ordered[0].at
  return ordered.map(
    (step, index): RunEvent =>
      ({
        ...step.event,
        sequence: index + 1,
        // `Math.max(0, …)` est une ceinture : le tri garantit déjà >= 0.
        at: Math.max(0, step.at - anchor),
      }) as RunEvent,
  )
}
