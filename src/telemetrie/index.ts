// La télémétrie, fermée à quatre appels. Aucun paramètre libre : impossible
// d'y glisser du contenu utilisateur par inadvertance. Sans cookie, sans
// identifiant persistant, sans tiers.
//
// C'est le strict minimum qui rendrait M1, M2 et C2 observables. Au-delà,
// c'est du suivi, et c'est refusé.
//
// Rien n'est mesuré tant qu'aucun transport n'est installé, et le build livré
// n'en installe aucun : voir `deploiement/README.md`.

/** Les quatre seuls faits mesurés. */
export type Evenement = 'run-lance' | 'porte-atteinte' | 'payoff-affiche' | 'verification-soumise'

export interface Transport {
  /** Envoie un compteur. Aucune charge utile en dehors du nom. */
  compter(evenement: Evenement): void
}

/** Le défaut : on ne mesure rien tant qu'aucun transport n'est installé. */
const AUCUN: Transport = { compter: () => {} }

let transport: Transport = AUCUN
/** Un même fait n'est compté qu'une fois par run. */
let dejaComptes = new Set<Evenement>()

export function installerTelemetrie(nouveau: Transport | undefined): void {
  transport = nouveau ?? AUCUN
  // Les faits déjà survenus avant l'installation ne seront pas rattrapés :
  // on repart proprement plutôt que de compter à moitié.
  nouveauRun()
}

/** Repart d'une page blanche : un nouveau run recompte ses quatre faits. */
export function nouveauRun(): void {
  dejaComptes = new Set()
}

const compterUneFois = (evenement: Evenement) => {
  if (dejaComptes.has(evenement)) return
  dejaComptes.add(evenement)
  transport.compter(evenement)
}

export const runLance = (): void => {
  // Un nouveau run repart d'une page blanche, puis compte son premier fait
  // par la même voie que les autres : deux clics rapides ne comptent pas deux
  // lancements distincts d'un même run.
  nouveauRun()
  compterUneFois('run-lance')
}
export const porteAtteinte = (): void => compterUneFois('porte-atteinte')
export const payoffAffiche = (): void => compterUneFois('payoff-affiche')
export const verificationSoumise = (): void => compterUneFois('verification-soumise')

/**
 * Un transport sans cookie, sans identifiant, sans corps de requête : un
 * simple appel de comptage vers un point d'entrée qu'on héberge soi-même.
 * `keepalive` pour que la fermeture d'onglet ne perde pas le dernier fait.
 */
export function transportSansCookie(point: string): Transport {
  return {
    compter(evenement) {
      try {
        // `URL` plutôt qu'une concaténation : un point d'entrée qui porte
        // déjà une requête produirait sinon une adresse invalide.
        const adresse = new URL(point, globalThis.location?.href ?? 'http://localhost')
        adresse.searchParams.set('e', evenement)
        void fetch(adresse, {
          method: 'POST',
          credentials: 'omit',
          cache: 'no-store',
          keepalive: true,
        }).catch(() => {
          // Une mesure perdue n'est pas un incident : le produit ne dépend
          // d'aucune mesure pour fonctionner.
        })
      } catch {
        // `fetch` absent ou levant en synchrone : idem.
      }
    },
  }
}
