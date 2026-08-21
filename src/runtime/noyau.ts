// Seul fichier autorisé à importer `cordis` (règle ESLint `no-restricted-imports`).
// Il traduit le moteur de composition en un contrat français et un flux
// d'événements séquencés, et n'en laisse rien fuir au-delà.

import { Context } from 'cordis'
import type {
  Repondeur,
  Annulation,
  Artefact,
  CauseDesactivation,
  Composant,
  ContexteComposant,
  Decision,
  Dependance,
  ErreurComposant,
  Fabrication,
  ObjetDeDecision,
  EtatComposant,
  IdComposant,
  NoeudTopologie,
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
  /** Passe à vrai dès qu'une libération est demandée, même avant que la fibre existe. */
  liberationDemandee: boolean
  /** La libération en cours, pour qu'un second appel n'en déclenche pas une autre. */
  enCours?: Promise<void>
  liberer: () => Promise<void>
}

export interface Noyau {
  /** Charge un composant. Rend son identifiant, ou `undefined` si le chargement a échoué ou été refusé. */
  charger(composant: Composant): Promise<IdComposant | undefined>
  /** Libère un composant et, en cascade, tout ce qu'il a chargé. */
  liberer(id: IdComposant): Promise<void>
  /**
   * Remplace un composant vivant par une nouvelle version, à chaud.
   * Si la nouvelle version échoue à se charger, l'ancienne est remise :
   * une auto-modification ratée ne laisse pas le run amputé.
   */
  remplacer(
    id: IdComposant,
    remplacant: Composant,
    fabrication?: Fabrication,
  ): Promise<IdComposant | undefined>
  /** Libère la totalité du run, chargements encore en vol compris. */
  libererTout(): Promise<void>
  /** Photographie de la topologie vivante. */
  introspecter(): Topologie
  /**
   * Lit une sortie publiée par le run, pour que l'application puisse
   * consommer ce qui a été produit. C'est une lecture, jamais une écriture :
   * l'interface ne participe pas à la composition.
   */
  produit<T = unknown>(nom: string): T | undefined
  /**
   * Attend qu'un nom soit publié. Rend `true` s'il l'a été, `false` si le
   * délai est écoulé ou si le run a été libéré entre-temps.
   *
   * C'est ce qui permet à un agent qui charge d'autres agents d'avancer au
   * rythme du travail réel plutôt que d'un minuteur : sans cela, un graphe
   * construit à l'exécution apparaîtrait d'un bloc.
   */
  attendre(nom: string, delaiMs?: number): Promise<boolean>
  /**
   * Les noms effectivement publiés à cet instant. Sans cela, l'application
   * ne pourrait consommer que ce qu'elle savait d'avance — ce qui n'a plus
   * de sens quand le graphe n'est pas connu avant le run.
   */
  nomsPublies(): readonly string[]
  /**
   * Tranche une porte humaine en attente. Rend `false` si aucune porte
   * n'attend sous cet identifiant — une décision ne se prend pas deux fois.
   */
  decider(id: IdComposant, decision: Decision): boolean
  /** Les portes qui attendent une décision, à cet instant. */
  portesEnAttente(): readonly IdComposant[]
  /** S'abonne au flux. Rend la fonction de désabonnement. */
  abonner(abonne: Abonne): Annulation
}

export function creerNoyau(): Noyau {
  const racine = new Context()
  const entrees = new Map<IdComposant, Entree>()
  /** Qui publie effectivement quel nom. */
  const fournisseurs = new Map<string, IdComposant>()
  /**
   * Un nom de dépendance est réservé dès le chargement, pas à la première
   * publication : c'est la déclaration qui fait le contrat, sinon deux
   * composants déclarant le même nom passeraient tous les deux tant qu'aucun
   * n'a encore publié.
   */
  const reserves = new Map<string, IdComposant>()
  const abonnes = new Set<Abonne>()
  /** Ceux qui attendent qu'un nom soit publié. Vidé à la libération. */
  const attentes = new Map<string, Set<(publie: boolean) => void>>()
  /** Qui sait répondre aux questions. Un composant sans écoute est muet. */
  const ecouteurs = new Map<IdComposant, Repondeur>()
  /** Le contexte Cordis de chaque composant, pour recharger un enfant au bon endroit. */
  const contextesParEntree = new Map<IdComposant, Context>()
  const remplacementsEnCours = new Set<IdComposant>()
  /** Les décisions humaines en suspens. Rien ne les franchit tout seul. */
  const portes = new Map<IdComposant, (decision: Decision) => void>()
  /** Ce qui a déjà été tranché. Une décision ne se prend pas deux fois. */
  const decisions = new Map<IdComposant, Decision>()
  let sequence = 0
  let compteur = 0

  /**
   * `SansSequence` est distributif : le paramètre est l'union des variantes
   * privées de `sequence`, donc chaque appel reste vérifié variante par
   * variante. Seule la recomposition finale demande une assertion.
   */
  function emettre(evenement: SansSequence): void {
    if (fileAttente !== undefined) {
      fileAttente.push(evenement)
      return
    }
    sequence += 1
    diffuser({ ...evenement, sequence } as EvenementRun)
  }

  /**
   * Pendant `applique`, les événements du composant sont mis en file : rien de
   * ce qu'il produit ne doit être annoncé avant son activation. Un abonné qui
   * verrait « travail terminé » avant « actif » ne pourrait pas en faire un
   * état cohérent.
   */
  let fileAttente: SansSequence[] | undefined

  /**
   * Un abonné qui lève ne doit ni interrompre les autres, ni être confondu
   * avec une erreur du composant : son incident devient un événement à part.
   */
  function diffuser(evenement: EvenementRun): void {
    const incidents: string[] = []
    for (const abonne of abonnes) {
      try {
        abonne(evenement)
      } catch (cause) {
        incidents.push(cause instanceof Error ? cause.message : String(cause))
      }
    }
    if (evenement.type === 'abonne-en-erreur') return
    for (const message of incidents) {
      sequence += 1
      diffuser({ type: 'abonne-en-erreur', message, sequence })
    }
  }

  function signalerErreur(erreur: ErreurComposant): void {
    emettre({ type: 'composant-en-erreur', erreur })
  }

  function nomsPris(composant: Composant): string | undefined {
    for (const nom of composant.fournit ?? []) {
      if (reserves.has(nom) || fournisseurs.has(nom)) return nom
    }
    return undefined
  }

  function relacherNoms(id: IdComposant, noms: readonly string[]): void {
    for (const nom of noms) {
      if (fournisseurs.get(nom) === id) fournisseurs.delete(nom)
      if (reserves.get(nom) === id) reserves.delete(nom)
    }
  }

  function causeDeDesactivation(injecte: readonly string[]): CauseDesactivation {
    const manquants = injecte.filter((nom) => !fournisseurs.has(nom))
    return manquants.length > 0
      ? { genre: 'dependance-partie', noms: manquants }
      : { genre: 'liberation' }
  }

  function construirePlugin(composant: Composant, id: IdComposant, entree: Entree): PluginCordis {
    const injecte = [...(composant.injecte ?? [])]
    const fournit = [...(composant.fournit ?? [])]

    return {
      name: composant.nom,
      ...(injecte.length > 0 ? { inject: injecte } : {}),
      ...(fournit.length > 0 ? { provide: fournit } : {}),
      apply(contexte: Context) {
        contextesParEntree.set(id, contexte)
        // Sentinelle : son inverse se joue à chaque désactivation, qu'elle vienne
        // du départ d'une dépendance ou d'une libération complète.
        contexte.effect(
          () => () => {
            // Ni une libération ni un échec ne se requalifient en attente.
            if (entree.etat === 'libere' || entree.etat === 'en-erreur') return
            entree.etat = 'en-attente'
            emettre({
              type: 'composant-desactive',
              id,
              cause: causeDeDesactivation(injecte),
            })
          },
          'sentinelle',
        )

        /** Vrai tant que le composant peut agir sur le moteur. */
        const utilisable = () => entree.etat !== 'libere' && entree.etat !== 'en-erreur'

        /** Marque l'activation comme ratée : le composant ne sera pas annoncé actif. */
        function echouer(code: ErreurComposant['code'], message: string): void {
          entree.etat = 'en-erreur'
          signalerErreur({ code, message, composant: id, nom: composant.nom })
        }

        const facade: ContexteComposant = {
          id,
          effet(installer: () => Annulation, libelle: string) {
            if (!utilisable()) return
            contexte.effect(installer, libelle)
          },
          fournir(nom: string, valeur: unknown) {
            if (!utilisable()) return
            if (!fournit.includes(nom)) {
              echouer(
                'dependance-inconnue',
                `Le composant « ${composant.nom} » publie « ${nom} » sans l'avoir déclaré.`,
              )
              return
            }
            if (fournisseurs.get(nom) === id) {
              echouer(
                'nom-deja-fourni',
                `Le composant « ${composant.nom} » publie « ${nom} » deux fois.`,
              )
              return
            }
            fournisseurs.set(nom, id)
            const enAttente = attentes.get(nom)
            if (enAttente !== undefined) {
              attentes.delete(nom)
              for (const reprendre of enAttente) reprendre(true)
            }
            contexte.provide(nom, valeur)
            contexte.effect(
              () => () => {
                if (fournisseurs.get(nom) === id) fournisseurs.delete(nom)
              },
              `fournit:${nom}`,
            )
          },
          lire<T = unknown>(nom: string): T | undefined {
            if (!utilisable()) return undefined
            if (!injecte.includes(nom)) {
              echouer(
                'dependance-inconnue',
                `Le composant « ${composant.nom} » lit « ${nom} » sans l'avoir déclaré.`,
              )
              return undefined
            }
            // Lecture non stricte : le composant n'est actif que si toutes ses
            // dépendances sont fournies, la garde du moteur ferait doublon et
            // lèverait au lieu de rendre.
            const valeur = contexte.get(nom, false) as T | undefined
            const source = fournisseurs.get(nom)
            // Émis même quand la valeur est `undefined` : une valeur publiée
            // indéfinie reste un transit réel.
            if (source !== undefined) {
              emettre({ type: 'valeur-transmise', de: source, vers: id, nom })
            }
            return valeur
          },
          emettre(message: string) {
            if (!utilisable()) return
            emettre({ type: 'message-emis', id, message })
          },
          terminer() {
            if (!utilisable()) return
            entree.termine = true
            emettre({ type: 'travail-termine', id })
          },
          publierArtefact(artefact: Artefact) {
            if (!utilisable()) return
            emettre({ type: 'artefact-produit', id, artefact })
          },
          compterTokens(entree: number, sortie: number, echec?: string) {
            if (!utilisable()) return
            emettre({
              type: 'tokens-consommes',
              id,
              entree,
              sortie,
              ...(echec !== undefined ? { echec } : {}),
            })
          },
          attendreDecision(objet: ObjetDeDecision, surDecision: (decision: Decision) => void) {
            if (!utilisable()) return
            if (decisions.has(id)) {
              // Une décision déjà prise ne se rejoue pas : une réactivation
              // du composant ne doit pas redemander à trancher.
              return
            }
            if (portes.has(id)) {
              echouer('nom-deja-fourni', 'Une porte attend déjà pour ce composant.')
              return
            }
            portes.set(id, surDecision)
            contexte.effect(
              () => () => {
                // Une porte abandonnée doit se retirer visiblement, sinon
                // l'interface garde des boutons qui ne font plus rien.
                if (portes.delete(id)) emettre({ type: 'porte-retiree', id })
              },
              'porte',
            )
            emettre({ type: 'porte-atteinte', id, objet })
          },
          charger(enfant: Composant, fabrication?: Fabrication) {
            if (!utilisable()) return Promise.resolve(undefined)
            return chargerDans(contexte, enfant, id, fabrication)
          },
          async liberer(enfant: IdComposant) {
            // Un composant ne défait que ce qu'il a fait : sans cette borne,
            // un agent pourrait retirer son propre maître.
            if (!utilisable() || entrees.get(enfant)?.parent !== id) return false
            await api.liberer(enfant)
            return true
          },
          async remplacer(enfant: IdComposant, remplacant: Composant, fabrication?: Fabrication) {
            if (!utilisable() || entrees.get(enfant)?.parent !== id) return undefined
            return api.remplacer(enfant, remplacant, fabrication)
          },
          ecouter(repondre: Repondeur) {
            if (!utilisable()) return
            ecouteurs.set(id, repondre)
            contexte.effect(
              () => () => {
                ecouteurs.delete(id)
              },
              'ecoute',
            )
          },
          async demander(destinataire: string, question: string, delaiMs = 30_000) {
            if (!utilisable()) return undefined
            const cible = [...entrees.values()].find(
              (autre) => autre.nom === destinataire && autre.etat === 'actif' && autre.id !== id,
            )
            const repondre = cible === undefined ? undefined : ecouteurs.get(cible.id)
            if (cible === undefined || repondre === undefined) return undefined

            emettre({ type: 'question-posee', de: id, vers: cible.id, question })
            try {
              // Bornée : un répondeur qui ne rend jamais la main figerait celui
              // qui l'interroge, et le run entier derrière lui.
              const reponse = await Promise.race([
                Promise.resolve(repondre(question, id)),
                new Promise<undefined>((suite) => setTimeout(() => suite(undefined), delaiMs)),
              ])
              if (reponse === undefined) return undefined
              emettre({ type: 'reponse-donnee', de: cible.id, vers: id, reponse })
              return reponse
            } catch (cause) {
              // Une réponse qui lève est un silence, pas une panne du demandeur.
              const message = cause instanceof Error ? cause.message : String(cause)
              emettre({
                type: 'message-emis',
                id: cible.id,
                message: `Ne peut pas répondre : ${message}`,
              })
              return undefined
            }
          },
        }

        // Rien de ce que le composant émet ne sort avant son activation.
        const fileParente = fileAttente
        fileAttente = []
        try {
          composant.applique(facade)
        } catch (cause) {
          echouer('echec-activation', cause instanceof Error ? cause.message : String(cause))
        }
        const differes = fileAttente
        fileAttente = fileParente

        if (entree.etat === 'en-erreur') {
          // Un composant qui a échoué ne garde pas les noms qu'il réservait :
          // sinon aucun remplaçant ne pourrait jamais prendre sa place.
          relacherNoms(id, fournit)
          // Ordre chronologique : ce que le composant a dit avant de tomber
          // est rejoué avant l'erreur elle-même.
          for (const differe of differes) emettre(differe)
          return
        }

        // L'activation n'est annoncée qu'une fois `applique` passé sans faute :
        // un composant en échec ne doit jamais avoir été vu actif.
        entree.etat = 'actif'
        emettre({ type: 'composant-active', id })
        for (const differe of differes) emettre(differe)
      },
    }
  }

  async function chargerDans(
    contexte: Context,
    composant: Composant,
    parent?: IdComposant,
    fabrication?: Fabrication,
  ): Promise<IdComposant | undefined> {
    const conflit = nomsPris(composant)
    if (conflit !== undefined) {
      signalerErreur({
        code: 'nom-deja-fourni',
        message: `« ${conflit} » est déjà fourni par un autre composant.`,
        nom: composant.nom,
      })
      return undefined
    }

    compteur += 1
    const id = `${composant.nom}#${compteur}` as IdComposant
    const fournit = [...(composant.fournit ?? [])]
    for (const nom of fournit) reserves.set(nom, id)

    const entree: Entree = {
      id,
      nom: composant.nom,
      composant,
      etat: 'en-attente',
      termine: false,
      ...(parent !== undefined ? { parent } : {}),
      liberationDemandee: false,
      // Tant que la fibre n'existe pas, une libération demandée est mémorisée
      // et honorée dès que le chargement se termine.
      liberer: async () => {
        entree.liberationDemandee = true
      },
    }
    entrees.set(id, entree)

    emettre({
      type: 'composant-cree',
      id,
      nom: composant.nom,
      presentation: { ...composant.presentation },
      injecte: [...(composant.injecte ?? [])],
      fournit,
      ...(parent !== undefined ? { parent } : {}),
    })

    if (fabrication !== undefined && parent !== undefined) {
      emettre({ type: 'composant-fabrique', id, parent, fabrication })
    }

    let fibre: Awaited<ReturnType<Context['plugin']>>
    try {
      fibre = await contexte.plugin(construirePlugin(composant, id, entree))
    } catch (cause) {
      entrees.delete(id)
      relacherNoms(id, fournit)
      signalerErreur({
        code: 'echec-chargement',
        message: cause instanceof Error ? cause.message : String(cause),
        composant: id,
        nom: composant.nom,
      })
      return undefined
    }

    entree.liberer = () => {
      if (entree.enCours !== undefined) return entree.enCours
      entree.enCours = (async () => {
        if (!entrees.has(id)) return
        // Les enfants d'abord, en ordre inverse de chargement : la cascade est
        // à nous, pas au moteur, pour qu'elle soit attendue et donc observable.
        for (const enfant of [...entrees.values()].reverse()) {
          if (enfant.parent === id) await enfant.liberer()
        }
        entree.etat = 'libere'
        await fibre.dispose()
        relacherNoms(id, fournit)
        entrees.delete(id)
        contextesParEntree.delete(id)
        emettre({ type: 'composant-libere', id })
      })()
      return entree.enCours
    }

    if (entree.liberationDemandee) {
      await entree.liberer()
      return undefined
    }
    return id
  }

  /**
   * Remplace une entrée vivante. Les enfants qu'elle avait chargés sont
   * relevés d'abord : sans ça, un retour arrière remettrait la pièce mais
   * pas ce qu'elle avait fabriqué, et le run resterait amputé — précisément
   * le cas que cette API promet de couvrir.
   */
  async function effectuerRemplacement(
    entree: Entree,
    remplacant: Composant,
    fabrication?: Fabrication,
  ): Promise<IdComposant | undefined> {
    const id = entree.id
    const ancien = entree.composant
    const parent = entree.parent
    const contexteParent =
      parent !== undefined ? (contextesParEntree.get(parent) ?? racine) : racine
    const enfants = [...entrees.values()]
      .filter((autre) => autre.parent === id)
      .map((autre) => autre.composant)

    await entree.liberer()
    const nouveau = await chargerDans(contexteParent, remplacant, parent, fabrication)
    // Une version qui se charge mais tombe en défaut n'a pas « pris ».
    const enDefaut = nouveau !== undefined && entrees.get(nouveau)?.etat === 'en-erreur'
    if (nouveau !== undefined && !enDefaut) return nouveau

    if (nouveau !== undefined) await entrees.get(nouveau)?.liberer()
    const remis = await chargerDans(contexteParent, ancien, parent)
    if (remis === undefined) {
      signalerErreur({
        code: 'echec-chargement',
        message: `Le retour arrière sur « ${ancien.nom} » a échoué : le run est amputé.`,
        nom: ancien.nom,
      })
      return undefined
    }
    const contexteRemis = contextesParEntree.get(remis) ?? contexteParent
    for (const enfant of enfants) await chargerDans(contexteRemis, enfant, remis)
    return undefined
  }

  // Nommée : la façade d'un composant s'appuie dessus pour libérer ou
  // remplacer un enfant, sans que le composant atteigne le moteur.
  const api: Noyau = {
    charger(composant: Composant) {
      return chargerDans(racine, composant)
    },
    async liberer(id: IdComposant) {
      const entree = entrees.get(id)
      if (entree === undefined) return
      await entree.liberer()
    },
    async remplacer(id: IdComposant, remplacant: Composant, fabrication?: Fabrication) {
      const entree = entrees.get(id)
      if (entree === undefined) return undefined
      // Deux remplacements entrelacés liraient la même entrée.
      if (remplacementsEnCours.has(id)) return undefined
      remplacementsEnCours.add(id)
      try {
        return await effectuerRemplacement(entree, remplacant, fabrication)
      } finally {
        remplacementsEnCours.delete(id)
      }
    },
    async libererTout() {
      // Personne n'attendra plus rien : laisser une attente en vol
      // maintiendrait vivante une boucle de chargement du run précédent.
      for (const attendants of attentes.values()) {
        for (const reprendre of attendants) reprendre(false)
      }
      attentes.clear()
      // Une passe ne suffit pas : un chargement encore en vol s'inscrit après
      // coup. On répète tant que la libération fait bouger quelque chose.
      let restants = entrees.size
      for (let passe = 0; passe < 10 && entrees.size > 0; passe += 1) {
        for (const entree of [...entrees.values()].reverse()) {
          await entree.liberer()
        }
        if (entrees.size === restants) break
        restants = entrees.size
      }
    },
    produit<T = unknown>(nom: string): T | undefined {
      // Non stricte : au repos ou entre deux runs, l'absence est normale.
      return racine.get(nom, false) as T | undefined
    },
    nomsPublies(): readonly string[] {
      return [...fournisseurs.keys()]
    },
    attendre(nom: string, delaiMs?: number): Promise<boolean> {
      if (fournisseurs.has(nom)) return Promise.resolve(true)
      return new Promise<boolean>((resoudre) => {
        let fini = false
        const terminer = (publie: boolean) => {
          if (fini) return
          fini = true
          if (minuteur !== undefined) clearTimeout(minuteur)
          attentes.get(nom)?.delete(terminer)
          resoudre(publie)
        }
        // Sans borne, un agent tombé en panne figerait pour toujours celui
        // qui charge la suite : le run s'arrêterait sans le moindre écran.
        const minuteur =
          delaiMs === undefined ? undefined : setTimeout(() => terminer(false), delaiMs)
        const attendants = attentes.get(nom) ?? new Set<(publie: boolean) => void>()
        attendants.add(terminer)
        attentes.set(nom, attendants)
      })
    },
    introspecter(): Topologie {
      const composants: NoeudTopologie[] = [...entrees.values()].map((entree) => ({
        id: entree.id,
        nom: entree.nom,
        etat: entree.etat,
        presentation: { ...entree.composant.presentation },
        injecte: [...(entree.composant.injecte ?? [])],
        fournit: [...(entree.composant.fournit ?? [])],
        termine: entree.termine,
        ...(entree.parent !== undefined ? { parent: entree.parent } : {}),
      }))
      const dependances: Dependance[] = []
      for (const entree of entrees.values()) {
        for (const nom of entree.composant.injecte ?? []) {
          const source = fournisseurs.get(nom)
          // Un composant qui publie et consomme le même nom ne se relie pas
          // à lui-même : ce serait un cycle dans le graphe.
          if (source !== undefined && source !== entree.id) {
            dependances.push({ de: source, vers: entree.id, nom })
          }
        }
      }
      return { composants, dependances }
    },
    decider(id: IdComposant, decision: Decision): boolean {
      const surDecision = portes.get(id)
      if (surDecision === undefined) return false
      portes.delete(id)
      decisions.set(id, decision)
      emettre({ type: 'decision-prise', id, decision })
      try {
        surDecision(decision)
      } catch (cause) {
        // Un composant qui lève en apprenant la décision ne doit pas faire
        // remonter l'exception jusqu'au clic de l'utilisateur.
        signalerErreur({
          code: 'echec-activation',
          message: cause instanceof Error ? cause.message : String(cause),
          composant: id,
          nom: entrees.get(id)?.nom ?? 'porte',
        })
      }
      return true
    },
    portesEnAttente: () => [...portes.keys()],
    abonner(abonne: Abonne): Annulation {
      abonnes.add(abonne)
      return () => {
        abonnes.delete(abonne)
      }
    },
  }

  return api
}
