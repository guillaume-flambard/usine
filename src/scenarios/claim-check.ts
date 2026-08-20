// Scénario « ClaimCheck » — conformité des allégations santé pour les
// compléments alimentaires. Donnée pure : aucune logique, aucun import du
// noyau ni de l'interface.

import {
  agentMaitre,
  architecte,
  constructeur,
  constructeurFabricant,
  livraison,
  planificateur,
  porteHumaine,
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

const SECTEUR = 'compléments alimentaires — Europe'

const BRIEF =
  'Un outil de conformité des allégations santé pour marques de compléments alimentaires en Europe.'

export const claimCheck: Scenario = {
  cle: 'claim-check',
  titre: 'ClaimCheck',
  brief: BRIEF,
  maitre: {
    cle: 'a-maitre',
    composant: agentMaitre({ brief: BRIEF, secteur: SECTEUR }),
    construire: (brief: string) => agentMaitre({ brief, secteur: SECTEUR }),
  },
  casting: [
    { cle: 'b-registre', composant: registreEu(REGLES) },
    { cle: 'c-planificateur', composant: planificateur },
    { cle: 'd-architecte', composant: architecte },
    { cle: 'e-constructeur-regles', composant: constructeur('regles') },
    { cle: 'f-constructeur-interface', composant: constructeur('interface', 'Vue 3') },
    { cle: 'g-constructeur-tests', composant: constructeur('tests') },
    { cle: 'g2-constructeur-produit', composant: constructeurFabricant },
    { cle: 'h-sceptique', composant: sceptique },
    { cle: 'h2-porte', composant: porteHumaine },
    { cle: 'i-livraison', composant: livraison },
  ],
  nomsReserves: [
    { nom: 'besoin', proprietaire: 'a-maitre' },
    { nom: 'memoire', proprietaire: 'a-maitre' },
    { nom: 'fabrique', proprietaire: 'a-maitre' },
    { nom: 'registre', proprietaire: 'b-registre' },
    { nom: 'histoires', proprietaire: 'c-planificateur' },
    { nom: 'specification', proprietaire: 'd-architecte' },
    { nom: 'sortie-regles', proprietaire: 'e-constructeur-regles' },
    { nom: 'sortie-interface', proprietaire: 'f-constructeur-interface' },
    { nom: 'sortie-tests', proprietaire: 'g-constructeur-tests' },
    { nom: 'sortie-produit', proprietaire: 'g2-constructeur-produit' },
    { nom: 'verificateur', proprietaire: 'j-verificateur' },
    { nom: 'objection', proprietaire: 'h-sceptique' },
    { nom: 'approbation', proprietaire: 'h2-porte' },
    { nom: 'livrable', proprietaire: 'i-livraison' },
  ],
  // Le vérificateur n'est pas chargé au démarrage : il sera fabriqué à
  // l'exécution (story 2.2). Sa place est tenue d'avance pour que son
  // arrivée ne déplace aucun nœud déjà posé.
  emplacementsReserves: [
    {
      cle: 'j-verificateur',
      // Cette entrée ne réserve que la place et le nom : la vraie pièce est
      // fabriquée pendant le run par le constructeur produit.
      composant: {
        nom: 'verificateur-allegations',
        injecte: ['registre'],
        fournit: ['verificateur'],
        presentation: {
          libelle: 'Vérificateur',
          role: 'Le produit livré — fabriqué pendant le run',
        },
        applique() {},
      },
    },
  ],
}
