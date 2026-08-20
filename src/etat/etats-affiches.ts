// La fonction unique de dérivation. Tout ce qui affiche l'état d'un nœud
// passe par ici : sans ça, deux vues du même nœud finissent par diverger.

import type { EtatComposant } from '../runtime/contrat'
import type { EtatAffiche } from './modele'

/** Ce que le réducteur sait d'un nœud au moment de dériver son état. */
export interface SourceEtat {
  /** Le cycle de vie tel que le noyau le rapporte. */
  cycle: EtatComposant
  /** Le composant a-t-il signalé la fin de son travail. */
  termine: boolean
  /** Déclare-t-il au moins une dépendance. */
  injecteQuelqueChose: boolean
}

export function etatAffiche(source: SourceEtat): EtatAffiche {
  if (source.cycle === 'libere') return 'libere'
  if (source.cycle === 'en-erreur') return 'en-erreur'
  if (source.cycle === 'actif') return source.termine ? 'termine' : 'en-cours'
  // En attente : la nuance vient de ce que le composant déclare. Un composant
  // sans dépendance n'attend rien, il n'a simplement pas démarré.
  return source.injecteQuelqueChose ? 'en-attente-de-dependance' : 'inactif'
}
