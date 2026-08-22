// Rejouer un run depuis son seul flux d'événements.
//
// C'est ce que AD-33 promettait, tenu : le flux est le format d'archive, donc
// il doit suffire. Un run rejoué n'a ni noyau, ni agents, ni modèle — et
// pourtant son application doit servir, sinon le partage ne vaut rien.
//
// Ce qui rend ça possible est que le code de chaque comportement voyage dans
// l'événement qui l'a annoncé. On le recompile ici, dans le même fil isolé que
// dans un run vivant : un lien partagé n'est pas un chemin d'exécution
// privilégié, et c'est exactement ce que NFR-024 exige avant d'ouvrir le
// partage.

import type { RunEvent } from '../runtime/events'
import { behaviourName, type Behaviour } from './behaviour'
import { createIsolate, type SpawnWorker } from './isolate'

/** La version du format. Un run d'une autre version est refusé, pas deviné. */
export const ARCHIVE_VERSION = 1

export interface RunArchive {
  version: number
  /** Le brief dont le run est sorti. Il n'est nulle part ailleurs. */
  brief: string
  events: readonly RunEvent[]
}

/** Emballe un run pour le stockage. Rien n'est calculé : tout est déjà là. */
export const archiveOf = (brief: string, events: readonly RunEvent[]): RunArchive => ({
  version: ARCHIVE_VERSION,
  brief,
  events,
})

/**
 * Relit une archive venue du réseau.
 *
 * Un run stocké est une donnée hostile comme une autre : il peut avoir été
 * fabriqué à la main. On reconstruit ce qu'on comprend et on refuse le reste.
 */
export function readArchive(value: unknown): RunArchive | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.version !== ARCHIVE_VERSION) return undefined
  if (!Array.isArray(candidate.events)) return undefined

  const events = candidate.events.filter(
    (event): event is RunEvent =>
      typeof event === 'object' &&
      event !== null &&
      typeof (event as { type?: unknown }).type === 'string' &&
      typeof (event as { sequence?: unknown }).sequence === 'number',
  )
  if (events.length === 0) return undefined

  return {
    version: ARCHIVE_VERSION,
    brief: typeof candidate.brief === 'string' ? candidate.brief : '',
    // Remis en ordre : le réducteur suppose une séquence croissante, et un
    // fichier réordonné à la main ne doit pas produire un graphe incohérent.
    events: [...events].sort((a, b) => a.sequence - b.sequence),
  }
}

interface Trace {
  /** Le nom de coeffet du comportement, s'il en porte un. */
  key?: string
  source?: string
  released: boolean
}

/**
 * Les comportements encore vivants à la fin du run, recompilés.
 *
 * La version n'est pas lue dans l'événement : elle est **comptée**. Un
 * comportement naît en v1 et prend un cran à chaque remplacement qui a pris —
 * ce qui est exactement ce que le flux raconte, sans champ à faire confiance.
 */
export async function behavioursFromArchive(
  archive: RunArchive,
  spawn?: SpawnWorker,
): Promise<readonly Behaviour[]> {
  const traces = new Map<string, Trace>()
  const versions = new Map<string, number>()

  for (const event of archive.events) {
    switch (event.type) {
      case 'component-created': {
        const key = event.provides.map(behaviourName).find((name) => name !== undefined)
        traces.set(event.id, {
          released: false,
          ...(key !== undefined ? { key } : {}),
        })
        if (key !== undefined && !versions.has(key)) versions.set(key, 1)
        break
      }
      case 'component-built': {
        const trace = traces.get(event.id)
        if (trace !== undefined) trace.source = event.build.source
        break
      }
      case 'component-replaced': {
        const previous = traces.get(event.previous)
        if (previous !== undefined) previous.released = true
        const key = traces.get(event.id)?.key
        if (key !== undefined) versions.set(key, (versions.get(key) ?? 1) + 1)
        break
      }
      case 'component-released': {
        const trace = traces.get(event.id)
        if (trace !== undefined) trace.released = true
        break
      }
      case 'component-failed': {
        // A failure names the component by its error, not by an id: a
        // behaviour that fell is one whose component was released anyway, so
        // the released case above already covers it.
        const failed = event.error.component
        const trace = failed === undefined ? undefined : traces.get(failed)
        if (trace !== undefined) trace.released = true
        break
      }
      default:
        break
    }
  }

  const live: Behaviour[] = []
  for (const trace of traces.values()) {
    if (trace.released || trace.key === undefined || trace.source === undefined) continue
    const made = await createIsolate(trace.source, spawn)
    if (!('isolate' in made)) continue
    const name = trace.key
    const isolate = made.isolate
    live.push({
      name,
      version: versions.get(name) ?? 1,
      call: (input) => isolate.run(input),
    })
  }
  return live
}

export interface ReplayOptions {
  /** Le pas entre deux événements. Zéro rejoue d'un bloc. */
  paceMs?: number
  /** Appelé avant chaque pause, pour laisser l'interface respirer. */
  signal?: AbortSignal
}

/**
 * Rejoue le flux dans un puits, à la cadence demandée.
 *
 * La cadence est cosmétique et le reste : rejouer d'un bloc donne exactement
 * le même modèle de lecture. Elle existe pour qu'un rejeu se regarde comme un
 * run, pas pour qu'il en diffère.
 */
export async function replayInto(
  archive: RunArchive,
  emit: (event: RunEvent) => void,
  options: ReplayOptions = {},
): Promise<boolean> {
  const pace = options.paceMs ?? 0
  for (const event of archive.events) {
    if (options.signal?.aborted === true) return false
    emit(event)
    if (pace > 0) await new Promise((next) => setTimeout(next, pace))
  }
  return true
}
