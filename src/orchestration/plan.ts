// Le plan : ce que l'usine a décidé de construire, pour ce brief-là.
//
// C'est la pièce qui change tout. Jusqu'ici le casting était déclaré et le
// graphe connu avant le run ; désormais il est produit à l'exécution, et le
// brief le détermine. Un plan est donc une donnée non fiable — il peut venir
// d'un modèle — d'où sa vérification avant tout chargement.

import { nomsDePrimitives } from '../runtime/fabrique/primitives'

/** L'outil qu'un agent doit fabriquer avant de pouvoir publier. */
export interface OutilPlanifie {
  /** Le nom sous lequel la pièce fabriquée publiera sa fonction. */
  fournit: string
  /** Les primitives à enchaîner, dans l'ordre. Toutes au registre. */
  etapes: readonly string[]
}

/** Un agent que le plan fait exister. Il n'a pas de code : il a un rôle. */
export interface AgentPlanifie {
  /** Identité dans le run. Sert aussi de clé de dépendance. */
  nom: string
  /** Le nom court affiché dans le nœud. */
  libelle: string
  /** Ce qu'il fait, en une ligne. */
  role: string
  injecte: readonly string[]
  fournit: readonly string[]
  outil?: OutilPlanifie
}

export interface Plan {
  /** Le produit visé, tel qu'il s'affichera une fois livré. */
  produit: string
  /** Ce que le produit demande à son utilisateur, en une phrase. */
  aide: string
  /** Le corpus de règles retenu parmi ceux dont l'usine dispose. */
  corpus: string
  /** D'où vient ce plan. Un plan de repli ne doit pas se faire passer pour l'autre. */
  origine: 'modele' | 'deterministe'
  agents: readonly AgentPlanifie[]
}

export interface DefautPlan {
  code:
    | 'plan-vide'
    | 'trop-d-agents'
    | 'nom-en-double'
    | 'nom-du-maitre'
    | 'dependance-sans-fournisseur'
    | 'cycle'
    | 'primitive-inconnue'
    | 'agent-inutile'
    | 'promesse-non-tenue'
    | 'champ-manquant'
  message: string
}

export interface ContraintesPlan {
  /** Ce que le maître publie avant tout agent. */
  fournisParLeMaitre: readonly string[]
  /** Ce que la suite fixe du run — porte, livraison — exige de trouver. */
  requisParLaSuite: readonly string[]
  /**
   * Le nombre d'agents qu'un run peut porter. Ce n'est pas une limite de
   * moteur : c'est une limite de facture et de lisibilité à l'écran.
   */
  maximumAgents: number
}

export const CONTRAINTES: ContraintesPlan = {
  fournisParLeMaitre: ['besoin', 'memoire', 'fabrique', 'raisonneur'],
  requisParLaSuite: ['objection', 'verificateur', 'sortie-produit'],
  maximumAgents: 12,
}

const NOM_VALIDE = /^[a-z][a-z0-9-]{1,39}$/

/**
 * Un plan incohérent doit être refusé avant le moindre chargement. Une
 * dépendance que personne ne publie ne se voit pas : elle laisse simplement
 * un agent inactif pour toujours, et le run se fige sans diagnostic.
 */
export function verifierPlan(
  plan: Plan,
  contraintes: ContraintesPlan = CONTRAINTES,
): readonly DefautPlan[] {
  const defauts: DefautPlan[] = []
  const ajouter = (code: DefautPlan['code'], message: string) => defauts.push({ code, message })

  if (plan.agents.length === 0) {
    ajouter('plan-vide', "Le plan ne fait exister aucun agent : il n'y a rien à montrer.")
    return defauts
  }
  if (plan.agents.length > contraintes.maximumAgents) {
    ajouter(
      'trop-d-agents',
      `Le plan demande ${plan.agents.length} agents ; le maximum est ${contraintes.maximumAgents}.`,
    )
  }
  for (const champ of ['produit', 'aide', 'corpus'] as const) {
    if (typeof plan[champ] !== 'string' || plan[champ].trim().length === 0) {
      ajouter('champ-manquant', `Le plan ne dit pas son « ${champ} ».`)
    }
  }

  const primitives = new Set(nomsDePrimitives())
  const duMaitre = new Set(contraintes.fournisParLeMaitre)
  /** Qui publie quoi, une fois le plan appliqué. */
  const publiePar = new Map<string, string>()
  const vus = new Set<string>()

  for (const agent of plan.agents) {
    if (!NOM_VALIDE.test(agent.nom)) {
      ajouter('champ-manquant', `« ${agent.nom} » n'est pas un nom d'agent recevable.`)
      continue
    }
    if (vus.has(agent.nom)) {
      ajouter('nom-en-double', `Deux agents portent le nom « ${agent.nom} ».`)
      continue
    }
    vus.add(agent.nom)

    const publie = [...agent.fournit, ...(agent.outil !== undefined ? [agent.outil.fournit] : [])]
    if (publie.length === 0) {
      // Un nœud qui ne publie rien n'est pas un agent : c'est une décoration.
      ajouter('agent-inutile', `« ${agent.nom} » ne publie rien et ne fabrique rien.`)
    }
    for (const nom of publie) {
      if (duMaitre.has(nom)) {
        ajouter('nom-du-maitre', `« ${agent.nom} » veut publier « ${nom} », qui est au maître.`)
        continue
      }
      const autre = publiePar.get(nom)
      if (autre !== undefined) {
        ajouter('nom-en-double', `« ${nom} » est publié par « ${autre} » et « ${agent.nom} ».`)
        continue
      }
      publiePar.set(nom, agent.nom)
    }

    if (agent.outil !== undefined) {
      if (agent.outil.etapes.length === 0) {
        ajouter('champ-manquant', `L'outil de « ${agent.nom} » n'enchaîne aucune primitive.`)
      }
      for (const etape of agent.outil.etapes) {
        if (!primitives.has(etape)) {
          // C'est le plafond honnête de la fabrication sous politique stricte :
          // on assemble un vocabulaire, on n'invente pas une opération.
          ajouter(
            'primitive-inconnue',
            `« ${etape} », demandée par « ${agent.nom} », n'est pas au registre.`,
          )
        }
      }
    }
  }

  for (const agent of plan.agents) {
    for (const nom of agent.injecte) {
      if (duMaitre.has(nom) || publiePar.has(nom)) continue
      ajouter(
        'dependance-sans-fournisseur',
        `« ${agent.nom} » attend « ${nom} », que personne ne publie.`,
      )
    }
  }

  for (const nom of contraintes.requisParLaSuite) {
    if (!publiePar.has(nom)) {
      ajouter('promesse-non-tenue', `Le plan ne publie jamais « ${nom} », que la suite exige.`)
    }
  }

  const boucle = premierCycle(plan, duMaitre, publiePar)
  if (boucle !== undefined) {
    ajouter('cycle', `Dépendance circulaire : ${boucle.join(' → ')}.`)
  }

  return defauts
}

/**
 * Un cycle ne lève aucune erreur au chargement : les agents concernés
 * restent simplement en attente l'un de l'autre, pour toujours.
 */
function premierCycle(
  plan: Plan,
  duMaitre: ReadonlySet<string>,
  publiePar: ReadonlyMap<string, string>,
): readonly string[] | undefined {
  const parNom = new Map(plan.agents.map((agent) => [agent.nom, agent]))
  const etat = new Map<string, 'en-cours' | 'fini'>()

  const descendre = (nom: string, chemin: readonly string[]): readonly string[] | undefined => {
    if (etat.get(nom) === 'fini') return undefined
    if (etat.get(nom) === 'en-cours') return [...chemin.slice(chemin.indexOf(nom)), nom]
    etat.set(nom, 'en-cours')
    for (const dependance of parNom.get(nom)?.injecte ?? []) {
      if (duMaitre.has(dependance)) continue
      const fournisseur = publiePar.get(dependance)
      if (fournisseur === undefined || fournisseur === nom) continue
      const trouve = descendre(fournisseur, [...chemin, nom])
      if (trouve !== undefined) return trouve
    }
    etat.set(nom, 'fini')
    return undefined
  }

  for (const agent of plan.agents) {
    const trouve = descendre(agent.nom, [])
    if (trouve !== undefined) return trouve
  }
  return undefined
}

/**
 * Les vagues de chargement : tous les agents d'une vague peuvent naître
 * ensemble, la suivante attend que la précédente ait publié. C'est ce qui
 * fait pousser le graphe au rythme du travail réel, sans le moindre
 * minuteur d'animation.
 */
export function vaguesDeChargement(
  plan: Plan,
  contraintes: ContraintesPlan = CONTRAINTES,
): readonly (readonly AgentPlanifie[])[] {
  const duMaitre = new Set(contraintes.fournisParLeMaitre)
  const publiePar = new Map<string, string>()
  for (const agent of plan.agents) {
    for (const nom of nomsPublies(agent)) {
      if (!publiePar.has(nom)) publiePar.set(nom, agent.nom)
    }
  }

  const restants = [...plan.agents]
  const places = new Set<string>()
  const vagues: AgentPlanifie[][] = []

  while (restants.length > 0) {
    const prets = restants.filter((agent) =>
      agent.injecte.every((nom) => {
        if (duMaitre.has(nom)) return true
        const fournisseur = publiePar.get(nom)
        return fournisseur === undefined || fournisseur === agent.nom || places.has(fournisseur)
      }),
    )
    // Aucun candidat : le reste est pris dans un cycle, que `verifierPlan` a
    // déjà refusé. On rend le reste d'un bloc plutôt que de boucler.
    const vague = prets.length > 0 ? prets : [...restants]
    for (const agent of vague) {
      places.add(agent.nom)
      restants.splice(restants.indexOf(agent), 1)
    }
    vagues.push(vague)
  }

  return vagues
}

/** Tout ce qu'un agent fait exister, son outil compris. */
export const nomsPublies = (agent: AgentPlanifie): readonly string[] => [
  ...agent.fournit,
  ...(agent.outil !== undefined ? [agent.outil.fournit] : []),
]

/**
 * L'ordre dans lequel les agents peuvent être chargés : un agent après ce
 * dont il dépend. Le graphe pousse alors dans le sens de la lecture au lieu
 * d'apparaître d'un bloc.
 */
export function ordreDeChargement(
  plan: Plan,
  contraintes: ContraintesPlan = CONTRAINTES,
): readonly AgentPlanifie[] {
  const duMaitre = new Set(contraintes.fournisParLeMaitre)
  const publiePar = new Map<string, string>()
  for (const agent of plan.agents) {
    for (const nom of [...agent.fournit, ...(agent.outil ? [agent.outil.fournit] : [])]) {
      if (!publiePar.has(nom)) publiePar.set(nom, agent.nom)
    }
  }

  const restants = [...plan.agents]
  const places = new Set<string>()
  const ordre: AgentPlanifie[] = []

  while (restants.length > 0) {
    const index = restants.findIndex((agent) =>
      agent.injecte.every((nom) => {
        if (duMaitre.has(nom)) return true
        const fournisseur = publiePar.get(nom)
        return fournisseur === undefined || fournisseur === agent.nom || places.has(fournisseur)
      }),
    )
    // Aucun candidat : le reste est pris dans un cycle. `verifierPlan` l'a
    // déjà refusé ; on rend l'ordre déclaré plutôt que de boucler.
    const [pris] = restants.splice(index === -1 ? 0 : index, 1)
    if (pris === undefined) break
    places.add(pris.nom)
    ordre.push(pris)
  }

  return ordre
}
