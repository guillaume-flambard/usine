// Scénario « ClaimCheck » — conformité des allégations santé pour les
// compléments alimentaires. Donnée pure : aucune logique, aucun import du
// noyau ni de l'interface.

import {
  agentMaitre,
  architecte,
  constructeur,
  livraison,
  planificateur,
  sceptique,
} from '../agents/deterministes'
import { registreEu, type Regle } from '../outils/registre-eu'
import type { Scenario } from './types'

const REGLES: readonly Regle[] = [
  {
    motif: 'renforce les défenses naturelles',
    statut: 'a-verifier',
    source: 'Règlement (CE) 1924/2006, art. 10',
  },
  { motif: 'guérit', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
  { motif: 'soigne', statut: 'interdit', source: 'Règlement (CE) 1924/2006, art. 7' },
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
]

const BRIEF =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

export const claimCheck: Scenario = {
  cle: 'claim-check',
  titre: 'ClaimCheck',
  brief: BRIEF,
  maitre: {
    cle: 'a-maitre',
    composant: agentMaitre({ brief: BRIEF, secteur: 'compléments alimentaires — Europe' }),
  },
  casting: [
    { cle: 'b-registre', composant: registreEu(REGLES) },
    { cle: 'c-planificateur', composant: planificateur },
    { cle: 'd-architecte', composant: architecte },
    { cle: 'e-constructeur-regles', composant: constructeur('regles') },
    { cle: 'f-constructeur-interface', composant: constructeur('interface', 'Vue 3') },
    { cle: 'g-constructeur-tests', composant: constructeur('tests') },
    { cle: 'h-sceptique', composant: sceptique },
    { cle: 'i-livraison', composant: livraison },
  ],
  nomsReserves: [
    { nom: 'besoin', proprietaire: 'a-maitre' },
    { nom: 'memoire', proprietaire: 'a-maitre' },
    { nom: 'registre', proprietaire: 'b-registre' },
    { nom: 'histoires', proprietaire: 'c-planificateur' },
    { nom: 'specification', proprietaire: 'd-architecte' },
    { nom: 'sortie-regles', proprietaire: 'e-constructeur-regles' },
    { nom: 'sortie-interface', proprietaire: 'f-constructeur-interface' },
    { nom: 'sortie-tests', proprietaire: 'g-constructeur-tests' },
    { nom: 'objection', proprietaire: 'h-sceptique' },
    { nom: 'livrable', proprietaire: 'i-livraison' },
  ],
  // Le vérificateur n'est pas chargé au démarrage : il sera fabriqué à
  // l'exécution (story 2.2). Sa place est tenue d'avance pour que son
  // arrivée ne déplace aucun nœud déjà posé.
  emplacementsReserves: [
    {
      cle: 'j-verificateur',
      composant: {
        nom: 'verificateur-allegations',
        injecte: ['livrable', 'registre'],
        presentation: { role: 'Le produit livré — fabriqué pendant le run' },
        applique() {},
      },
    },
  ],
}
