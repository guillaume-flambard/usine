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

/** Un comportement vivant à un point du flux : son nom, sa version, son code. */
export interface LiveBehaviourSource {
  /** Le nom du comportement, hors du préfixe `behaviour:`. */
  name: string
  /** Comptée, jamais lue : v1 à la naissance, +1 par remplacement qui a pris. */
  version: number
  /**
   * Le code porté par le dernier `build.source` du composant vivant — celui
   * qu'il faut recompiler. `undefined` quand le flux ne l'a jamais porté ; à
   * l'appelant de décider si c'est fatal (le fork rejette, cf. AD-49).
   */
  source?: string
}

/**
 * Les comportements vivants à un point N du flux, avec leur version comptée et
 * leur dernière source.
 *
 * C'est le patron partagé du rejeu et du fork (AD-45) : on re-réduit le préfixe
 * `sequence <= stopAt` — tout le flux quand `stopAt` est absent — et on en tire
 * l'ensemble vivant. Un comportement est vivant s'il a été créé avec un
 * `provides` `behaviour:*` et **pas relâché** à N (release, remplacement, ou
 * chute). Sa version n'est pas lue dans un champ : elle est **comptée**, un cran
 * par `component-replaced` qui a pris. Sa source est le dernier `build.source`
 * du composant qui la porte.
 */
export function liveBehaviourSources(
  events: readonly RunEvent[],
  stopAt?: number,
): readonly LiveBehaviourSource[] {
  // Borné par `sequence`, jamais par indice (AD-36) : le préfixe est le sous-
  // ensemble `sequence <= stopAt`. On le trie par `sequence` avant de réduire :
  // le comptage suppose l'ordre du flux, et on ne fait pas confiance à
  // l'appelant pour l'avoir gardé (une archive relue l'est, un tableau nu non).
  const bounded = stopAt === undefined ? events : events.filter((event) => event.sequence <= stopAt)
  const prefix = [...bounded].sort((a, b) => a.sequence - b.sequence)
  const traces = new Map<string, Trace>()
  const versions = new Map<string, number>()

  for (const event of prefix) {
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

  const live: LiveBehaviourSource[] = []
  for (const trace of traces.values()) {
    if (trace.released || trace.key === undefined) continue
    live.push({
      name: trace.key,
      version: versions.get(trace.key) ?? 1,
      ...(trace.source !== undefined ? { source: trace.source } : {}),
    })
  }
  return live
}

/**
 * Les comportements encore vivants à la fin du run, recompilés.
 *
 * Le parcours du flux — vivants, versions comptées, dernière source — vit dans
 * `liveBehaviourSources` ; ici on ne fait que le consommer et recompiler ce qui
 * porte une source.
 */
export async function behavioursFromArchive(
  archive: RunArchive,
  spawn?: SpawnWorker,
): Promise<readonly Behaviour[]> {
  const live: Behaviour[] = []
  for (const spec of liveBehaviourSources(archive.events)) {
    if (spec.source === undefined) continue
    const made = await createIsolate(spec.source, spawn)
    if (!('isolate' in made)) continue
    const isolate = made.isolate
    live.push({
      name: spec.name,
      version: spec.version,
      call: (input) => isolate.run(input),
    })
  }
  return live
}

export interface ReplayOptions {
  /** Le pas entre deux événements. Zéro rejoue d'un bloc. */
  paceMs?: number
  /** Arrête le rejeu quand il est déclenché : le puits ne reçoit plus rien. */
  signal?: AbortSignal
  /**
   * Le point de fork : ne rejouer que les événements de `sequence <= stopAt`,
   * puis rendre la main. Absent, le flux est rejoué en entier. Le point est un
   * `sequence` entier (le kernel les numérote à partir de 1), jamais un indice —
   * c'est lui qui est adressable et stable (AD-36) ; un flux relu est trié par
   * `sequence` (AD-33), donc borner par `sequence` est déterministe.
   */
  stopAt?: number
}

/** Ce qu'un rejeu rapporte : jusqu'où il est allé, et s'il a atteint la fin. */
export interface ReplayOutcome {
  /**
   * Vrai si tout le flux a été émis (ni `stopAt` ni `signal` ne l'ont écourté).
   * Un `stopAt` au-delà du dernier `sequence` rejoue tout et rend `true` ; on
   * détecte alors « point de fork jamais atteint » par `lastSequence < stopAt`.
   */
  reachedEnd: boolean
  /**
   * Le `sequence` du dernier événement émis ; `0` si rien n'a été émis. Sans
   * ambiguïté avec un vrai événement, puisque le kernel numérote à partir de 1.
   */
  lastSequence: number
}

/**
 * Rejoue le flux dans un puits, à la cadence demandée, éventuellement borné à
 * un point de fork.
 *
 * La cadence est cosmétique et le reste : rejouer d'un bloc donne exactement
 * le même modèle de lecture. Elle existe pour qu'un rejeu se regarde comme un
 * run, pas pour qu'il en diffère.
 */
export async function replayInto(
  archive: RunArchive,
  emit: (event: RunEvent) => void,
  options: ReplayOptions = {},
): Promise<ReplayOutcome> {
  const pace = options.paceMs ?? 0
  const { stopAt } = options
  let lastSequence = 0
  for (const event of archive.events) {
    if (options.signal?.aborted === true) return { reachedEnd: false, lastSequence }
    // Borné par `sequence`, pas par indice : dès qu'un événement dépasse le
    // point de fork, on s'arrête sans l'émettre. Le préfixe n'est pas muté.
    if (stopAt !== undefined && event.sequence > stopAt) {
      return { reachedEnd: false, lastSequence }
    }
    emit(event)
    lastSequence = event.sequence
    if (pace > 0) await new Promise((next) => setTimeout(next, pace))
  }
  return { reachedEnd: true, lastSequence }
}
