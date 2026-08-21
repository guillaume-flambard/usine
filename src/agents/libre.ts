// L'agent libre. Il n'a pas de comportement : il a une mission, et à chaque
// tour il décide quoi faire — créer un agent, en interroger un, écrire un
// outil, publier, retirer, s'arrêter.
//
// Rien ici ne connaît le domaine. Ce qui borne l'agent n'est pas un catalogue
// mais un budget : combien d'agents peuvent exister, jusqu'à quelle
// profondeur, combien de tours chacun, combien de tokens en tout.

import type { Composant, ContexteComposant, IdComposant } from '../runtime/contrat'
import { type Raisonneur, type Raisonnement } from '../runtime/raisonneur'
import { lireTour, type Action, type Tour } from './actions'

export interface Mission {
  nom: string
  libelle: string
  role: string
  /** Ce qu'on lui demande d'accomplir, en français. */
  mission: string
  injecte: readonly string[]
  fournit: readonly string[]
  /** À quelle distance du maître. Sert à borner la récursion. */
  profondeur: number
}

/**
 * Ce qui empêche un run libre de partir à l'infini. Ce n'est pas une limite
 * de moteur : c'est une limite de facture et de lisibilité.
 */
export interface Budget {
  agentsMax: number
  profondeurMax: number
  toursMax: number
  tokensMax: number
}

export const BUDGET: Budget = {
  agentsMax: 14,
  profondeurMax: 3,
  toursMax: 4,
  tokensMax: 120_000,
}

/** L'état partagé d'un run libre. Un seul objet, muté par les agents. */
export interface Chantier {
  budget: Budget
  /** Les noms d'agents déjà pris, maître compris. */
  noms: Set<string>
  agentsCrees: number
  tokens: number
  /** Le brief, rappelé à chaque agent : sans lui, un agent profond dérive. */
  brief: string
  raisonneur: Raisonneur
  /** Ce que chaque agent a publié, pour le contexte des suivants. */
  publications: Map<string, string>
}

export const creerChantier = (
  brief: string,
  raisonneur: Raisonneur,
  budget: Budget = BUDGET,
): Chantier => ({
  budget,
  noms: new Set(['agent-maitre']),
  agentsCrees: 0,
  tokens: 0,
  brief,
  raisonneur,
  publications: new Map(),
})

export const CONSIGNE = `Tu es un agent d'une usine logicielle qui se construit elle-même. Tu réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"pensee":"une phrase","actions":[ … ]}

Actions possibles :
{"type":"creer","nom":"kebab-case","libelle":"court","role":"une ligne","mission":"ce qu'il doit accomplir","injecte":["nom-publié-par-un-autre"],"fournit":["nom-qu-il-publiera"]}
{"type":"demander","a":"nom-d-un-agent-vivant","question":"…"}
{"type":"fabriquer","nom":"kebab-case","fournit":"nom-de-l-outil","code":"(entree) => { … return … }"}
{"type":"publier","nom":"un-de-tes-noms-fournis","texte":"…"}
{"type":"retirer","nom":"un-agent-que-tu-as-créé"}
{"type":"dire","message":"…"}
{"type":"terminer","resume":"…"}

Ressources disponibles à injecter : "besoin" (le brief), "corpus" (des corpus de règles réelles, avec leur source), et tout nom publié par un autre agent.

Règles : ne crée un agent que si tu ne peux pas faire son travail toi-même. Le code de "fabriquer" est une expression JavaScript qui s'évalue en fonction d'un seul argument — pas d'import, pas de réseau, pas d'accès au DOM. Publie avant de terminer. Termine dès que ta mission est remplie.`

const contexteDuTour = (
  mission: Mission,
  chantier: Chantier,
  lues: readonly { nom: string; texte: string }[],
  observations: readonly string[],
  toursRestants: number,
): string =>
  [
    `Brief du run : ${chantier.brief}`,
    `Toi : ${mission.nom} — ${mission.role}`,
    `Ta mission : ${mission.mission}`,
    mission.fournit.length > 0
      ? `Tu dois publier : ${mission.fournit.join(', ')}`
      : 'Tu ne publies rien : ton travail est de faire travailler les autres.',
    `Profondeur ${mission.profondeur} sur ${chantier.budget.profondeurMax} — au-delà, « creer » sera refusé.`,
    `Agents vivants : ${[...chantier.noms].join(', ')}`,
    `Il te reste ${toursRestants} tour(s).`,
    ...(lues.length > 0
      ? ['', 'Ce que tu lis :', ...lues.map((l) => `- ${l.nom} : ${l.texte}`)]
      : []),
    ...(observations.length > 0 ? ['', 'Ce qui vient de se passer :', ...observations] : []),
  ].join('\n')

/** Un tour de raisonnement, ramené à une forme lisible quoi qu'il arrive. */
export async function penser(
  contexte: ContexteComposant,
  chantier: Chantier,
  instruction: string,
  contexteTexte: string,
): Promise<Tour | undefined> {
  if (chantier.tokens >= chantier.budget.tokensMax) return undefined

  const raisonnement: Raisonnement = await chantier.raisonneur
    .raisonner({ role: 'agent', instruction, contexte: contexteTexte, repli: '' })
    .catch((cause) => ({
      texte: '',
      origine: 'deterministe' as const,
      echec: cause instanceof Error ? cause.message : String(cause),
    }))

  if (raisonnement.tokens !== undefined || raisonnement.echec !== undefined) {
    chantier.tokens += (raisonnement.tokens?.entree ?? 0) + (raisonnement.tokens?.sortie ?? 0)
    contexte.compterTokens(
      raisonnement.tokens?.entree ?? 0,
      raisonnement.tokens?.sortie ?? 0,
      raisonnement.echec,
    )
  }
  if (raisonnement.texte.trim().length === 0) return undefined

  try {
    return lireTour(raisonnement.texte)
  } catch (cause) {
    contexte.emettre(
      `Réponse illisible : ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    return undefined
  }
}

/**
 * Compile le code d'un outil. C'est une vraie évaluation : sans elle, un agent
 * ne peut qu'assembler un vocabulaire fermé, et rien d'imprévu ne sort jamais.
 * L'arbitrage est posé au niveau du déploiement, pas ici.
 */
function compilerOutil(
  code: string,
): { ok: true; fonction: unknown } | { ok: false; erreur: string } {
  try {
     
    const fabrique = new Function(`"use strict"; return (${code});`) as () => unknown
    const fonction = fabrique()
    if (typeof fonction !== 'function') {
      return { ok: false, erreur: "le code ne s'évalue pas en fonction" }
    }
    return { ok: true, fonction }
  } catch (cause) {
    return { ok: false, erreur: cause instanceof Error ? cause.message : String(cause) }
  }
}

/** L'outil, une fois compilé : un composant comme un autre. */
const composantOutil = (nom: string, fournit: string, fonction: unknown): Composant => ({
  nom,
  fournit: [fournit],
  presentation: {
    libelle: nom.slice(0, 26),
    role: `Outil écrit pendant le run, publié sous « ${fournit} »`,
    technologie: 'code évalué',
  },
  applique(contexte) {
    contexte.fournir(fournit, fonction)
    contexte.terminer()
  },
})

/**
 * Un agent libre. Sa boucle : lire ce qu'il a, penser, agir, recommencer —
 * jusqu'à ce qu'il termine ou que son budget de tours soit épuisé.
 */
export function agentLibre(mission: Mission, chantier: Chantier): Composant {
  return {
    nom: mission.nom,
    injecte: mission.injecte,
    fournit: mission.fournit,
    presentation: { libelle: mission.libelle, role: mission.role },
    applique(contexte) {
      // Répondre est une action passive : l'agent doit pouvoir être interrogé
      // pendant qu'il travaille, sinon « se parler » n'existe pas.
      contexte.ecouter(async (question, de) => {
        const tour = await penser(
          contexte,
          chantier,
          'On t\'interroge. Réponds en deux phrases par un JSON {"pensee":"","actions":[{"type":"dire","message":"ta réponse"}]}.',
          [
            `Toi : ${mission.nom} — ${mission.role}`,
            `Ta mission : ${mission.mission}`,
            `Question posée par ${de} : ${question}`,
          ].join('\n'),
        )
        const dit = tour?.actions.find((action) => action.type === 'dire')
        return dit?.type === 'dire' ? dit.message : `${mission.role}.`
      })

      void boucler(contexte, mission, chantier)
    },
  }
}

export async function boucler(
  contexte: ContexteComposant,
  mission: Mission,
  chantier: Chantier,
): Promise<void> {
  const enfants = new Map<string, IdComposant>()
  let observations: string[] = []
  let publie = false

  for (let tour = 0; tour < chantier.budget.toursMax; tour += 1) {
    const lues = mission.injecte.map((nom) => ({
      nom,
      texte: resumerValeur(contexte.lire(nom)),
    }))

    const pense = await penser(
      contexte,
      chantier,
      CONSIGNE,
      contexteDuTour(mission, chantier, lues, observations, chantier.budget.toursMax - tour),
    )
    if (pense === undefined) break
    if (pense.pensee.length > 0) contexte.emettre(pense.pensee)

    observations = []
    let fini = false
    for (const action of pense.actions) {
      const resultat = await executer(action, contexte, mission, chantier, enfants)
      observations.push(resultat.observation)
      if (resultat.aPublie) publie = true
      if (resultat.fini) fini = true
    }
    if (fini) break
  }

  // Un agent qui s'arrête sans avoir publié laisserait tout son aval en
  // attente pour toujours : il publie ce qu'il a, plutôt que rien.
  if (!publie) {
    for (const nom of mission.fournit) {
      contexte.fournir(nom, { de: mission.nom, texte: `${mission.role} — sans production.` })
      chantier.publications.set(nom, `${mission.role} — sans production.`)
    }
  }
  contexte.terminer()
}

const resumerValeur = (valeur: unknown): string => {
  if (typeof valeur === 'function') return '(un outil exécutable)'
  if (typeof valeur === 'string') return valeur.slice(0, 600)
  if (valeur === undefined) return '(rien)'
  if (typeof valeur === 'object' && valeur !== null && 'texte' in valeur) {
    return String((valeur as { texte: unknown }).texte).slice(0, 600)
  }
  try {
    return JSON.stringify(valeur).slice(0, 600)
  } catch {
    return '(valeur illisible)'
  }
}

interface Resultat {
  observation: string
  fini?: boolean
  aPublie?: boolean
}

async function executer(
  action: Action,
  contexte: ContexteComposant,
  mission: Mission,
  chantier: Chantier,
  enfants: Map<string, IdComposant>,
): Promise<Resultat> {
  switch (action.type) {
    case 'dire':
      contexte.emettre(action.message)
      return { observation: `dit : ${action.message}` }

    case 'creer': {
      if (mission.profondeur >= chantier.budget.profondeurMax) {
        return { observation: `refusé : profondeur maximale atteinte, fais-le toi-même.` }
      }
      if (chantier.agentsCrees >= chantier.budget.agentsMax) {
        return { observation: `refusé : ${chantier.budget.agentsMax} agents au maximum.` }
      }
      if (chantier.noms.has(action.nom)) {
        return { observation: `refusé : « ${action.nom} » existe déjà.` }
      }
      const collision = action.fournit.find((nom) => chantier.publications.has(nom))
      if (collision !== undefined) {
        return { observation: `refusé : « ${collision} » est déjà publié par un autre.` }
      }

      chantier.noms.add(action.nom)
      chantier.agentsCrees += 1
      for (const nom of action.fournit) chantier.publications.set(nom, '(en cours)')
      const id = await contexte.charger(
        agentLibre(
          {
            nom: action.nom,
            libelle: action.libelle,
            role: action.role,
            mission: action.mission,
            injecte: action.injecte,
            fournit: action.fournit,
            profondeur: mission.profondeur + 1,
          },
          chantier,
        ),
      )
      if (id === undefined) {
        chantier.noms.delete(action.nom)
        chantier.agentsCrees -= 1
        return { observation: `« ${action.nom} » n'a pas pu être chargé.` }
      }
      enfants.set(action.nom, id)
      return { observation: `« ${action.nom} » existe maintenant.` }
    }

    case 'demander': {
      const reponse = await contexte.demander(action.a, action.question)
      return {
        observation:
          reponse === undefined
            ? `« ${action.a} » n'a pas répondu.`
            : `« ${action.a} » répond : ${reponse}`,
      }
    }

    case 'fabriquer': {
      if (chantier.publications.has(action.fournit)) {
        return { observation: `refusé : « ${action.fournit} » est déjà publié.` }
      }
      const compile = compilerOutil(action.code)
      if (!compile.ok) {
        contexte.publierArtefact({
          titre: 'Outil refusé',
          corps: `${compile.erreur}\n\n${action.code}`,
          decouleDe: 'ta mission',
        })
        return { observation: `l'outil « ${action.nom} » ne compile pas : ${compile.erreur}` }
      }
      chantier.publications.set(action.fournit, '(un outil exécutable)')
      const id = await contexte.charger(
        composantOutil(action.nom, action.fournit, compile.fonction),
        {
          specification: `nom : ${action.nom}\npublie : ${action.fournit}\nécrit par « ${mission.nom} »`,
          source: action.code,
          voie: 'evaluation',
        },
      )
      if (id === undefined) {
        chantier.publications.delete(action.fournit)
        return { observation: `l'outil « ${action.nom} » n'a pas pu être chargé.` }
      }
      enfants.set(action.nom, id)
      return { observation: `l'outil « ${action.nom} » tourne et publie « ${action.fournit} ».` }
    }

    case 'publier': {
      if (!mission.fournit.includes(action.nom)) {
        return { observation: `refusé : tu ne publies pas « ${action.nom} ».` }
      }
      contexte.fournir(action.nom, { de: mission.nom, texte: action.texte })
      chantier.publications.set(action.nom, action.texte)
      contexte.publierArtefact({
        titre: mission.libelle,
        corps: action.texte,
        decouleDe: mission.injecte.length > 0 ? mission.injecte.join(', ') : 'le brief',
      })
      return { observation: `« ${action.nom} » est publié.`, aPublie: true }
    }

    case 'retirer': {
      const id = enfants.get(action.nom)
      if (id === undefined) return { observation: `refusé : tu n'as pas créé « ${action.nom} ».` }
      const retire = await contexte.liberer(id)
      if (retire) {
        enfants.delete(action.nom)
        chantier.noms.delete(action.nom)
      }
      return { observation: retire ? `« ${action.nom} » est retiré.` : 'retrait refusé.' }
    }

    case 'terminer':
      if (action.resume.length > 0) contexte.emettre(action.resume)
      return { observation: 'terminé', fini: true }
  }
}
