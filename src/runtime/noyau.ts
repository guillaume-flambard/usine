// Seul fichier autorisé à importer `cordis` (règle ESLint `no-restricted-imports`).
// Il traduit le moteur de composition en un contrat français et un flux
// d'événements séquencés, et n'en laisse rien fuir au-delà.

import { Context } from 'cordis'
import type {
  Annulation,
  Composant,
  ContexteComposant,
  Dependance,
  ErreurComposant,
  EtatComposant,
  IdComposant,
  Topologie,
} from './contrat'
import type { Abonne, EvenementRun, SansSequence } from './evenements'

/** Forme d'un composant telle que Cordis l'attend. Interne, jamais exportée. */
interface PluginCordis {
  name: string
  inject?: string[]
  provide?: string[]
  apply(contexte: Context): void
}

interface Entree {
  id: IdComposant
  nom: string
  composant: Composant
  etat: EtatComposant
  termine: boolean
  /** Le composant qui l'a chargé, quand il ne vient pas de la racine. */
  parent?: IdComposant
  liberer: () => Promise<void>
}

export interface Noyau {
  /** Charge un composant. Rend son identifiant, ou `undefined` si le chargement a été refusé. */
  charger(composant: Composant): Promise<IdComposant | undefined>
  /** Libère un composant et, en cascade, tout ce qu'il a chargé. */
  liberer(id: IdComposant): Promise<void>
  /** Libère la totalité du run. */
  libererTout(): Promise<void>
  /** Photographie de la topologie vivante. */
  introspecter(): Topologie
  /** S'abonne au flux. Rend la fonction de désabonnement. */
  abonner(abonne: Abonne): Annulation
}

export function creerNoyau(): Noyau {
  const racine = new Context()
  const entrees = new Map<IdComposant, Entree>()
  const fournisseurs = new Map<string, IdComposant>()
  const abonnes = new Set<Abonne>()
  let sequence = 0
  let compteur = 0

  function emettre(evenement: SansSequence): void {
    sequence += 1
    const complet = { ...evenement, sequence } as EvenementRun
    for (const abonne of abonnes) abonne(complet)
  }

  function signalerErreur(erreur: ErreurComposant): void {
    emettre({ type: 'composant-en-erreur', erreur })
  }

  /**
   * Un nom de dépendance est réservé dès le chargement, pas à la première
   * publication : c'est la déclaration qui fait le contrat, sinon deux
   * composants déclarant le même nom passeraient tous les deux tant qu'aucun
   * n'a encore publié.
   */
  const reserves = new Map<string, IdComposant>()

  function nomsPris(composant: Composant): string | undefined {
    for (const nom of composant.fournit ?? []) {
      if (reserves.has(nom) || fournisseurs.has(nom)) return nom
    }
    return undefined
  }

  function construirePlugin(composant: Composant, id: IdComposant, entree: Entree): PluginCordis {
    const injecte = [...(composant.injecte ?? [])]
    const fournit = [...(composant.fournit ?? [])]

    return {
      name: composant.nom,
      ...(injecte.length > 0 ? { inject: injecte } : {}),
      ...(fournit.length > 0 ? { provide: fournit } : {}),
      apply(contexte: Context) {
        // Sentinelle : son inverse se joue à chaque désactivation, qu'elle vienne
        // du départ d'une dépendance ou d'une libération complète.
        contexte.effect(() => {
          return () => {
            if (entree.etat === 'libere') return
            entree.etat = 'en-attente'
            emettre({
              type: 'composant-desactive',
              id,
              cause: causeDeDesactivation(injecte),
            })
          }
        }, 'sentinelle')

        const facade: ContexteComposant = {
          id,
          effet(installer: () => Annulation, libelle: string) {
            contexte.effect(installer, libelle)
          },
          fournir(nom: string, valeur: unknown) {
            if (!fournit.includes(nom)) {
              signalerErreur({
                code: 'dependance-inconnue',
                message: `Le composant « ${composant.nom} » publie « ${nom} » sans l'avoir déclaré.`,
                composant: id,
              })
              return
            }
            fournisseurs.set(nom, id)
            contexte.provide(nom, valeur)
            contexte.effect(
              () => () => {
                if (fournisseurs.get(nom) === id) fournisseurs.delete(nom)
              },
              `fournit:${nom}`,
            )
          },
          lire<T = unknown>(nom: string): T | undefined {
            if (!injecte.includes(nom)) {
              signalerErreur({
                code: 'dependance-inconnue',
                message: `Le composant « ${composant.nom} » lit « ${nom} » sans l'avoir déclaré.`,
                composant: id,
              })
              return undefined
            }
            const valeur = contexte.get(nom, false) as T | undefined
            const source = fournisseurs.get(nom)
            if (valeur !== undefined && source !== undefined) {
              emettre({
                type: 'valeur-transmise',
                de: source,
                vers: id,
                nom,
              })
            }
            return valeur
          },
          emettre(message: string) {
            emettre({ type: 'message-emis', id, message })
          },
          terminer() {
            entree.termine = true
            emettre({ type: 'travail-termine', id })
          },
          charger(enfant: Composant) {
            return chargerDans(contexte, enfant, id)
          },
        }

        try {
          composant.applique(facade)
          // L'activation n'est annoncée qu'une fois `applique` passé : un
          // composant qui échoue ne doit jamais avoir été vu actif.
          entree.etat = 'actif'
          emettre({ type: 'composant-active', id })
        } catch (cause) {
          entree.etat = 'en-erreur'
          signalerErreur({
            code: 'echec-activation',
            message: cause instanceof Error ? cause.message : String(cause),
            composant: id,
          })
        }
      },
    }
  }

  function causeDeDesactivation(injecte: readonly string[]): string {
    for (const nom of injecte) {
      if (!fournisseurs.has(nom)) return nom
    }
    return 'liberation'
  }

  async function chargerDans(
    contexte: Context,
    composant: Composant,
    parent?: IdComposant,
  ): Promise<IdComposant | undefined> {
    const conflit = nomsPris(composant)
    if (conflit !== undefined) {
      signalerErreur({
        code: 'nom-deja-fourni',
        message: `« ${conflit} » est déjà fourni par un autre composant.`,
      })
      return undefined
    }

    compteur += 1
    const id = `${composant.nom}#${compteur}` as IdComposant
    for (const nom of composant.fournit ?? []) reserves.set(nom, id)
    const entree: Entree = {
      id,
      nom: composant.nom,
      composant,
      etat: 'en-attente',
      termine: false,
      ...(parent !== undefined ? { parent } : {}),
      liberer: async () => {},
    }
    entrees.set(id, entree)

    emettre({
      type: 'composant-cree',
      id,
      nom: composant.nom,
      presentation: composant.presentation,
      injecte: [...(composant.injecte ?? [])],
      fournit: [...(composant.fournit ?? [])],
    })

    const fibre = await contexte.plugin(construirePlugin(composant, id, entree))
    entree.liberer = async () => {
      if (!entrees.has(id)) return
      // Les enfants d'abord, en ordre inverse de chargement : la cascade est
      // à nous, pas au moteur, pour qu'elle soit attendue et donc observable.
      for (const enfant of [...entrees.values()].reverse()) {
        if (enfant.parent === id) await enfant.liberer()
      }
      entree.etat = 'libere'
      await fibre.dispose()
      for (const nom of composant.fournit ?? []) {
        if (fournisseurs.get(nom) === id) fournisseurs.delete(nom)
        if (reserves.get(nom) === id) reserves.delete(nom)
      }
      entrees.delete(id)
      emettre({ type: 'composant-libere', id })
    }
    return id
  }

  return {
    charger(composant: Composant) {
      return chargerDans(racine, composant)
    },
    async liberer(id: IdComposant) {
      const entree = entrees.get(id)
      if (entree === undefined) return
      await entree.liberer()
    },
    async libererTout() {
      for (const entree of [...entrees.values()].reverse()) {
        await entree.liberer()
      }
    },
    introspecter(): Topologie {
      const composants = [...entrees.values()].map((entree) => ({
        id: entree.id,
        nom: entree.nom,
        etat: entree.etat,
        presentation: { ...entree.composant.presentation },
        injecte: [...(entree.composant.injecte ?? [])],
        fournit: [...(entree.composant.fournit ?? [])],
        termine: entree.termine,
      }))
      const dependances: Dependance[] = []
      for (const entree of entrees.values()) {
        for (const nom of entree.composant.injecte ?? []) {
          const source = fournisseurs.get(nom)
          if (source !== undefined) dependances.push({ de: source, vers: entree.id, nom })
        }
      }
      return { composants, dependances }
    },
    abonner(abonne: Abonne): Annulation {
      abonnes.add(abonne)
      return () => {
        abonnes.delete(abonne)
      }
    },
  }
}
