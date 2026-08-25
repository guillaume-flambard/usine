// Adaptateur OTLP : des spans OpenTelemetry deviennent une archive interne.
//
// Forme acceptée en v1 (JSON OTLP trace, tel qu'exporté par un collecteur) :
//
//   {
//     "resourceSpans": [
//       { "scopeSpans": [
//         { "spans": [
//           { "name": string,
//             "startTimeUnixNano": string|number,
//             "endTimeUnixNano"?: string|number,
//             "status"?: { "code"?: number, "message"?: string } }
//         ] }
//       ] }
//     ]
//   }
//
// Chaque span devient un composant activé à son début, terminé à sa fin (ou mis
// en faute si `status.code` vaut 2 = ERROR). Les temps OTLP sont en nanosecondes
// depuis l'époque Unix ; on les ramène en millisecondes, puis `normalizeStream`
// les rend élapsés. Aucune arête n'est fabriquée à partir des liens de spans en
// v1 : on projette ce que le vocabulaire interne sait déjà porter.

import type { ComponentId } from '../../runtime/contract'
import type { WithoutSequence } from '../../runtime/events'
import { archiveOf } from '../replay'
import { normalizeStream, type RawStep } from './normalize'
import type { ImportError, ImportResult, TraceAdapter } from './index'

const OTLP_STATUS_ERROR = 2

interface OtlpSpan {
  name: string
  startMs: number
  endMs?: number
  error?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Reconnu comme OTLP : un objet avec un tableau `resourceSpans`. */
const looksLikeOtlp = (input: unknown): input is Record<string, unknown> =>
  isRecord(input) && Array.isArray(input.resourceSpans)

/** Nanosecondes OTLP (string ou number) vers millisecondes, ou `undefined`. */
const nanosToMs = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n / 1e6 : undefined
}

const fail = (reason: string): ImportError => ({ ok: false, reason })

/** Aplati les spans de tous les resourceSpans/scopeSpans en une liste. */
function collectSpans(input: Record<string, unknown>): OtlpSpan[] | ImportError {
  const spans: OtlpSpan[] = []
  for (const resource of input.resourceSpans as unknown[]) {
    if (!isRecord(resource) || !Array.isArray(resource.scopeSpans)) {
      return fail('OTLP invalide : `scopeSpans` manquant')
    }
    for (const scope of resource.scopeSpans) {
      if (!isRecord(scope) || !Array.isArray(scope.spans)) {
        return fail('OTLP invalide : `spans` manquant')
      }
      for (const raw of scope.spans) {
        if (!isRecord(raw)) return fail('OTLP invalide : span non exploitable')
        if (typeof raw.name !== 'string' || raw.name.length === 0) {
          return fail('OTLP invalide : span sans `name`')
        }
        const startMs = nanosToMs(raw.startTimeUnixNano)
        if (startMs === undefined) return fail('OTLP invalide : `startTimeUnixNano` requis')
        const status = isRecord(raw.status) ? raw.status : undefined
        const error =
          status?.code === OTLP_STATUS_ERROR
            ? typeof status.message === 'string' && status.message.length > 0
              ? status.message
              : 'span en erreur'
            : undefined
        spans.push({ name: raw.name, startMs, endMs: nanosToMs(raw.endTimeUnixNano), error })
      }
    }
  }
  return spans
}

export const otlpAdapter: TraceAdapter = {
  source: 'OTLP',
  tryAdapt(input: unknown): ImportResult | undefined {
    if (!looksLikeOtlp(input)) return undefined

    const spans = collectSpans(input)
    if ('ok' in spans) return spans
    if (spans.length === 0) return fail('trace OTLP vide : aucun span')

    const created = new Set<string>()
    const proto: RawStep[] = []
    for (const span of spans) {
      const id = span.name as ComponentId
      if (!created.has(span.name)) {
        created.add(span.name)
        proto.push({
          at: span.startMs,
          event: {
            type: 'component-created',
            id,
            name: span.name,
            display: { role: `Span OTLP « ${span.name} »` },
            needs: [],
            provides: [],
          } satisfies WithoutSequence,
        })
      }
      proto.push({ at: span.startMs, event: { type: 'component-activated', id } })
      if (span.error !== undefined) {
        proto.push({
          at: span.endMs ?? span.startMs,
          event: {
            type: 'component-failed',
            error: { code: 'activation-failed', message: span.error, component: id, name: span.name },
          },
        })
      } else if (span.endMs !== undefined) {
        proto.push({ at: span.endMs, event: { type: 'work-finished', id } })
      }
    }

    return archiveOf('Trace OTLP importée', normalizeStream(proto), 'foreign')
  },
}
