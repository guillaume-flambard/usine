// L'enveloppe Vue autour du réducteur. C'est le seul fichier de `src/etat/`
// qui connaît Vue, et le seul endroit où l'état est écrit.

import { readonly, shallowRef, type DeepReadonly, type Ref } from 'vue'
import type { Annulation } from '../runtime/contrat'
import type { EvenementRun } from '../runtime/evenements'
import type { Noyau } from '../runtime/noyau'
import type { EtatRun } from './modele'
import { etatInitial, reduire, type EtatComplet } from './reducteur'

export interface StoreRun {
  /** L'état affichable, en lecture seule. Aucun composant ne peut l'écrire. */
  readonly etat: Readonly<Ref<DeepReadonly<EtatRun>>>
  /** Branche le store sur un noyau. Rend la fonction de débranchement. */
  brancher(noyau: Noyau): Annulation
  /** Repart d'un état vide, sans toucher au branchement. */
  reinitialiser(): void
}

export function creerStore(): StoreRun {
  let complet: EtatComplet = etatInitial()
  const interne = shallowRef<EtatRun>(complet.vue)

  const appliquer = (evenement: EvenementRun) => {
    complet = reduire(complet, evenement)
    interne.value = complet.vue
  }

  let debrancher: Annulation | undefined

  return {
    etat: readonly(interne),
    brancher(noyau: Noyau): Annulation {
      // Un second branchement sans débranchement réduirait chaque événement
      // deux fois : nœuds en double, journal en double.
      debrancher?.()
      const annuler = noyau.abonner(appliquer)
      debrancher = () => {
        annuler()
        debrancher = undefined
      }
      return debrancher
    },
    reinitialiser() {
      complet = etatInitial()
      interne.value = complet.vue
    },
  }
}
