// La seule voie d'écriture de l'état. Pure : même suite d'événements,
// même état final. Rien d'autre dans l'application n'a le droit d'écrire.

import type { EtatComposant, IdComposant } from '../runtime/contrat'
import type { EvenementRun } from '../runtime/evenements'
import { etatAffiche } from './etats-affiches'
import type { AreteVue, EtatRun, MessageJournal, NoeudVue } from './modele'

/** Ce que le réducteur retient d'un nœud, au-delà de ce qui s'affiche. */
interface Interne {
  cycle: EtatComposant
  termine: boolean
}

/** L'état, plus la mémoire interne dont la dérivation a besoin. */
export interface EtatComplet {
  vue: EtatRun
  interne: ReadonlyMap<IdComposant, Interne>
}

export function etatInitial(): EtatComplet {
  return {
    vue: geler({
      noeuds: [],
      aretes: [],
      journal: [],
      incidents: [],
      agentsVivants: 0,
      derniereSequence: 0,
    }),
    interne: new Map(),
  }
}

const vivant = (noeud: NoeudVue) => noeud.etat !== 'libere' && noeud.etat !== 'en-erreur'

/**
 * La lecture seule n'est pas qu'une affaire de types : l'état est gelé, si
 * bien qu'un composant qui tenterait d'y pousser quelque chose échoue au
 * lieu de corrompre la vue en silence.
 */
function geler(vue: EtatRun): EtatRun {
  Object.freeze(vue.noeuds)
  Object.freeze(vue.aretes)
  Object.freeze(vue.journal)
  Object.freeze(vue.incidents)
  return Object.freeze(vue)
}

export function reduire(etat: EtatComplet, evenement: EvenementRun): EtatComplet {
  const interne = new Map(etat.interne)
  let noeuds = etat.vue.noeuds
  let aretes = etat.vue.aretes
  let journal = etat.vue.journal
  let incidents = etat.vue.incidents
  let narration = etat.vue.narration

  /** Remplace un nœud et redérive son état affiché. */
  const majNoeud = (
    id: IdComposant,
    modifier: (noeud: NoeudVue, memoire: Interne) => { noeud: NoeudVue; memoire: Interne },
  ) => {
    const index = noeuds.findIndex((n) => n.id === id)
    // Un événement portant un identifiant inconnu est ignoré : le store peut
    // s'être branché après le début du run.
    if (index === -1) return
    const avant = noeuds[index]
    const memoireAvant = interne.get(id)
    if (avant === undefined || memoireAvant === undefined) return
    const { noeud, memoire } = modifier(avant, memoireAvant)
    interne.set(id, memoire)
    const derive: NoeudVue = {
      ...noeud,
      etat: etatAffiche({
        cycle: memoire.cycle,
        termine: memoire.termine,
        injecteQuelqueChose: noeud.injecte.length > 0,
      }),
    }
    noeuds = noeuds.map((n, i) => (i === index ? derive : n))
  }

  switch (evenement.type) {
    case 'composant-cree': {
      interne.set(evenement.id, { cycle: 'en-attente', termine: false })
      const noeud: NoeudVue = {
        id: evenement.id,
        nom: evenement.nom,
        presentation: evenement.presentation,
        injecte: evenement.injecte,
        fournit: evenement.fournit,
        etat: etatAffiche({
          cycle: 'en-attente',
          termine: false,
          injecteQuelqueChose: evenement.injecte.length > 0,
        }),
        apparuA: evenement.sequence,
      }
      noeuds = [...noeuds, noeud]
      aretes = reconstruireAretes(noeuds, aretes)
      break
    }

    case 'composant-active':
      majNoeud(evenement.id, (noeud, memoire) => ({
        noeud: { ...noeud, cause: undefined },
        memoire: { ...memoire, cycle: 'actif' },
      }))
      break

    case 'travail-termine':
      majNoeud(evenement.id, (noeud, memoire) => ({
        noeud,
        memoire: { ...memoire, termine: true },
      }))
      break

    case 'composant-desactive':
      majNoeud(evenement.id, (noeud, memoire) => ({
        noeud: { ...noeud, cause: evenement.cause },
        memoire: { ...memoire, cycle: 'en-attente' },
      }))
      break

    case 'composant-en-erreur': {
      incidents = [...incidents, { sequence: evenement.sequence, erreur: evenement.erreur }]
      const id = evenement.erreur.composant
      // Un refus de chargement n'a pas d'identifiant : il n'y a aucun nœud à
      // mettre en défaut, seulement un incident à consigner.
      if (id !== undefined) {
        majNoeud(id, (noeud, memoire) => ({
          noeud: { ...noeud, erreur: evenement.erreur },
          memoire: { ...memoire, cycle: 'en-erreur' },
        }))
      }
      break
    }

    case 'composant-libere':
      majNoeud(evenement.id, (noeud, memoire) => ({
        noeud,
        memoire: { ...memoire, cycle: 'libere' },
      }))
      break

    case 'message-emis': {
      const auteur = noeuds.find((n) => n.id === evenement.id)?.nom ?? evenement.id
      const message: MessageJournal = {
        sequence: evenement.sequence,
        id: evenement.id,
        auteur,
        message: evenement.message,
      }
      journal = [...journal, message]
      // La narration est le message de plus haute séquence, point.
      if (narration === undefined || message.sequence > narration.sequence) narration = message
      break
    }

    case 'valeur-transmise':
      aretes = aretes.map((arete) =>
        arete.de === evenement.de && arete.vers === evenement.vers && arete.nom === evenement.nom
          ? { ...arete, aTransite: true, dernierTransit: evenement.sequence }
          : arete,
      )
      break

    case 'abonne-en-erreur':
      incidents = [
        ...incidents,
        {
          sequence: evenement.sequence,
          erreur: { code: 'echec-activation', message: evenement.message, nom: 'abonné' },
        },
      ]
      break
  }

  return {
    vue: geler({
      noeuds,
      aretes,
      ...(narration !== undefined ? { narration } : {}),
      journal,
      incidents,
      agentsVivants: noeuds.filter(vivant).length,
      derniereSequence: evenement.sequence,
    }),
    interne,
  }
}

/**
 * Les arêtes se déduisent des noms déclarés : qui publie, qui consomme.
 * Recalculées à chaque création parce qu'un nouveau nœud peut fermer une
 * arête restée ouverte.
 */
function reconstruireAretes(
  noeuds: readonly NoeudVue[],
  precedentes: readonly AreteVue[],
): readonly AreteVue[] {
  const parNom = new Map<string, IdComposant>()
  for (const noeud of noeuds) {
    for (const nom of noeud.fournit) if (!parNom.has(nom)) parNom.set(nom, noeud.id)
  }
  const aretes: AreteVue[] = []
  for (const noeud of noeuds) {
    for (const nom of noeud.injecte) {
      const source = parNom.get(nom)
      if (source === undefined || source === noeud.id) continue
      const avant = precedentes.find((a) => a.de === source && a.vers === noeud.id && a.nom === nom)
      aretes.push(avant ?? { de: source, vers: noeud.id, nom, aTransite: false })
    }
  }
  return aretes
}
