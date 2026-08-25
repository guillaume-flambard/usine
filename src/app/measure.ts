// Mesurer un run côté client, pour comparer deux branches d'un fork.
//
// C'est le port TypeScript de `services/api/usine_api/evaluation.py::measure` :
// mêmes champs, mêmes règles, lues sur le seul flux. La version Python reste
// l'autorité pour les rapports d'ensemble sur les runs conservés ; ici on
// mesure **deux archives vivantes** (tronc et branche) sans service ni réseau —
// l'atelier reste gratuit et hors ligne, et « quelle branche est meilleure » se
// lit d'un écart mesuré, jamais d'un jugement (AD-40).

import { behaviourName } from './behaviour'
import type { RunArchive } from './replay'

/** Ce qu'on lit d'un run, sans jugement. Miroir de `RunMeasure` (Python). */
export interface RunMeasure {
  events: number
  agents: number
  /** Un run a produit une application quand un écran ET un comportement existent. */
  served: boolean
  replacements: number
  /** Remplacements refusés : la version fautive n'a pas pris, la précédente a servi. */
  rollbacks: number
  /**
   * Rang (1-based) du premier événement où l'application devient utilisable —
   * un rang dans le flux, pas un `sequence`, exactement comme le mesure Python.
   * Sans horloge : le flux ne porte pas de date absolue (AD-33).
   */
  firstScreenAt: number | null
  tokens: number
  malformed: number
}

/** L'écart d'un champ numérique entre tronc et branche. */
export interface MeasureDelta {
  trunk: number | null
  branch: number | null
  /** `branch - trunk` quand les deux sont des nombres ; `null` sinon. */
  delta: number | null
}

/**
 * Lit un run. Rien n'est déduit qui ne soit dans le flux — port fidèle de
 * `measure()` (Python) : `firstScreenAt` est un rang, `served` exige écran ET
 * comportement, `rollbacks` compte les messages classés « rollback ».
 */
export function measureRun(archive: RunArchive): RunMeasure {
  let agents = 0
  let replacements = 0
  let tokens = 0
  let malformed = 0
  let rollbacks = 0
  let screenAt: number | null = null
  let behaviourAt: number | null = null

  // Une boucle `for...of` plutôt qu'un `forEach` : les réaffectations de
  // `screenAt`/`behaviourAt` restent dans le flux de contrôle principal, si bien
  // que TypeScript garde leur type `number | null` et sait les affiner ensuite.
  for (const [index, event] of archive.events.entries()) {
    const rank = index + 1
    switch (event.type) {
      case 'component-created': {
        const isBehaviour = event.provides.some((name) => behaviourName(name) !== undefined)
        if (isBehaviour) {
          if (behaviourAt === null) behaviourAt = rank
        } else {
          agents += 1
        }
        break
      }
      case 'screen-posted':
        if (screenAt === null) screenAt = rank
        break
      case 'component-replaced':
        replacements += 1
        break
      case 'tokens-spent':
        tokens += (event.input || 0) + (event.output || 0)
        break
      case 'message-emitted':
        // Sur le champ `kind`, jamais sur la prose : une mesure qui chercherait
        // un mot casserait en silence le jour où on reformule un message.
        if (event.kind === 'malformed') malformed += 1
        else if (event.kind === 'rollback') rollbacks += 1
        break
      default:
        break
    }
  }

  // Servi = un écran ET un comportement. `firstScreenAt` est le rang du premier
  // moment où l'application devient utilisable. La condition affine les deux à
  // `number`, sans cast.
  let firstScreenAt: number | null = null
  if (screenAt !== null && behaviourAt !== null) {
    firstScreenAt = Math.max(screenAt, behaviourAt)
  }
  const served = firstScreenAt !== null

  return {
    events: archive.events.length,
    agents,
    served,
    replacements,
    rollbacks,
    firstScreenAt,
    tokens,
    malformed,
  }
}

/** L'écart d'un champ numérique entre deux mesures : `branch - trunk`. */
export function measureDelta(
  trunk: number | null,
  branch: number | null,
): MeasureDelta {
  const delta = typeof trunk === 'number' && typeof branch === 'number' ? branch - trunk : null
  return { trunk, branch, delta }
}
