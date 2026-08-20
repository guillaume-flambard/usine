// Le casting standard : la chaîne de production, indépendante de la niche.
// Un scénario en hérite et ne décrit plus que sa source de vérité — c'est ce
// qui rend la retargetabilité structurelle plutôt que recopiée.

import {
  architecte,
  constructeur,
  constructeurFabricant,
  livraison,
  planificateur,
  porteHumaine,
  sceptique,
} from '../agents/deterministes'
import type { Composant } from '../runtime/contrat'
import type { EntreeCasting, NomReserve } from './types'

/** L'emplacement tenu d'avance pour la pièce fabriquée à l'exécution. */
export const emplacementDuProduit: EntreeCasting = {
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
}

/** Le casting, la source de vérité mise à part : elle change à chaque niche. */
export const castingStandard = (registre: Composant): readonly EntreeCasting[] => [
  { cle: 'b-registre', composant: registre },
  { cle: 'c-planificateur', composant: planificateur },
  { cle: 'd-architecte', composant: architecte },
  { cle: 'e-constructeur-regles', composant: constructeur('regles') },
  { cle: 'f-constructeur-interface', composant: constructeur('interface', 'Vue 3') },
  { cle: 'g-constructeur-tests', composant: constructeur('tests') },
  { cle: 'g2-constructeur-produit', composant: constructeurFabricant },
  { cle: 'h-sceptique', composant: sceptique },
  { cle: 'h2-porte', composant: porteHumaine },
  { cle: 'i-livraison', composant: livraison },
]

/** Qui publie quoi. Identique d'une niche à l'autre, par construction. */
export const nomsStandards: readonly NomReserve[] = [
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
]
