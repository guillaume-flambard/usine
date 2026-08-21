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
  maxAgents: 14,
  maxDepth: 3,
  maxTurns: 4,
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

Règles : ne crée un agent que si tu ne peux pas faire son travail toi-même. Le code de "build" est une expression JavaScript qui s'évalue en fonction d'un seul argument — pas d'import, pas de réseau, pas d'accès au DOM. Publie avant de terminer. Termine dès que ta mission est remplie.`

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
  if (reasoning.text.trim().length === 0) return undefined

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

/** The tool, once compiled: a component like any other. */
const toolComponent = (name: string, provides: string, fn: unknown): Component => ({
  name,
  provides: [provides],
  display: {
    label: name.slice(0, 26),
    role: `Outil écrit pendant le run, publié sous « ${provides} »`,
    technology: 'code évalué',
  },
  apply(context) {
    context.provide(provides, fn)
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

export async function runLoop(
  context: ComponentContext,
  mission: Mission,
  worksite: Worksite,
): Promise<void> {
  const children = new Map<string, ComponentId>()
  let observations: string[] = []
  let published = false

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
      const result = await execute(action, context, mission, worksite, children)
      observations.push(result.observation)
      if (result.published) published = true
      if (result.done) done = true
    }
    if (done) break
  }

  // An agent that stops without having published would leave everything
  // downstream waiting forever: it publishes what it has rather than nothing.
  if (!published) {
    for (const name of mission.provides) {
      context.provide(name, { from: mission.name, text: `${mission.role} — sans production.` })
      worksite.publications.set(name, `${mission.role} — sans production.`)
    }
  }
  context.finish()
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
  published?: boolean
}

async function execute(
  action: Action,
  context: ComponentContext,
  mission: Mission,
  worksite: Worksite,
  children: Map<string, ComponentId>,
): Promise<Outcome> {
  switch (action.type) {
    case 'say':
      context.emit(action.message)
      return { observation: `dit : ${action.message}` }

    case 'create': {
      if (mission.depth >= worksite.budget.maxDepth) {
        return { observation: 'refusé : profondeur maximale atteinte, fais-le toi-même.' }
      }
      if (worksite.agentsCreated >= worksite.budget.maxAgents) {
        return { observation: `refusé : ${worksite.budget.maxAgents} agents au maximum.` }
      }
      if (worksite.names.has(action.name)) {
        return { observation: `refusé : « ${action.name} » existe déjà.` }
      }
      const clash = action.provides.find((name) => worksite.publications.has(name))
      if (clash !== undefined) {
        return { observation: `refusé : « ${clash} » est déjà publié par un autre.` }
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
        return { observation: `« ${action.name} » n'a pas pu être chargé.` }
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
      if (worksite.publications.has(action.provides)) {
        return { observation: `refusé : « ${action.provides} » est déjà publié.` }
      }
      const compiled = compileTool(action.code)
      if (!compiled.ok) {
        context.publishArtifact({
          title: 'Outil refusé',
          body: `${compiled.error}\n\n${action.code}`,
          derivedFrom: 'ta mission',
        })
        return { observation: `l'outil « ${action.name} » ne compile pas : ${compiled.error}` }
      }
      worksite.publications.set(action.provides, '(un outil exécutable)')
      const id = await context.load(toolComponent(action.name, action.provides, compiled.fn), {
        specification: `nom : ${action.name}\npublie : ${action.provides}\nécrit par « ${mission.name} »`,
        source: action.code,
        route: 'evaluation',
      })
      if (id === undefined) {
        worksite.publications.delete(action.provides)
        return { observation: `l'outil « ${action.name} » n'a pas pu être chargé.` }
      }
      children.set(action.name, id)
      return { observation: `l'outil « ${action.name} » tourne et publie « ${action.provides} ».` }
    }

    case 'publish': {
      if (!mission.provides.includes(action.name)) {
        return { observation: `refusé : tu ne publies pas « ${action.name} ».` }
      }
      context.provide(action.name, { from: mission.name, text: action.text })
      worksite.publications.set(action.name, action.text)
      context.publishArtifact({
        title: mission.label,
        body: action.text,
        derivedFrom: mission.needs.length > 0 ? mission.needs.join(', ') : 'le brief',
      })
      return { observation: `« ${action.name} » est publié.`, published: true }
    }

    case 'remove': {
      const id = children.get(action.name)
      if (id === undefined) return { observation: `refusé : tu n'as pas créé « ${action.name} ».` }
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
