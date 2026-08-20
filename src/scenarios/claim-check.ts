// Scénario « ClaimCheck » — conformité des allégations santé pour les
// compléments alimentaires. Donnée pure : aucune logique, aucun import du
// noyau ni de l'interface.

import { agentMaitre } from '../agents/deterministes'
import { registreEu, type Regle } from '../outils/registre-eu'
import { castingStandard, emplacementDuProduit, nomsStandards } from './casting'
import type { Fabrique } from '../runtime/fabrique'
import type { Raisonneur } from '../runtime/raisonneur'
import type { Scenario } from './types'

const REGLES: readonly Regle[] = [
  // Allégations de santé autorisées — Règlement (UE) 432/2012, annexe.
  {
    motif: 'contribue au fonctionnement normal du système immunitaire',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue à réduire la fatigue',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue au maintien d’une ossature normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue à une fonction musculaire normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },
  {
    motif: 'contribue au maintien d’une vision normale',
    statut: 'autorise',
    source: 'Règlement (UE) 432/2012, annexe',
  },

  // Allégations thérapeutiques — interdites aux denrées alimentaires.
  { motif: 'guérit', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  { motif: 'soigne', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  { motif: 'traite', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  {
    motif: 'prévient la maladie',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    motif: 'remplace un traitement',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 7',
  },
  {
    motif: 'fait perdre du poids',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },
  {
    motif: 'recommandé par les médecins',
    statut: 'interdit',
    source: 'Règlement (CE) 1924/2006, art. 12',
  },

  // Formulations qui demandent une vérification au cas par cas.
  {
    motif: 'renforce les défenses naturelles',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    motif: 'détoxifie',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  {
    motif: 'anti-âge',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
]

const SECTEUR = 'compléments alimentaires — Europe'

const BRIEF =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

export const CONTACT = 'g.flambard@gmail.com'

const REGISTRE = registreEu(REGLES)

export const claimCheck: Scenario = {
  cle: 'claim-check',
  titre: 'ClaimCheck',
  brief: BRIEF,
  contact: CONTACT,
  produit: {
    titre: 'Vérificateur d’allégations santé',
    aide: 'Collez une copie marketing de complément alimentaire. Chaque allégation sera classée, avec la source réglementaire qui la justifie.',
  },
  maitre: {
    cle: 'a-maitre',
    composant: agentMaitre({ brief: BRIEF, secteur: SECTEUR }),
    construire: (brief: string, raisonneur?: Raisonneur, fabrique?: Fabrique) =>
      agentMaitre({ brief, secteur: SECTEUR }, raisonneur, fabrique),
  },
  casting: castingStandard(REGISTRE),
  nomsReserves: nomsStandards,
  emplacementsReserves: [emplacementDuProduit],
}
