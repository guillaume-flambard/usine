// Importing a foreign agent trace: read it, translate it, replay it.
//
// Nobody is contacted — the file is read in the browser — and a trace we do not
// recognise is refused by name rather than shown as a half-invented run.
//
// A foreign trace carries no `build.source`: nothing is recompilable, so
// nothing is forkable or hot-swappable (AD-49). The fork gate is hidden ahead
// of time rather than promising something the run cannot deliver (AD-41).
import { computed, type ComputedRef } from 'vue'
import type { Pilot } from '../../orchestration/pilot'
import { importTrace, isImportError } from '../../app/import'
import { measureRun } from '../../app/measure'

export interface TraceImportControl {
  /**
   * La mesure d'une trace importée, lue sur son seul flux (AD-40) : les mêmes
   * chiffres que le bandeau de fork, ici pour dire ce que la trace étrangère a
   * fait. Absent hors import.
   */
  foreignMeasure: ComputedRef<ReturnType<typeof measureRun> | undefined>
  /** Forkable seulement pour un run interne. */
  forkable: ComputedRef<boolean>
  importFromFileEvent: (event: Event) => Promise<{ brief: string } | undefined>
}

export function useTraceImport(
  pilot: Pilot,
  /** Se relit à chaque événement du run, pour recalculer au fil du rejeu. */
  lastSequence: () => number,
  reportError: (message: string | undefined) => void,
): TraceImportControl {
  const foreignMeasure = computed(() => {
    void lastSequence()
    const archive = pilot.archive()
    return archive?.origin === 'foreign' ? measureRun(archive) : undefined
  })

  const forkable = computed(() => {
    const archive = pilot.archive()
    return archive !== undefined && archive.origin !== 'foreign'
  })

  async function importFromFileEvent(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = '' // Réarmer : réimporter le même fichier doit relancer l'événement.
    if (file === undefined) return undefined

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      reportError("Ce fichier n'est pas un JSON lisible.")
      return undefined
    }

    const result = importTrace(parsed)
    if (isImportError(result)) {
      reportError(`Trace non importée : ${result.reason}.`)
      return undefined
    }

    reportError(undefined)
    await pilot.replay(result)
    return { brief: result.brief }
  }

  return { foreignMeasure, forkable, importFromFileEvent }
}
