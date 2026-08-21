// The free agent. It has no behaviour: it has a mission, and on each turn it
// decides what to do — create an agent, question one, write a tool, publish,
// remove, stop.
//
// Nothing here knows the domain. What bounds an agent is not a catalogue but a
// budget: how many agents may exist, to what depth, how many turns each, how
// many tokens in total.

import type { Component, ComponentContext, ComponentId } from '../runtime/contract'
import { type Reasoner, type Reasoning } from '../runtime/reasoner'
import { readCalls, readTurn, type Action, type Turn } from './actions'
import { TOOLS } from './turn-schema'
import { behaviourComponent } from '../app/behaviour'
import type { SpawnWorker } from '../app/isolate'
import type { SourceFetcher } from '../app/sources'
import { createRecall, type Recall } from './recall'

export interface Mission {
  name: string
  label: string
  role: string
  /** What it is asked to accomplish, in French. */
  mission: string
  needs: readonly string[]
  provides: readonly string[]
  /** How far from the master. Bounds the recursion. */
  depth: number
}

/**
 * What keeps a free run from going on forever. Not an engine limit: a bill
 * limit, and a readability limit.
 */
export interface Budget {
  maxAgents: number
  maxDepth: number
  maxTurns: number
  maxTokens: number
}

export const BUDGET: Budget = {
  maxAgents: 10,
  maxDepth: 3,
  maxTurns: 3,
  maxTokens: 120_000,
}

/** The shared state of a free run. One object, mutated by the agents. */
export interface Worksite {
  budget: Budget
  /** Agent names already taken, master included. */
  names: Set<string>
  agentsCreated: number
  tokens: number
  /** The brief, recalled to every agent: without it, a deep agent drifts. */
  brief: string
  reasoner: Reasoner
  /** What each agent published, for the next ones' context. */
  publications: Map<string, string>
  /**
   * The live behaviours of the application, by name: which component carries
   * one, which version it is at, and who wrote it. The worksite holds this
   * rather than an agent, because a behaviour outlives the turn that made it
   * and may be replaced from another turn entirely.
   */
  behaviours: Map<string, { id: ComponentId; version: number; author: string }>
  /** The application's screen, as last posted. Empty until an agent posts one. */
  screen: { markup: string; revision: number }
  /** Tours que le modèle a rendus illisibles malgré la forme demandée. */
  malformed: number
  /**
   * Comment on va chercher une source. Absent, un « source » est ignoré et le
   * comportement reste pur — un run hors ligne fait moins, il n'échoue pas.
   */
  fetchSource?: SourceFetcher
  /** Les sources que le service sert, demandées à l'exécution. */
  sources: readonly { name: string; description: string }[]
  /**
   * Ce que le chantier a déjà établi.
   *
   * Sans lui, un agent né au troisième tour repart du brief brut : les
   * coeffets font circuler ce qui est structurel, pas ce qui est su.
   */
  recall: Recall
  /**
   * How an isolated thread is made. Left undefined in the product — the
   * default is a real worker. Tests hand in a stand-in, because a node test
   * has no `Worker` and would otherwise prove nothing about the orchestration.
   */
  spawnWorker?: SpawnWorker
}

export const createWorksite = (
  brief: string,
  reasoner: Reasoner,
  budget: Budget = BUDGET,
  spawnWorker?: SpawnWorker,
): Worksite => ({
  budget,
  names: new Set(['master-agent']),
  agentsCreated: 0,
  tokens: 0,
  brief,
  reasoner,
  publications: new Map(),
  behaviours: new Map(),
  screen: { markup: '', revision: 0 },
  malformed: 0,
  sources: [],
  recall: createRecall(),
  ...(spawnWorker !== undefined ? { spawnWorker } : {}),
})

// Ce que l'agent doit savoir, et rien de plus.
//
// La forme des actions n'est plus ici : elle est dans le vocabulaire d'outils
// (`turn-schema.ts`), que le fournisseur reçoit et contraint. Répéter le JSON
// dans l'invite le ferait diverger du schéma au premier changement, et un
// modèle devant deux descriptions du même objet suit la mauvaise.
//
// Ce qui reste : **quand** employer chaque outil, et ce que le run attend.
export const INSTRUCTIONS = `Tu es un agent d'une usine logicielle qui se construit elle-même. Tu agis en appelant les outils qui te sont donnés — un tour sans action est un tour perdu.

Ressources que tu peux injecter : "brief" (le besoin) et tout nom publié par un autre agent.

Règles :
- Ne crée un agent que si tu ne peux pas faire son travail toi-même.
- **Un texte qui décrit une application n'est pas une application.** Le run n'a de produit que si un écran existe et qu'au moins un comportement répond.
- L'écran ne contient QUE du balisage : pas de script, pas d'attribut d'événement, pas de style. Il appelle un comportement par data-invoke sur une commande, lit une saisie par data-field, et affiche la réponse dans data-output. Toute la logique est dans les comportements.
- Le code d'un comportement est une expression JavaScript qui s'évalue en fonction d'un seul argument et retourne une valeur — pas d'import, pas de réseau, pas de DOM. Elle doit marcher sur une entrée quelconque, pas seulement sur un exemple.
- **Le visiteur se sert de l'application pendant que tu travailles.** Pose un écran et un premier comportement le plus tôt possible, même grossiers, puis améliore-les. Un remplacement raté ne casse rien : la version précédente continue de servir.
- Tu ne peux remplacer qu'un comportement que tu as écrit toi-même.
- **Une source rend l'application utile.** Si le besoin demande une donnée réelle, nomme une source de la liste dans ton comportement : ton code reçoit alors une chaîne JSON portant l'entrée du visiteur, les données de la source, et la panne si elle n'a pas répondu. Tu nommes une source ; tu ne fournis jamais une adresse.
- Publie avant de terminer. Termine dès que ta mission est remplie.`

/**
 * Where the application stands, said to every agent on every turn.
 *
 * This is what keeps the worksite from congratulating itself: an agent that
 * reads "the application answers nothing yet" on its second turn has been
 * told, in the only channel it has, that the run has not produced anything
 * usable. Without it, a model happily declares itself done over a screen with
 * no behaviour behind it.
 */
function applicationStatus(worksite: Worksite): string {
  const behaviours = [...worksite.behaviours.entries()].map(
    ([name, live]) => `${name} (v${live.version})`,
  )
  if (worksite.screen.revision === 0) {
    return "État de l'application : AUCUN ÉCRAN. Personne n'a encore posé « screen » — tant qu'il manque, le run n'a pas de produit."
  }
  if (behaviours.length === 0) {
    return "État de l'application : un écran existe mais AUCUN COMPORTEMENT ne répond. Les commandes de l'écran sont inertes."
  }
  return `État de l'application : écran posé, comportements en service : ${behaviours.join(', ')}. Le visiteur peut s'en servir maintenant ; « replace » l'améliore sans rien lui faire perdre.`
}

/** Ce qu'un agent peut brancher. Demandé au service, jamais écrit ici. */
const sourcesLine = (worksite: Worksite): string =>
  worksite.sources.length === 0
    ? "Sources de données : aucune n'est disponible ; un comportement ne travaille que sur ce que le visiteur tape."
    : `Sources branchables (ajoute "source":"<nom>" à un build ou un replace, et ton code reçoit {"entree","donnees"} en JSON) : ${worksite.sources
        .map((source) => `${source.name} — ${source.description}`)
        .join(' | ')}`

const turnContext = (
  mission: Mission,
  worksite: Worksite,
  readValues: readonly { name: string; text: string }[],
  observations: readonly string[],
  turnsLeft: number,
): string => {
  // Rappelé sur la mission, pas sur le brief : deux agents du même run ont le
  // même brief et des missions différentes, donc c'est la mission qui discrimine.
  const established = worksite.recall.recall(`${mission.role} ${mission.mission}`)
  return [
    `Brief du run : ${worksite.brief}`,
    `Toi : ${mission.name} — ${mission.role}`,
    `Ta mission : ${mission.mission}`,
    mission.provides.length > 0
      ? `Tu dois publier : ${mission.provides.join(', ')}`
      : 'Tu ne publies rien : ton travail est de faire travailler les autres.',
    `Profondeur ${mission.depth} sur ${worksite.budget.maxDepth} — au-delà, « create » sera refusé.`,
    `Agents vivants : ${[...worksite.names].join(', ')}`,
    applicationStatus(worksite),
    sourcesLine(worksite),
    `Il te reste ${turnsLeft} tour(s).`,
    ...(readValues.length > 0
      ? ['', 'Ce que tu lis :', ...readValues.map((r) => `- ${r.name} : ${r.text}`)]
      : []),
    ...(established.length > 0
      ? ['', 'Ce que le chantier a déjà établi :', ...established.map((fact) => `- ${fact.author} : ${fact.text}`)]
      : []),
    ...(observations.length > 0 ? ['', 'Ce qui vient de se passer :', ...observations] : []),
  ].join('\n')
}

/** One turn of reasoning, reduced to a readable shape whatever happens. */
export async function think(
  context: ComponentContext,
  worksite: Worksite,
  instruction: string,
  contextText: string,
): Promise<Turn | undefined> {
  if (worksite.tokens >= worksite.budget.maxTokens) return undefined

  const reasoning: Reasoning = await worksite.reasoner
    .reason({
      role: 'agent',
      instruction,
      context: contextText,
      fallback: '',
      // Le vocabulaire, en outils. Le fournisseur émet le nom de l'action hors
      // du corps JSON ; celui qui ne sait pas faire rend du texte, et la
      // relecture ci-dessous s'en charge comme avant.
      tools: TOOLS,
    })
    .catch((cause) => ({
      text: '',
      origin: 'deterministic' as const,
      failure: cause instanceof Error ? cause.message : String(cause),
    }))

  if (reasoning.tokens !== undefined || reasoning.failure !== undefined) {
    worksite.tokens += (reasoning.tokens?.input ?? 0) + (reasoning.tokens?.output ?? 0)
    context.countTokens(
      reasoning.tokens?.input ?? 0,
      reasoning.tokens?.output ?? 0,
      reasoning.failure,
    )
  }
  if (reasoning.text.trim().length === 0 && (reasoning.calls?.length ?? 0) === 0) {
    // Silence here would be the worst outcome: the agent would stop for no
    // stated reason and the graph would show a run that simply did nothing.
    context.emit(
      reasoning.failure !== undefined
        ? `Le modèle n'a pas répondu : ${reasoning.failure}`
        : 'Le modèle a répondu sans texte.',
    )
    return undefined
  }

  // La voie fiable d'abord : des appels d'outils n'ont pas besoin d'être
  // découpés dans du texte.
  if (reasoning.calls !== undefined && reasoning.calls.length > 0) {
    return readCalls(reasoning.text, reasoning.calls)
  }

  try {
    return readTurn(reasoning.text)
  } catch (cause) {
    // Compté, pas seulement dit. Un taux de non-conformité est une mesure de
    // la qualité du fournisseur et du prompt ; le laisser invisible revient à
    // découvrir une dérive en regardant un run au hasard.
    worksite.malformed += 1
    context.emit(
      `Réponse illisible : ${cause instanceof Error ? cause.message : String(cause)}`,
      'malformed',
    )
    return undefined
  }
}

/**
 * A free agent. Its loop: read what it has, think, act, start over — until it
 * declares itself done or its turn budget runs out.
 */
export function freeAgent(mission: Mission, worksite: Worksite): Component {
  return {
    name: mission.name,
    needs: mission.needs,
    provides: mission.provides,
    display: { label: mission.label, role: mission.role },
    apply(context) {
      // Answering is a passive action: the agent must be reachable while it
      // works, otherwise "they talk to each other" does not exist.
      context.listen(async (question, from) => {
        const turn = await think(
          context,
          worksite,
          'On t\'interroge. Réponds en deux phrases par un JSON {"thought":"","actions":[{"type":"say","message":"ta réponse"}]}.',
          [
            `Toi : ${mission.name} — ${mission.role}`,
            `Ta mission : ${mission.mission}`,
            `Question posée par ${from} : ${question}`,
          ].join('\n'),
        )
        const said = turn?.actions.find((action) => action.type === 'say')
        return said?.type === 'say' ? said.message : `${mission.role}.`
      })

      void runLoop(context, mission, worksite)
    },
  }
}

/** Au-delà, un agent qui répète le même refus tourne en rond. */
const STUCK_AFTER = 3

export interface LoopOptions {
  /**
   * Whether the loop marks the component finished when it stops. The master
   * says no: it still has to wait for the worksite to settle and open the
   * human gate, and announcing itself finished before that would show a run
   * as over while it is still working.
   */
  finishWhenDone?: boolean
}

export async function runLoop(
  context: ComponentContext,
  mission: Mission,
  worksite: Worksite,
  options: LoopOptions = {},
): Promise<void> {
  const children = new Map<string, ComponentId>()
  // What this agent has already filled. Publishing a name twice makes the
  // kernel fail the component — an agent must not be able to kill itself by
  // repeating an action it already took.
  const filled = new Set<string>()
  /** Combien de fois chaque refus est revenu à l'identique. */
  const refusals = new Map<string, number>()
  let observations: string[] = []

  for (let turn = 0; turn < worksite.budget.maxTurns; turn += 1) {
    const readValues = mission.needs.map((name) => ({
      name,
      text: summarise(context.read(name)),
    }))

    const thought = await think(
      context,
      worksite,
      INSTRUCTIONS,
      turnContext(mission, worksite, readValues, observations, worksite.budget.maxTurns - turn),
    )
    if (thought === undefined) break
    if (thought.thought.length > 0) context.emit(thought.thought)

    observations = []
    let done = false
    for (const action of thought.actions) {
      const result = await execute(action, context, mission, worksite, children, filled)
      observations.push(result.observation)
      if (result.refused === true) {
        const seen = (refusals.get(result.observation) ?? 0) + 1
        refusals.set(result.observation, seen)
        if (seen >= STUCK_AFTER) {
          // Trois fois le même refus : l'agent ne se corrigera pas tout seul,
          // et chaque tour de plus coûte des tokens pour rien.
          context.emit(
            `${mission.name} répète la même action refusée : il s'arrête.`,
            'refusal',
          )
          done = true
          break
        }
      }
      // A refused action is fed back to the agent, but it must also be
      // visible: a run where nothing was built and nothing said why is
      // exactly the silence this product refuses.
      // Classé, pas seulement dit : une évaluation qui compterait les refus en
      // cherchant un mot casserait le jour où quelqu'un reformule le message.
      if (result.refused === true) context.emit(result.observation, result.kind ?? 'refusal')
      if (result.done) done = true
    }
    if (done) break
  }

  // An agent that stops without having published would leave everything
  // downstream waiting forever: it publishes what it has rather than nothing.
  for (const name of mission.provides) {
    if (filled.has(name)) continue
    // A name left empty would leave everything downstream waiting forever:
    // the agent publishes what it has rather than nothing.
    context.provide(name, { from: mission.name, text: `${mission.role} — sans production.` })
    worksite.publications.set(name, `${mission.role} — sans production.`)
  }
  if (options.finishWhenDone !== false) context.finish()
}

const summarise = (value: unknown): string => {
  if (typeof value === 'function') return '(un outil exécutable)'
  if (typeof value === 'string') return value.slice(0, 600)
  if (value === undefined) return '(rien)'
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text).slice(0, 600)
  }
  try {
    return JSON.stringify(value).slice(0, 600)
  } catch {
    return '(valeur illisible)'
  }
}

interface Outcome {
  observation: string
  done?: boolean
  /** The action did not happen. It is said out loud, not only fed back. */
  refused?: boolean
  /** Ce que le refus est, quand il est plus qu'un refus ordinaire. */
  kind?: 'refusal' | 'rollback'
}

async function execute(
  action: Action,
  context: ComponentContext,
  mission: Mission,
  worksite: Worksite,
  children: Map<string, ComponentId>,
  filled: Set<string>,
): Promise<Outcome> {
  switch (action.type) {
    case 'say':
      context.emit(action.message)
      return { observation: `dit : ${action.message}` }

    case 'create': {
      if (mission.depth >= worksite.budget.maxDepth) {
        return {
          observation: 'refusé : profondeur maximale atteinte, fais-le toi-même.',
          refused: true,
        }
      }
      if (worksite.agentsCreated >= worksite.budget.maxAgents) {
        return {
          observation: `refusé : ${worksite.budget.maxAgents} agents au maximum.`,
          refused: true,
        }
      }
      if (worksite.names.has(action.name)) {
        return { observation: `refusé : « ${action.name} » existe déjà.`, refused: true }
      }
      const clash = action.provides.find((name) => worksite.publications.has(name))
      if (clash !== undefined) {
        return { observation: `refusé : « ${clash} » est déjà publié par un autre.`, refused: true }
      }

      worksite.names.add(action.name)
      worksite.agentsCreated += 1
      for (const name of action.provides) worksite.publications.set(name, '(en cours)')
      const id = await context.load(
        freeAgent(
          {
            name: action.name,
            label: action.label,
            role: action.role,
            mission: action.mission,
            needs: action.needs,
            provides: action.provides,
            depth: mission.depth + 1,
          },
          worksite,
        ),
      )
      if (id === undefined) {
        worksite.names.delete(action.name)
        worksite.agentsCreated -= 1
        return { observation: `« ${action.name} » n'a pas pu être chargé.`, refused: true }
      }
      children.set(action.name, id)
      return { observation: `« ${action.name} » existe maintenant.` }
    }

    case 'ask': {
      const answer = await context.ask(action.to, action.question)
      return {
        observation:
          answer === undefined
            ? `« ${action.to} » n'a pas répondu.`
            : `« ${action.to} » répond : ${answer}`,
      }
    }

    case 'screen': {
      // Through the kernel, not into the worksite: the screen has to be in the
      // event stream or a replayed run would open on nothing.
      const revision = context.postScreen(action.markup)
      worksite.screen = { markup: action.markup, revision }
      context.emit(
        revision === 1
          ? "L'écran de l'application est posé."
          : `L'écran est reposé (révision ${revision}).`,
      )
      return { observation: `écran posé (révision ${revision}).` }
    }

    case 'build': {
      if (worksite.behaviours.has(action.name)) {
        return {
          observation: `refusé : « ${action.name} » existe déjà — utilise « replace » pour l'améliorer.`,
          refused: true,
        }
      }
      const version = 1
      const made = await behaviourComponent(
        {
          name: action.name,
          version,
          code: action.code,
          author: mission.name,
          ...(action.source !== undefined ? { source: action.source } : {}),
        },
        worksite.spawnWorker,
        worksite.fetchSource,
      )
      if (!('component' in made)) {
        context.publishArtifact({
          title: `Comportement refusé — ${action.name}`,
          body: `${made.failure}\n\n${action.code}`,
          derivedFrom: 'ta mission',
        })
        return {
          observation: `le comportement « ${action.name} » ne compile pas : ${made.failure}`,
          refused: true,
        }
      }
      const id = await context.load(made.component, {
        specification: `comportement : ${action.name}\nversion : ${version}\nécrit par « ${mission.name} »`,
        source: action.code,
        route: 'evaluation',
      })
      if (id === undefined) {
        return {
          observation: `le comportement « ${action.name} » n'a pas pu être chargé.`,
          refused: true,
        }
      }
      worksite.behaviours.set(action.name, { id, version, author: mission.name })
      children.set(`${action.name}-v${version}`, id)
      return { observation: `le comportement « ${action.name} » sert maintenant (v${version}).` }
    }

    case 'replace': {
      const live = worksite.behaviours.get(action.name)
      if (live === undefined) {
        return {
          observation: `refusé : « ${action.name} » n'existe pas — utilise « build » pour l'écrire.`,
          refused: true,
        }
      }
      if (live.author !== mission.name) {
        return {
          observation: `refusé : « ${action.name} » appartient à « ${live.author} », pas à toi.`,
          refused: true,
        }
      }
      const version = live.version + 1
      const made = await behaviourComponent(
        {
          name: action.name,
          version,
          code: action.code,
          author: mission.name,
          ...(action.source !== undefined ? { source: action.source } : {}),
        },
        worksite.spawnWorker,
        worksite.fetchSource,
      )
      if (!('component' in made)) {
        return {
          observation: `refusé : la v${version} de « ${action.name} » ne compile pas (${made.failure}) ; la v${live.version} continue de servir.`,
          refused: true,
          kind: 'rollback',
        }
      }
      const id = await context.replace(live.id, made.component, {
        specification: `comportement : ${action.name}\nversion : ${version}\nremplace la v${live.version}`,
        source: action.code,
        route: 'evaluation',
      })
      if (id === undefined) {
        // The kernel put the previous version back, with the components it had
        // loaded. Nothing is missing — the improvement simply did not take.
        return {
          observation: `refusé : la v${version} de « ${action.name} » est tombée ; la v${live.version} continue de servir.`,
          refused: true,
          kind: 'rollback',
        }
      }
      worksite.behaviours.set(action.name, { id, version, author: mission.name })
      children.delete(`${action.name}-v${live.version}`)
      children.set(`${action.name}-v${version}`, id)
      context.emit(`« ${action.name} » passe en v${version}, sans redémarrage.`)
      return { observation: `« ${action.name} » passe en v${version}.` }
    }

    case 'publish': {
      if (!mission.provides.includes(action.name)) {
        return { observation: `refusé : tu ne publies pas « ${action.name} ».`, refused: true }
      }
      if (filled.has(action.name)) {
        return {
          observation: `refusé : « ${action.name} » est déjà rempli ; ne le remplace pas.`,
          refused: true,
        }
      }
      filled.add(action.name)
      context.provide(action.name, { from: mission.name, text: action.text })
      worksite.publications.set(action.name, action.text)
      // Publié *et* retenu : le coeffet sert ceux qui ont déclaré le nom, le
      // rappel sert ceux qui n'existaient pas encore pour le déclarer.
      worksite.recall.remember({ author: mission.name, text: action.text })
      context.publishArtifact({
        title: mission.label,
        body: action.text,
        derivedFrom: mission.needs.length > 0 ? mission.needs.join(', ') : 'le brief',
      })
      return { observation: `« ${action.name} » est publié.` }
    }

    case 'remove': {
      const id = children.get(action.name)
      if (id === undefined) {
        // Le refus dit ce qui est possible, pas seulement ce qui ne l'est pas.
        // Un refus qui n'apprend rien se fait répéter à l'identique, et c'est
        // arrivé six fois de suite en production.
        const mine = [...children.keys()]
        return {
          observation:
            mine.length === 0
              ? `refusé : tu n'as créé personne, donc tu n'as rien à retirer. Si tu voulais faire naître un agent, l'action est « create ».`
              : `refusé : tu n'as pas créé « ${action.name} ». Tu as créé : ${mine.join(', ')}.`,
          refused: true,
        }
      }
      const removed = await context.release(id)
      if (removed) {
        children.delete(action.name)
        worksite.names.delete(action.name)
      }
      return { observation: removed ? `« ${action.name} » est retiré.` : 'retrait refusé.' }
    }

    case 'done':
      if (action.summary.length > 0) context.emit(action.summary)
      return { observation: 'terminé', done: true }
  }
}
