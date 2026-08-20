// Scénario « PubCheck » — allégations publicitaires trompeuses. Même moteur,
// même casting, même pièce fabriquée : seule la source de vérité change, et
// l'expert qui la signe. C'est ce que « retargetable » veut dire.

import { agentMaitre } from '../agents/deterministes'
import { registreEu, type Regle } from '../outils/registre-eu'
import { castingStandard, emplacementDuProduit, nomsStandards } from './casting'
import { CONTACT } from './claim-check'
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

const REGISTRE_IDENTITE = {
  technologie: 'Code conso.',
  role: 'Source de vérité — pratiques commerciales',
}

const REGISTRE = registreEu(REGLES, REGISTRE_IDENTITE)

export const pubCheck: Scenario = {
  cle: 'pub-check',
  titre: 'PubCheck',
  brief: BRIEF,
  contact: CONTACT,
  produit: {
    titre: 'Vérificateur d’allégations publicitaires',
    aide: 'Collez une copie publicitaire. Chaque allégation sera classée, avec l’article du Code de la consommation qui la justifie.',
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
