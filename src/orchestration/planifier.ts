// Comment un plan naît d'un brief.
//
// Deux voies, une seule sortie. Le modèle propose ; s'il n'est pas là, s'il
// répond à côté, ou si son plan ne tient pas la vérification, la voie
// déterministe prend le relais — et elle lit le brief pour de bon, sinon le
// site sans clé redeviendrait la démonstration figée qu'il ne doit plus être.

import { CORPUS, corpusParDefaut, trouverCorpus, type Corpus } from '../corpus'
import { normaliser } from '../runtime/fabrique/primitives'
import { raisonneurDeterministe, type Raisonneur } from '../runtime/raisonneur'
import { CONTRAINTES, verifierPlan, type AgentPlanifie, type Plan } from './plan'

/** Les mots qui font entrer une étape dans la chaîne fabriquée. */
const DECLENCHEURS = {
  negations: [
    'negation',
    'negative',
    'nuance',
    'formulation',
    'contexte',
    'ironie',
    'tournure',
    'exhaustif',
    'strict',
    'rigoureux',
  ],
  interface: ['interface', 'ecran', 'ui', 'formulaire', 'page', 'coller', 'saisir', 'visuel'],
  tests: ['test', 'tests', 'qualite', 'fiable', 'fiabilite', 'regression', 'verifie'],
  api: ['api', 'integration', 'webhook', 'endpoint', 'automatiser', 'automatique', 'lot', 'batch'],
  juridique: ['juriste', 'juridique', 'avocat', 'conformite', 'audit', 'controle', 'legal'],
} as const

const contient = (brief: string, mots: readonly string[]): boolean => {
  const normalise = ` ${normaliser(brief)} `
  return mots.some((mot) => normalise.includes(` ${mot} `) || normalise.includes(` ${mot}s `))
}

/** Le corpus que le brief désigne. À égalité, le premier déclaré. */
export function corpusDuBrief(brief: string): Corpus {
  const normalise = ` ${normaliser(brief)} `
  let meilleur: { corpus: Corpus; score: number } | undefined
  for (const corpus of CORPUS) {
    const score = corpus.indices.filter((indice) => normalise.includes(` ${indice}`)).length
    if (score > 0 && (meilleur === undefined || score > meilleur.score)) {
      meilleur = { corpus, score }
    }
  }
  return meilleur?.corpus ?? corpusParDefaut()
}

/**
 * Le plan de repli. Il n'est pas un plan par défaut : deux briefs différents
 * donnent deux graphes différents, sinon l'usine ne planifierait rien.
 */
export function planifierSansModele(brief: string): Plan {
  const corpus = corpusDuBrief(brief)

  // La chaîne fabriquée. Découper puis classer est le minimum ; exiger une
  // source est une promesse du produit, pas une option ; écarter les
  // négations coûte en rappel et ne s'ajoute que si le brief le demande.
  const etapes = ['decouper-allegations', 'classer-par-regles']
  if (contient(brief, DECLENCHEURS.negations)) etapes.push('ecarter-les-negations')
  etapes.push('exiger-une-source')

  const agents: AgentPlanifie[] = [
    {
      nom: 'source-de-verite',
      libelle: 'Source de vérité',
      role: corpus.role,
      injecte: ['besoin'],
      fournit: ['registre'],
    },
    {
      nom: 'lecteur-du-besoin',
      libelle: 'Lecteur du besoin',
      role: 'Traduit le brief en ce que le produit doit savoir faire',
      injecte: ['besoin', 'raisonneur'],
      fournit: ['histoires'],
    },
    {
      nom: 'architecte',
      libelle: 'Architecte',
      role: 'Décide de quoi le produit est fait, et le spécifie',
      injecte: ['histoires', 'raisonneur'],
      fournit: ['specification'],
    },
  ]

  // Ce que le brief demande explicitement, et rien d'autre : c'est là que
  // deux briefs cessent de donner le même graphe.
  if (contient(brief, DECLENCHEURS.interface)) {
    agents.push({
      nom: 'constructeur-interface',
      libelle: 'Interface',
      role: "Construit l'écran par lequel le produit se manipule",
      injecte: ['specification'],
      fournit: ['sortie-interface'],
    })
  }
  if (contient(brief, DECLENCHEURS.tests)) {
    agents.push({
      nom: 'constructeur-tests',
      libelle: 'Tests',
      role: 'Écrit de quoi prouver que le produit tient ses promesses',
      injecte: ['specification'],
      fournit: ['sortie-tests'],
    })
  }
  if (contient(brief, DECLENCHEURS.api)) {
    agents.push({
      nom: 'constructeur-acces',
      libelle: 'Accès programmatique',
      role: 'Ouvre le produit à un appel automatisé',
      injecte: ['specification'],
      fournit: ['sortie-acces'],
    })
  }
  if (contient(brief, DECLENCHEURS.juridique)) {
    agents.push({
      nom: 'relecteur-juridique',
      libelle: 'Relecture juridique',
      role: 'Contrôle que chaque verdict cite un texte opposable',
      injecte: ['registre', 'specification'],
      fournit: ['sortie-juridique'],
    })
  }

  agents.push({
    nom: 'fabricant-du-produit',
    libelle: 'Fabricant',
    role: "Fabrique la pièce qui n'existait pas, et la charge dans le run",
    injecte: ['specification', 'registre', 'fabrique'],
    fournit: ['sortie-produit'],
    outil: { fournit: 'verificateur', etapes },
  })
  agents.push({
    nom: 'sceptique',
    libelle: 'Sceptique',
    role: 'Attaque le résultat avant la porte humaine',
    injecte: [
      'specification',
      'sortie-produit',
      ...agents
        .map((agent) => agent.fournit)
        .flat()
        .filter((nom) => nom.startsWith('sortie-') && nom !== 'sortie-produit'),
      'raisonneur',
    ],
    fournit: ['objection'],
  })

  return {
    produit: `Vérificateur — ${corpus.titre}`,
    aide: 'Collez un texte : chaque phrase reçoit un verdict et sa source.',
    corpus: corpus.cle,
    origine: 'deterministe',
    agents,
  }
}

/** Ce qui s'est passé pendant la planification, pour l'afficher sans mentir. */
export interface Planification {
  plan: Plan
  /** Renseigné quand le modèle a été écarté, avec la raison. */
  echec?: string
  tokens?: { entree: number; sortie: number }
}

const CONSIGNE = `Tu planifies une chaîne de production logicielle. Rends UNIQUEMENT un objet JSON, sans texte autour, de la forme :
{"produit":"…","aide":"…","corpus":"<clé>","agents":[{"nom":"kebab-case","libelle":"…","role":"…","injecte":["…"],"fournit":["…"],"outil":{"fournit":"verificateur","etapes":["…"]}}]}
Règles : entre 4 et 9 agents ; un seul porte "outil" ; le plan doit publier "objection" et "verificateur" ; chaque "injecte" doit être publié par un autre agent ou être l'un de {besoin, memoire, fabrique, raisonneur} ; aucune dépendance circulaire.`

const contexteDePlanification = (brief: string, etapes: readonly string[]): string =>
  [
    `Brief : ${brief}`,
    '',
    `Corpus disponibles (clés) : ${CORPUS.map((c) => `${c.cle} — ${c.titre}`).join(' ; ')}`,
    `Primitives disponibles pour "etapes" : ${etapes.join(', ')}`,
    "Aucune autre primitive n'existe : n'en invente pas.",
  ].join('\n')

/** Extrait le premier objet JSON d'une réponse, préambule éventuel compris. */
const objetJson = (texte: string): unknown => {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) throw new Error('aucun objet JSON dans la réponse')
  return JSON.parse(texte.slice(debut, fin + 1))
}

const chaine = (valeur: unknown, defaut = ''): string =>
  typeof valeur === 'string' ? valeur : defaut

const listeDeChaines = (valeur: unknown): readonly string[] =>
  Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === 'string') : []

/**
 * Le plan que rend un modèle est une donnée hostile : on le reconstruit
 * champ par champ plutôt que de lui faire confiance sur sa forme.
 */
function planDepuisJson(brut: unknown, brief: string): Plan {
  if (typeof brut !== 'object' || brut === null) throw new Error("la réponse n'est pas un objet")
  const objet = brut as Record<string, unknown>
  const agents = Array.isArray(objet.agents) ? objet.agents : []
  const corpus = trouverCorpus(chaine(objet.corpus)) ?? corpusDuBrief(brief)

  return {
    produit: chaine(objet.produit, `Vérificateur — ${corpus.titre}`).slice(0, 80),
    aide: chaine(
      objet.aide,
      'Collez un texte : chaque phrase reçoit un verdict et sa source.',
    ).slice(0, 160),
    corpus: corpus.cle,
    origine: 'modele',
    agents: agents.map((brutAgent): AgentPlanifie => {
      const agent = (
        typeof brutAgent === 'object' && brutAgent !== null ? brutAgent : {}
      ) as Record<string, unknown>
      const outil =
        typeof agent.outil === 'object' && agent.outil !== null
          ? (agent.outil as Record<string, unknown>)
          : undefined
      return {
        nom: chaine(agent.nom).slice(0, 40),
        libelle: chaine(agent.libelle, chaine(agent.nom)).slice(0, 28),
        role: chaine(agent.role, 'Rôle non précisé').slice(0, 120),
        injecte: listeDeChaines(agent.injecte),
        fournit: listeDeChaines(agent.fournit),
        ...(outil !== undefined
          ? { outil: { fournit: chaine(outil.fournit), etapes: listeDeChaines(outil.etapes) } }
          : {}),
      }
    }),
  }
}

/**
 * Planifie. Le modèle décide de la composition ; la vérification décide si
 * on la charge. Un plan refusé n'arrête pas le run : il le fait retomber sur
 * le plan déterministe, et la raison s'affiche.
 */
export async function planifier(
  brief: string,
  raisonneur: Raisonneur = raisonneurDeterministe(),
  primitivesDisponibles: readonly string[] = [],
): Promise<Planification> {
  const repli = planifierSansModele(brief)
  if (raisonneur.origine !== 'llm') return { plan: repli }

  const raisonnement = await raisonneur
    .raisonner({
      role: 'planificateur',
      instruction: CONSIGNE,
      contexte: contexteDePlanification(brief, primitivesDisponibles),
      // Le repli du port est textuel ; ici il ne sert qu'à ne jamais rendre
      // une chaîne vide — le vrai repli est le plan déterministe.
      repli: '',
    })
    .catch((cause): { texte: string; echec: string } => ({
      texte: '',
      echec: cause instanceof Error ? cause.message : String(cause),
    }))

  const tokens = 'tokens' in raisonnement ? raisonnement.tokens : undefined
  if (raisonnement.echec !== undefined || raisonnement.texte.trim().length === 0) {
    return {
      plan: repli,
      echec: raisonnement.echec ?? 'le modèle a répondu sans texte',
      ...(tokens ? { tokens } : {}),
    }
  }

  try {
    const plan = planDepuisJson(objetJson(raisonnement.texte), brief)
    const defauts = verifierPlan(plan, CONTRAINTES)
    if (defauts.length > 0) {
      return {
        plan: repli,
        echec: `plan refusé : ${defauts[0]?.message ?? 'incohérent'}`,
        ...(tokens ? { tokens } : {}),
      }
    }
    return { plan, ...(tokens ? { tokens } : {}) }
  } catch (cause) {
    return {
      plan: repli,
      echec: cause instanceof Error ? cause.message : 'plan illisible',
      ...(tokens ? { tokens } : {}),
    }
  }
}
