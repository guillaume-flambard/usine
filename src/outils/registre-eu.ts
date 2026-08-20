// Un outil : il ne décide rien, il publie une source de vérité. Changer de
// niche, c'est changer ce registre et l'expert qui le signe — pas le moteur.
import type { Composant } from '../runtime/contrat'

export interface Regle {
  motif: string
  statut: 'autorise' | 'interdit' | 'a-verifier'
  source: string
}

export interface Identite {
  /** Ce qui s'affiche sous le nom du nœud. */
  technologie: string
  /** Le rôle, en une ligne. */
  role: string
}

export const registreEu = (
  regles: readonly Regle[],
  identite: Identite = {
    technologie: 'registre EU',
    role: 'Source de vérité réglementaire',
  },
): Composant => ({
  nom: 'outil-registre',
  fournit: ['registre'],
  presentation: {
    libelle: 'Outil · registre',
    role: identite.role,
    technologie: identite.technologie,
  },
  applique(contexte) {
    // Une règle sans motif correspondrait à tout ; une règle tranchée sans
    // source produirait un verdict incitable. Les deux sont écartées ici,
    // pas découvertes sur un verdict faux.
    const valides = regles.filter(
      (regle) =>
        regle.motif.trim().length > 0 &&
        (regle.statut === 'a-verifier' || regle.source.trim().length > 0),
    )
    const ecartees = regles.length - valides.length
    contexte.emettre(
      `Charge ${valides.length} règles d'allégation` +
        (ecartees > 0 ? `, ${ecartees} écartée(s) comme inutilisables.` : '.'),
    )
    if (ecartees > 0) {
      contexte.publierArtefact({
        titre: 'Règles écartées',
        corps: `${ecartees} règle(s) du registre sont inutilisables : motif vide, ou verdict tranché sans source citable.`,
        decouleDe: 'le registre fourni',
      })
    }
    contexte.fournir('registre', { regles: valides })
    contexte.terminer()
  },
})
