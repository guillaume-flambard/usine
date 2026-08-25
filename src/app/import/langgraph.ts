// Adaptateur LangGraph : un export de run LangGraph devient une archive interne.
//
// Forme acceptée en v1 (conservatrice — on projette ce qui existe, on n'invente
// rien) :
//
//   {
//     "graph"?: string,                 // nom du graphe, sert de brief
//     "steps": [
//       { "node": string, "start": number, "end"?: number,
//         "output"?: string, "error"?: string }
//     ]
//   }
//
// `start`/`end` sont des horodatages absolus en millisecondes. Chaque nœud
// distinct devient un composant (créé une fois, à sa première apparition) ;
// chaque étape l'active, puis émet son message, le termine, ou le met en faute.
// Aucune arête n'est fabriquée : une trace plate donne un graphe plat, honnêtement.

import type { ComponentId } from '../../runtime/contract'
import type { WithoutSequence } from '../../runtime/events'
import { archiveOf } from '../replay'
import { normalizeStream, type RawStep } from './normalize'
import type { ImportError, ImportResult, TraceAdapter } from './index'

interface LangGraphStep {
  node: string
  start: number
  end?: number
  output?: string
  error?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Reconnu comme LangGraph : un objet avec un tableau `steps`. */
const looksLikeLangGraph = (input: unknown): input is Record<string, unknown> =>
  isRecord(input) && Array.isArray(input.steps)

/** Un pas exploitable a au moins un `node` non vide et un `start` numérique. */
const readStep = (raw: unknown): LangGraphStep | undefined => {
  if (!isRecord(raw)) return undefined
  if (typeof raw.node !== 'string' || raw.node.length === 0) return undefined
  if (typeof raw.start !== 'number' || !Number.isFinite(raw.start)) return undefined
  return {
    node: raw.node,
    start: raw.start,
    end: typeof raw.end === 'number' && Number.isFinite(raw.end) ? raw.end : undefined,
    output: typeof raw.output === 'string' ? raw.output : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  }
}

const fail = (reason: string): ImportError => ({ ok: false, reason })

function adapt(input: Record<string, unknown>): ImportResult {
  const rawSteps = input.steps as unknown[]
  if (rawSteps.length === 0) return fail('trace LangGraph vide : aucune étape')

  const steps: LangGraphStep[] = []
  for (const raw of rawSteps) {
    const step = readStep(raw)
    if (step === undefined) return fail('étape LangGraph invalide : `node` et `start` requis')
    steps.push(step)
  }

  const created = new Set<string>()
  const proto: RawStep[] = []
  for (const step of steps) {
    const id = step.node as ComponentId
    if (!created.has(step.node)) {
      created.add(step.node)
      proto.push({
        at: step.start,
        event: {
          type: 'component-created',
          id,
          name: step.node,
          display: { role: `Nœud LangGraph « ${step.node} »` },
          needs: [],
          provides: [],
        } satisfies WithoutSequence,
      })
    }
    proto.push({ at: step.start, event: { type: 'component-activated', id } })
    if (step.output !== undefined) {
      proto.push({ at: step.end ?? step.start, event: { type: 'message-emitted', id, message: step.output } })
    }
    if (step.error !== undefined) {
      proto.push({
        at: step.end ?? step.start,
        event: {
          type: 'component-failed',
          error: { code: 'activation-failed', message: step.error, component: id, name: step.node },
        },
      })
    } else if (step.end !== undefined) {
      proto.push({ at: step.end, event: { type: 'work-finished', id } })
    }
  }

  const brief = typeof input.graph === 'string' ? input.graph : 'Trace LangGraph importée'
  return archiveOf(brief, normalizeStream(proto), 'foreign')
}

export const langgraphAdapter: TraceAdapter = {
  source: 'LangGraph',
  tryAdapt(input: unknown): ImportResult | undefined {
    if (!looksLikeLangGraph(input)) return undefined
    return adapt(input)
  },
}
