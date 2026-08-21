// The free agent. It has no behaviour: it has a mission, and on each turn it
// decides what to do — create an agent, question one, write a tool, publish,
// remove, stop.
//
// Nothing here knows the domain. What bounds an agent is not a catalogue but a
// budget: how many agents may exist, to what depth, how many turns each, how
// many tokens in total.

import type { Component, ComponentContext, ComponentId } from '../runtime/contract'
import { type Reasoner, type Reasoning } from '../runtime/reasoner'
import { readTurn, type Action, type Turn } from './actions'

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
}

export const createWorksite = (
  brief: string,
  reasoner: Reasoner,
  budget: Budget = BUDGET,
): Worksite => ({
  budget,
  names: new Set(['master-agent']),
  agentsCreated: 0,
  tokens: 0,
  brief,
  reasoner,
  publications: new Map(),
})

export const INSTRUCTIONS = `Tu es un agent d'une usine logicielle qui se construit elle-même. Tu réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"thought":"une phrase","actions":[ … ]}

Actions possibles :
{"type":"create","name":"kebab-case","label":"court","role":"une ligne","mission":"ce qu'il doit accomplir","needs":["nom-publié-par-un-autre"],"provides":["nom-qu-il-publiera"]}
{"type":"ask","to":"nom-d-un-agent-vivant","question":"…"}
{"type":"build","name":"kebab-case","provides":"nom-de-l-outil","code":"(entree) => { … return … }"}
{"type":"publish","name":"un-de-tes-noms-fournis","text":"…"}
{"type":"remove","name":"un-agent-que-tu-as-créé"}
{"type":"say","message":"…"}
{"type":"done","summary":"…"}

Ressources disponibles à injecter : "brief" (le besoin), "corpus" (des corpus de règles réelles, avec leur source), et tout nom publié par un autre agent.

Règles :
- Ne crée un agent que si tu ne peux pas faire son travail toi-même.
- **Un texte qui décrit un outil n'est pas un outil.** Si ta mission est de produire quelque chose d'utilisable, écris-le avec "build". Le run n'a de produit que si un "build" a réussi.
- Le code de "build" est une expression JavaScript qui s'évalue en fonction d'un seul argument — pas d'import, pas de réseau, pas d'accès au DOM. Elle doit marcher sur une entrée quelconque, pas seulement sur un exemple.
- Publie avant de terminer. Termine dès que ta mission est remplie.`

const turnContext = (
  mission: Mission,
  worksite: Worksite,
  readValues: readonly { name: string; text: string }[],
  observations: readonly string[],
  turnsLeft: number,
): string =>
  [
    `Brief du run : ${worksite.brief}`,
    `Toi : ${mission.name} — ${mission.role}`,
    `Ta mission : ${mission.mission}`,
    mission.provides.length > 0
      ? `Tu dois publier : ${mission.provides.join(', ')}`
      : 'Tu ne publies rien : ton travail est de faire travailler les autres.',
    `Profondeur ${mission.depth} sur ${worksite.budget.maxDepth} — au-delà, « create » sera refusé.`,
    `Agents vivants : ${[...worksite.names].join(', ')}`,
    `Il te reste ${turnsLeft} tour(s).`,
    ...(readValues.length > 0
      ? ['', 'Ce que tu lis :', ...readValues.map((r) => `- ${r.name} : ${r.text}`)]
      : []),
    ...(observations.length > 0 ? ['', 'Ce qui vient de se passer :', ...observations] : []),
  ].join('\n')

/** One turn of reasoning, reduced to a readable shape whatever happens. */
export async function think(
  context: ComponentContext,
  worksite: Worksite,
  instruction: string,
  contextText: string,
): Promise<Turn | undefined> {
  if (worksite.tokens >= worksite.budget.maxTokens) return undefined

  const reasoning: Reasoning = await worksite.reasoner
    .reason({ role: 'agent', instruction, context: contextText, fallback: '' })
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
  if (reasoning.text.trim().length === 0) {
    // Silence here would be the worst outcome: the agent would stop for no
    // stated reason and the graph would show a run that simply did nothing.
    context.emit(
      reasoning.failure !== undefined
        ? `Le modèle n'a pas répondu : ${reasoning.failure}`
        : 'Le modèle a répondu sans texte.',
    )
    return undefined
  }

  try {
    return readTurn(reasoning.text)
  } catch (cause) {
    context.emit(`Réponse illisible : ${cause instanceof Error ? cause.message : String(cause)}`)
    return undefined
  }
}

/**
 * Compiles a tool's code. This is a real evaluation: without it, an agent can
 * only assemble a closed vocabulary and nothing unexpected ever comes out. The
 * trade-off is settled at deployment level, not here.
 */
function compileTool(code: string): { ok: true; fn: unknown } | { ok: false; error: string } {
  try {
    const factory = new Function(`"use strict"; return (${code});`) as () => unknown
    const fn = factory()
    if (typeof fn !== 'function') {
      return { ok: false, error: "le code ne s'évalue pas en fonction" }
    }
    return { ok: true, fn }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/**
 * The tool, once compiled: a component like any other.
 *
 * `publishes` is empty when the name belongs to the agent that wrote the tool.
 * That case is the common one — an agent asked to produce X declares X, and
 * the kernel reserved X for it at load time; a child trying to provide X too
 * would be refused. The agent then publishes the function itself, and the tool
 * exists as a node carrying its source. Either way the graph shows it, and the
 * code stays readable.
 */
const toolComponent = (
  name: string,
  publishes: string | undefined,
  provides: string,
  fn: unknown,
): Component => ({
  name,
  ...(publishes !== undefined ? { provides: [publishes] } : {}),
  display: {
    label: name.slice(0, 26),
    role: `Outil écrit pendant le run, publié sous « ${provides} »`,
    technology: 'code évalué',
  },
  apply(context) {
    if (publishes !== undefined) context.provide(publishes, fn)
    context.finish()
  },
})

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
      // A refused action is fed back to the agent, but it must also be
      // visible: a run where nothing was built and nothing said why is
      // exactly the silence this product refuses.
      if (result.refused === true) context.emit(result.observation)
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

    case 'build': {
      // A name the agent itself declared is not a clash: it is precisely the
      // name it was asked to fill, and the tool is how it fills it.
      const mine = mission.provides.includes(action.provides)
      if (filled.has(action.provides)) {
        return {
          observation: `refusé : « ${action.provides} » porte déjà ton outil.`,
          refused: true,
        }
      }
      if (!mine && worksite.publications.has(action.provides)) {
        return { observation: `refusé : « ${action.provides} » est déjà publié.`, refused: true }
      }
      const compiled = compileTool(action.code)
      if (!compiled.ok) {
        context.publishArtifact({
          title: 'Outil refusé',
          body: `${compiled.error}\n\n${action.code}`,
          derivedFrom: 'ta mission',
        })
        return {
          observation: `l'outil « ${action.name} » ne compile pas : ${compiled.error}`,
          refused: true,
        }
      }
      worksite.publications.set(action.provides, '(un outil exécutable)')
      const id = await context.load(
        toolComponent(
          action.name,
          mine ? undefined : action.provides,
          action.provides,
          compiled.fn,
        ),
        {
          specification: `nom : ${action.name}\npublie : ${action.provides}\nécrit par « ${mission.name} »`,
          source: action.code,
          route: 'evaluation',
        },
      )
      if (id === undefined) {
        worksite.publications.delete(action.provides)
        return { observation: `l'outil « ${action.name} » n'a pas pu être chargé.`, refused: true }
      }
      // The agent holds the name: it hands the function over itself, otherwise
      // nobody downstream would ever receive anything executable.
      if (mine) {
        context.provide(action.provides, compiled.fn)
        filled.add(action.provides)
      }
      children.set(action.name, id)
      return {
        observation: `l'outil « ${action.name} » tourne et publie « ${action.provides} ».`,
      }
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
      context.publishArtifact({
        title: mission.label,
        body: action.text,
        derivedFrom: mission.needs.length > 0 ? mission.needs.join(', ') : 'le brief',
      })
      return { observation: `« ${action.name} » est publié.` }
    }

    case 'remove': {
      const id = children.get(action.name)
      if (id === undefined)
        return { observation: `refusé : tu n'as pas créé « ${action.name} ».`, refused: true }
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
