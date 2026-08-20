// Scénario « PubCheck » — allégations publicitaires trompeuses. Même moteur,
// même casting, même pièce fabriquée : seule la source de vérité change, et
// l'expert qui la signe. C'est ce que « retargetable » veut dire.

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
import type { Fabrique } from '../runtime/fabrique'
import type { Raisonneur } from '../runtime/raisonneur'
import type { Scenario } from './types'

const SECTEUR = 'publicité et pratiques commerciales — France'

const BRIEF =
  'Un outil qui repère les allégations publicitaires trompeuses dans les copies de marques.'

const REGLES: readonly Regle[] = [
  // Pratiques commerciales trompeuses — Code de la consommation.
  {
    motif: 'prix le plus bas garanti',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    motif: 'sans aucun risque',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },
  {
    motif: 'remboursé à 100 %',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    motif: 'garanti à vie',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-4',
  },
  {
    motif: 'résultats garantis',
    statut: 'interdit',
    source: 'Code de la consommation, art. L121-2',
  },

  // Superlatifs : licites seulement si la preuve est jointe.
  {
    motif: 'leader incontesté',
    statut: 'a-verifier',
    source: 'Code de la consommation, art. L121-1',
  },
  { motif: 'numéro un', statut: 'a-verifier', source: 'Code de la consommation, art. L121-1' },
  {
    motif: 'le moins cher du marché',
    statut: 'a-verifier',
    source: 'Code de la consommation, art. L121-1',
  },
  { motif: 'meilleur prix', statut: 'a-verifier', source: 'Code de la consommation, art. L121-1' },

  // Mentions licites, sous réserve d'exactitude.
  {
    motif: 'prix conseillé par le fabricant',
    statut: 'autorise',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    motif: 'offre valable jusqu’au',
    statut: 'autorise',
    source: 'Code de la consommation, art. L112-1',
  },
  {
    motif: 'dans la limite des stocks disponibles',
    statut: 'autorise',
    source: 'Code de la consommation, art. L121-4',
  },
]

const IDENTITE = {
  technologie: 'Code conso.',
  role: 'Source de vérité — pratiques commerciales',
}

export const pubCheck: Scenario = {
  cle: 'pub-check',
  titre: 'PubCheck',
  brief: BRIEF,
  contact: 'g.flambard@gmail.com',
  maitre: {
    cle: 'a-maitre',
    composant: agentMaitre({ brief: BRIEF, secteur: SECTEUR }),
    construire: (brief: string, raisonneur?: Raisonneur, fabrique?: Fabrique) =>
      agentMaitre({ brief, secteur: SECTEUR }, raisonneur, fabrique),
  },
  casting: [
    { cle: 'b-registre', composant: registreEu(REGLES, IDENTITE) },
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
    { nom: 'raisonneur', proprietaire: 'a-maitre' },
    { nom: 'registre', proprietaire: 'b-registre' },
    { nom: 'histoires', proprietaire: 'c-planificateur' },
    { nom: 'specification', proprietaire: 'd-architecte' },
    { nom: 'sortie-regles', proprietaire: 'e-constructeur-regles' },
    { nom: 'sortie-interface', proprietaire: 'f-constructeur-interface' },
    { nom: 'sortie-tests', proprietaire: 'g-constructeur-tests' },
    { nom: 'sortie-produit', proprietaire: 'g2-constructeur-produit' },
    { nom: 'objection', proprietaire: 'h-sceptique' },
    { nom: 'approbation', proprietaire: 'h2-porte' },
    { nom: 'livrable', proprietaire: 'i-livraison' },
    { nom: 'verificateur', proprietaire: 'j-verificateur' },
  ],
  emplacementsReserves: [
    {
      cle: 'j-verificateur',
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
