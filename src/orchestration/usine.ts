// Le lancement d'un run. Il n'y a plus ni scénario ni plan : il y a un
// besoin, un maître, et ce que les agents en font.
//
// Ce fichier ne connaît aucun agent. Il ne fournit au maître que ce qu'un
// composant ne peut pas voir de lui-même : quand le chantier s'est stabilisé,
// et ce qui a réellement été publié.

import { maitreLibre } from '../agents/maitre'
import type { Budget } from '../agents/libre'
import type { IdComposant } from '../runtime/contrat'
import type { Noyau } from '../runtime/noyau'
import type { Raisonneur } from '../runtime/raisonneur'

export interface OptionsRun {
  brief: string
  raisonneur?: Raisonneur
  budget?: Budget
  /** Combien de temps un chantier peut rester en mouvement. */
  delaiStabilisationMs?: number
  /** Le pas entre deux vérifications de stabilité. Les tests le raccourcissent. */
  pasMs?: number
}

export interface Lancement {
  /** L'agent maître, dont la libération défait tout le run. */
  maitre: IdComposant
}

const DELAI_STABILISATION = 120_000
const PAS = 300
/** Trois vérifications de suite sans mouvement : le chantier est fini. */
const VERIFICATIONS_STABLES = 3

/**
 * Le chantier est stable quand plus aucun composant ne travaille et qu'aucun
 * n'est apparu depuis un moment. On ne peut pas le savoir autrement : un
 * agent peut en créer un autre à tout instant.
 */
function creerStabilisation(noyau: Noyau, options: OptionsRun) {
  return async function stabilise(delaiMs = options.delaiStabilisationMs ?? DELAI_STABILISATION) {
    const pas = options.pasMs ?? PAS
    const fin = Date.now() + delaiMs
    let stables = 0
    let empreinte = ''

    while (Date.now() < fin) {
      await new Promise((suite) => setTimeout(suite, pas))
      const composants = noyau.introspecter().composants
      // Le maître lui-même est en cours : c'est lui qui attend. On l'exclut,
      // sinon le chantier ne serait jamais déclaré stable.
      const autres = composants.filter((composant) => composant.nom !== 'agent-maitre')
      const travaille = autres.some((composant) => composant.etat === 'actif' && !composant.termine)
      const nouvelle = autres.map((composant) => `${composant.id}:${composant.etat}`).join(',')

      if (!travaille && nouvelle === empreinte) {
        stables += 1
        if (stables >= VERIFICATIONS_STABLES) return true
      } else {
        stables = 0
        empreinte = nouvelle
      }
    }
    return false
  }
}

export async function lancerUsine(noyau: Noyau, options: OptionsRun): Promise<Lancement> {
  const maitre = await noyau.charger(
    maitreLibre({
      brief: options.brief,
      ...(options.raisonneur !== undefined ? { raisonneur: options.raisonneur } : {}),
      ...(options.budget !== undefined ? { budget: options.budget } : {}),
      stabilise: creerStabilisation(noyau, options),
      produits: () => noyau.nomsPublies(),
    }),
  )
  if (maitre === undefined) {
    throw new Error("L'agent maître n'a pas pu être chargé : le run n'a pas commencé.")
  }
  return { maitre }
}

/**
 * Le produit du run : la première fonction publiée, quel que soit son nom.
 * On ne peut pas la chercher par un nom connu d'avance — personne ne le
 * connaît, pas même le maître avant que ses agents aient travaillé.
 */
export function produitDuRun(
  noyau: Noyau,
): { nom: string; executer: (entree: unknown) => unknown } | undefined {
  for (const nom of noyau.nomsPublies()) {
    const valeur = noyau.produit<unknown>(nom)
    if (typeof valeur === 'function') {
      return { nom, executer: valeur as (entree: unknown) => unknown }
    }
  }
  return undefined
}
