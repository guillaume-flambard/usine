// Le pilote : tout ce qui fait vivre un run — le noyau, le store, la
// disposition — hors de tout composant Vue. C'est ce qui rend le câblage de
// l'application vérifiable sans navigateur.
//
// Il n'y a plus de scénario à choisir. Il y a un brief, et ce que l'usine
// en fait.

import { computed, shallowRef, type Ref } from 'vue'
import { disposerVivant, signatureTopologie, type Disposition } from '../etat/disposition'
import { creerStore, type StoreRun } from '../etat/store'
import { creerNoyau, type Noyau } from '../runtime/noyau'
import {
  raisonneurDeterministe,
  type OrigineRaisonnement,
  type Raisonneur,
} from '../runtime/raisonneur'
import type { Budget } from '../agents/libre'
import { lancerUsine, produitDuRun } from './usine'

/** Le produit d'un run : une fonction publiée, dont personne ne savait le nom. */
export interface ProduitLivre {
  nom: string
  executer: (entree: unknown) => unknown
}

export type PhaseRun =
  | 'Au repos'
  | 'Amorçage'
  | 'Construction'
  | 'Décision'
  | 'Écarté'
  | 'Terminé'
  | 'Incident'
  | 'Libéré'

export interface Pilote {
  readonly store: StoreRun
  /** La disposition du graphe tel qu'il est. Recalculée quand il pousse. */
  readonly disposition: Ref<Disposition>
  phase(): PhaseRun
  /** Vrai quand plus rien ne bougera sans une action humaine. */
  fini(): boolean
  erreur(): string | undefined
  demarrer(brief: string): Promise<void>
  /**
   * Branche un vrai modèle sur les agents qui raisonnent. Sans appel, le run
   * reste déterministe : aucune clé, aucun token, aucune requête.
   */
  brancher(raisonneur: Raisonneur | undefined): void
  /** Le mode de raisonnement en vigueur au prochain run. */
  modeRaisonnement(): OrigineRaisonnement
  arreter(): Promise<void>
  /** Approuve la porte en attente. Rend `false` si aucune n'attend. */
  approuver(): boolean
  /**
   * Écarte la porte en attente : la livraison n'aura pas lieu, et la pièce
   * fabriquée est libérée pour que le graphe montre la rétractation.
   */
  ecarter(): Promise<boolean>
  /**
   * Le produit livré, quand le run est allé jusqu'au bout. C'est la
   * fonction que la pièce fabriquée publie — l'application la consomme,
   * elle ne participe pas à la composition.
   */
  produit(): ProduitLivre | undefined
  /** Le noyau du run en cours, pour l'introspection. Absent au repos. */
  noyau(): Noyau | undefined
}

const DISPOSITION_VIDE: Disposition = {
  boites: new Map(),
  liens: [],
  largeur: 0,
  hauteur: 0,
}

export interface OptionsPilote {
  /** Ce qui borne un run libre : agents, profondeur, tours, tokens. */
  budget?: Budget
  /** Combien de temps un chantier peut rester en mouvement. */
  delaiStabilisationMs?: number
  /** Le pas entre deux vérifications de stabilité. Les tests le raccourcissent. */
  pasMs?: number
}

export function creerPilote(options: OptionsPilote = {}): Pilote {
  const store = creerStore()
  let noyauCourant: Noyau | undefined
  let debrancher: (() => void) | undefined
  let derniereErreur: string | undefined
  let demarrageEnCours = false
  let raisonneurCourant: Raisonneur = raisonneurDeterministe()

  // La disposition ne se recalcule que quand la topologie change : un
  // message ou un changement d'état n'a aucune raison de déplacer un nœud.
  const derniere = shallowRef<{ signature: string; disposition: Disposition }>({
    signature: '',
    disposition: DISPOSITION_VIDE,
  })
  const disposition = computed(() => {
    const { noeuds, aretes } = store.etat.value
    if (noeuds.length === 0) return DISPOSITION_VIDE
    const signature = signatureTopologie(noeuds, aretes)
    if (signature !== derniere.value.signature) {
      derniere.value = { signature, disposition: disposerVivant(noeuds, aretes) }
    }
    return derniere.value.disposition
  })

  const phase = (): PhaseRun => {
    const noeuds = store.etat.value.noeuds
    if (noeuds.length === 0) return 'Au repos'
    if (noeuds.every((n) => n.etat === 'libere')) return 'Libéré'
    const porte = store.etat.value.porte
    // Une porte en attente arrête le run : ce n'est ni une fin ni une panne.
    if (porte !== undefined && porte.decision === undefined) return 'Décision'
    // Un run écarté est arrêté, pas en cours : le dire « Construction »
    // laisserait croire qu'il travaille encore.
    if (porte?.decision === 'ecarte') return 'Écarté'
    // L'incident vient après la porte : tant qu'on attend une décision, dire
    // « Incident » et déclarer le run fini laisserait des boutons actifs sur
    // un run annoncé terminé.
    if (noeuds.some((n) => n.etat === 'en-erreur')) return 'Incident'
    if (noeuds.every((n) => n.etat === 'termine')) return 'Terminé'
    // Tant que le maître est seul, rien n'a encore été créé : dire
    // « Construction » laisserait croire que des agents travaillent.
    if (noeuds.length > 1) return 'Construction'
    return 'Amorçage'
  }

  async function arreter() {
    debrancher?.()
    debrancher = undefined
    await noyauCourant?.libererTout()
    noyauCourant = undefined
  }

  return {
    store,
    disposition,
    phase,
    fini: () => ['Terminé', 'Écarté', 'Libéré', 'Incident'].includes(phase()),
    erreur: () => derniereErreur,
    noyau: () => noyauCourant,
    produit() {
      // Seulement après une approbation : le produit n'est livré qu'une fois
      // la porte franchie, et écarter le retire.
      if (store.etat.value.porte?.decision !== 'approuve') return undefined
      // Ni depuis un run tombé en panne ou libéré : servir le produit d'un
      // run que le graphe montre en échec serait incohérent.
      if (phase() === 'Incident' || phase() === 'Libéré') return undefined
      // Le nom du produit n'est pas connu d'avance : on cherche ce qui a été
      // publié d'exécutable, quel que soit le nom que ses auteurs ont choisi.
      return noyauCourant === undefined ? undefined : produitDuRun(noyauCourant)
    },
    arreter,
    async demarrer(brief: string) {
      // Deux démarrages entrelacés partageraient le même noyau.
      if (demarrageEnCours) return
      demarrageEnCours = true
      try {
        await arreter()
        store.reinitialiser()
        derniereErreur = undefined
        noyauCourant = creerNoyau()
        debrancher = store.brancher(noyauCourant)
        await lancerUsine(noyauCourant, {
          brief,
          raisonneur: raisonneurCourant,
          ...(options.budget !== undefined ? { budget: options.budget } : {}),
          ...(options.delaiStabilisationMs !== undefined
            ? { delaiStabilisationMs: options.delaiStabilisationMs }
            : {}),
          ...(options.pasMs !== undefined ? { pasMs: options.pasMs } : {}),
        })
      } catch (cause) {
        derniereErreur = cause instanceof Error ? cause.message : String(cause)
        await arreter()
      } finally {
        demarrageEnCours = false
      }
    },
    approuver() {
      const porte = store.etat.value.porte
      if (porte === undefined || porte.decision !== undefined) return false
      return noyauCourant?.decider(porte.id, 'approuve') ?? false
    },
    async ecarter() {
      const porte = store.etat.value.porte
      if (porte === undefined || porte.decision !== undefined) return false
      // Le noyau est capturé : si l'utilisateur relance pendant la
      // rétractation, les identifiants restants viseraient le nouveau run.
      const noyau = noyauCourant
      if (noyau === undefined) return false
      if (!noyau.decider(porte.id, 'ecarte')) return false
      // Écarter doit se voir : les pièces fabriquées sont libérées, et le
      // graphe montre la rétractation au lieu de se figer.
      for (const noeud of store.etat.value.noeuds) {
        if (noyauCourant !== noyau) return true
        if (noeud.fabrication === undefined || noeud.etat === 'libere') continue
        try {
          await noyau.liberer(noeud.id)
        } catch {
          // Une libération qui échoue n'interrompt pas la rétractation des
          // autres pièces.
        }
      }
      return true
    },
    brancher(raisonneur: Raisonneur | undefined) {
      raisonneurCourant = raisonneur ?? raisonneurDeterministe()
    },
    modeRaisonnement: () => raisonneurCourant.origine,
  }
}
