// Un outil : il ne décide rien, il publie une source de vérité.
import type { Composant } from '../runtime/contrat'

export interface Regle {
  motif: string
  statut: 'autorise' | 'interdit' | 'a-verifier'
  source: string
}

export const registreEu = (regles: readonly Regle[]): Composant => ({
  nom: 'outil-registre',
  fournit: ['registre'],
  presentation: { role: 'Source de vérité réglementaire', technologie: 'registre EU' },
  applique(contexte) {
    contexte.emettre(`Charge ${regles.length} règles d'allégation.`)
    contexte.fournir('registre', { regles })
    contexte.terminer()
  },
})
