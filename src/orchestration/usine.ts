// Le lancement d'un run. Il n'y a plus de scénario à charger : il y a un
// brief, un maître, et ce que le maître décide d'en faire.
//
// Ce fichier ne connaît ni le graphe ni les agents. Il ne connaît que la
// suite fixe du run — la porte humaine et la livraison — qui n'est pas
// planifiable : un produit qui pourrait se livrer sans décision humaine ne
// serait plus le même produit.

import { livraison, porteHumaine } from '../agents/deterministes'
import { maitreDuPlan } from '../agents/planifies'
import type { IdComposant } from '../runtime/contrat'
import type { Fabrique } from '../runtime/fabrique'
import type { Noyau } from '../runtime/noyau'
import type { Raisonneur } from '../runtime/raisonneur'

export interface OptionsRun {
  brief: string
  raisonneur?: Raisonneur
  fabrique?: Fabrique
  /** Borne l'attente d'une vague. Les tests la raccourcissent. */
  delaiParVague?: number
}

/** La partie du run qui ne se planifie pas, dans l'ordre où elle se charge. */
export const SUITE_FIXE = [porteHumaine, livraison]

export interface Lancement {
  /** L'agent maître, dont la libération défait tout le run. */
  maitre: IdComposant
}

export async function lancerUsine(noyau: Noyau, options: OptionsRun): Promise<Lancement> {
  const maitre = await noyau.charger(
    maitreDuPlan({
      brief: options.brief,
      ...(options.raisonneur !== undefined ? { raisonneur: options.raisonneur } : {}),
      ...(options.fabrique !== undefined ? { fabrique: options.fabrique } : {}),
      ...(options.delaiParVague !== undefined ? { delaiParVague: options.delaiParVague } : {}),
      attendre: (nom, delaiMs) => noyau.attendre(nom, delaiMs),
      suite: SUITE_FIXE,
    }),
  )
  if (maitre === undefined) {
    throw new Error("L'agent maître n'a pas pu être chargé : le run n'a pas commencé.")
  }
  return { maitre }
}
