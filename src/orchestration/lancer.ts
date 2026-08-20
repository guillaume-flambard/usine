// Le pont entre un scénario (donnée) et le noyau (moteur). C'est le seul
// endroit qui connaît les deux, et il n'ajoute aucune décision : il vérifie
// la cohérence du scénario, puis charge.

import type { Composant, IdComposant } from '../runtime/contrat'
import type { Noyau } from '../runtime/noyau'
import type { EntreeCasting, Scenario } from '../scenarios/types'

export interface DefautScenario {
  code: 'nom-sans-proprietaire' | 'proprietaire-inconnu' | 'nom-non-declare' | 'cle-en-double'
  message: string
}

/**
 * Un scénario incohérent doit être refusé avant le run, pas découvert à
 * mi-parcours : les erreurs de déclaration ne se voient pas à l'exécution.
 */
export function verifierScenario(scenario: Scenario): readonly DefautScenario[] {
  const defauts: DefautScenario[] = []
  const entrees = [scenario.maitre, ...scenario.casting, ...scenario.emplacementsReserves]

  const cles = new Set<string>()
  for (const entree of entrees) {
    if (cles.has(entree.cle)) {
      defauts.push({
        code: 'cle-en-double',
        message: `Clé de déclaration en double : ${entree.cle}.`,
      })
    }
    cles.add(entree.cle)
  }

  const parCle = new Map(entrees.map((entree) => [entree.cle, entree]))
  const reserves = new Map(scenario.nomsReserves.map((r) => [r.nom, r.proprietaire]))

  for (const { nom, proprietaire } of scenario.nomsReserves) {
    const entree = parCle.get(proprietaire)
    if (entree === undefined) {
      defauts.push({
        code: 'proprietaire-inconnu',
        message: `« ${nom} » est réservé à « ${proprietaire} », qui n'est pas au casting.`,
      })
      continue
    }
    if (!(entree.composant.fournit ?? []).includes(nom)) {
      defauts.push({
        code: 'nom-non-declare',
        message: `« ${proprietaire} » se voit réserver « ${nom} » mais ne le déclare pas.`,
      })
    }
  }

  for (const entree of entrees) {
    for (const nom of entree.composant.fournit ?? []) {
      if (reserves.get(nom) !== entree.cle) {
        defauts.push({
          code: 'nom-sans-proprietaire',
          message: `« ${entree.cle} » publie « ${nom} » sans en être déclaré propriétaire.`,
        })
      }
    }
  }

  return defauts
}

/** L'ordre de révélation : la clé de déclaration, jamais l'ordre d'arrivée. */
export const ordreDeclare = (entrees: readonly EntreeCasting[]): readonly EntreeCasting[] =>
  [...entrees].sort((a, b) => a.cle.localeCompare(b.cle))

export interface Lancement {
  /** L'agent maître, dont la libération défait tout le run. */
  maitre: IdComposant
  /** Ce qui a été chargé, dans l'ordre de déclaration. */
  charges: readonly IdComposant[]
}

/**
 * Charge le maître puis tout le casting, dans l'ordre de déclaration.
 * Les composants s'activent d'eux-mêmes quand leurs dépendances arrivent —
 * l'ordre de chargement ne pilote pas l'ordre d'activation.
 */
export async function lancer(noyau: Noyau, scenario: Scenario): Promise<Lancement> {
  const defauts = verifierScenario(scenario)
  if (defauts.length > 0) {
    throw new Error(
      `Scénario « ${scenario.cle} » incohérent :\n` +
        defauts.map((d) => `  - ${d.message}`).join('\n'),
    )
  }

  const maitre = await noyau.charger(scenario.maitre.composant)
  if (maitre === undefined) throw new Error("L'agent maître n'a pas pu être chargé.")

  const charges: IdComposant[] = [maitre]
  for (const entree of ordreDeclare(scenario.casting)) {
    const id = await noyau.charger(entree.composant)
    if (id !== undefined) charges.push(id)
  }
  return { maitre, charges }
}

/** La topologie complète déclarée, emplacements réservés compris. */
export const topologieDeclaree = (scenario: Scenario): readonly Composant[] =>
  ordreDeclare([scenario.maitre, ...scenario.casting, ...scenario.emplacementsReserves]).map(
    (entree) => entree.composant,
  )
