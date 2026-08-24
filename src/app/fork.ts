// Hydrater un kernel vivant depuis le préfixe d'un flux conservé.
//
// C'est le seul substrat réellement neuf du fork (AD-49). Rejouer une archive
// (`replay.ts`) reconstruit un modèle de lecture, mais pas de kernel : les
// comportements y sont des isolats nus, sans `Context`, sans `load`, sans
// `replace`. Une branche a besoin de plus — d'un noyau vivant sur lequel un
// remplacement à chaud (AD-31) peut réellement opérer.
//
// L'hydratation n'est pas une nouvelle abstraction : c'est un **re-chargement**.
// Elle re-réduit le préfixe `[1..N]` pour retrouver les comportements vivants à
// N (AD-45), puis les recharge par la brique exacte qui les a créés pendant le
// run — `behaviourComponent` + `kernel.load`. Chemin v1 : comportements maison
// seulement (leur code voyage dans le flux) ; pas d'agents (leurs closures ne
// sont pas dans le flux), pas de traces étrangères.

import { createKernel, type Kernel } from '../runtime/kernel'
import { liveBehaviours } from '../orchestration/factory'
import { behaviourComponent, type Behaviour } from './behaviour'
import type { SpawnWorker } from './isolate'
import type { SourceFetcher } from './sources'
import { liveBehaviourSources, type RunArchive } from './replay'

/**
 * L'auteur affiché quand le flux n'en porte pas de fiable.
 *
 * `author` vit dans `build.specification`, en prose libre ; il n'est
 * qu'affiché, jamais load-bearing. Faute de champ sûr, on met un libellé neutre
 * plutôt que d'inventer un nom (Design Notes de la story).
 */
const REPLAYED_AUTHOR = 'run rejoué'

export interface HydrateOptions {
  /**
   * Le point de fork N : n'hydrater que les comportements vivants à
   * `sequence <= stopAt`. Absent, on hydrate à la fin du flux (tout le run).
   */
  stopAt?: number
  /** Comment un fil isolé est fabriqué. Absent dans le produit ; fourni par les tests. */
  spawnWorker?: SpawnWorker
  /**
   * Comment aller chercher une source. Absent, les comportements tournent purs,
   * comme un run hors ligne — aucun réseau n'est ouvert par l'hydratation.
   */
  fetchSource?: SourceFetcher
}

export interface HydratedKernel {
  kernel: Kernel
  behaviours: readonly Behaviour[]
}

/**
 * Matérialise un kernel vivant reflétant l'état des comportements maison à N.
 *
 * L'ensemble hydraté **égale** le modèle de lecture réduit sur `[1..N]` côté
 * comportements vivants (AD-45) : c'est la même réduction de préfixe qui les
 * détermine. Chaque comportement est rechargé comme composant racine — une
 * feuille sans enfant — de sorte que `kernel.replace` opère avec `parent = root`
 * et que la garantie d'AD-31 (« restaurer la version précédente avec ses
 * enfants ») reste atteignable sur la branche.
 *
 * @throws si un comportement vivant à N n'a aucune source dans le flux : il
 *   serait impossible à recompiler (Block If, condition « behaviour source
 *   missing in stream »). Le rejet a lieu **avant** toute création : rien n'est
 *   muté, aucun kernel n'est laissé à la traîne.
 */
export async function hydrateKernel(
  archive: RunArchive,
  options: HydrateOptions = {},
): Promise<HydratedKernel> {
  const { stopAt, spawnWorker, fetchSource } = options
  const specs = liveBehaviourSources(archive.events, stopAt)

  // Block If : un comportement vivant sans source est irrécupérable. On refuse
  // tout de suite, sans avoir touché au moindre isolat ni au moindre kernel.
  // Une source vide (`''`) est une source manquante : rien à recompiler.
  const orphan = specs.find((spec) => spec.source === undefined || spec.source === '')
  if (orphan !== undefined) {
    throw new Error(`behaviour source missing in stream: "${orphan.name}"`)
  }

  const kernel = createKernel()
  try {
    for (const spec of specs) {
      const made = await behaviourComponent(
        {
          name: spec.name,
          version: spec.version,
          // `source` ici est le **code** (le `build.source` du flux), pas une
          // source de données branchée : celle-ci n'est pas fiable dans le
          // flux, donc on hydrate un comportement pur (`BehaviourSpec.source`
          // absent).
          code: spec.source as string,
          author: REPLAYED_AUTHOR,
        },
        spawnWorker,
        fetchSource,
      )
      // Le code a compilé pendant le run. S'il refuse à l'hydratation, on ne
      // l'omet pas en silence : un comportement absent casserait l'invariant
      // « ensemble hydraté == read model réduit ». C'est fatal, symétrique du
      // Block If sur source manquante.
      if (!('component' in made)) {
        throw new Error(`behaviour failed to rehydrate: "${spec.name}"`)
      }
      await kernel.load(made.component)
    }
  } catch (cause) {
    // Un échec en cours de boucle laisserait un kernel à moitié construit et
    // ses isolats vivants : on démonte tout avant de relancer.
    await kernel.releaseAll()
    throw cause
  }

  return { kernel, behaviours: liveBehaviours(kernel) }
}
