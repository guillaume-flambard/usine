// Forking a run: the trunk and the branch, two futures side by side.
//
// This is the product's one real feat, so its failure modes matter as much as
// its success: a fork that cannot render both applications says so rather than
// showing an empty panel, a branch replacement that does not compile says the
// previous version is still serving, and rejecting a branch tears down that
// branch alone. The trunk never moves.
import { markRaw, ref, type Ref } from 'vue'
import type { Fork, Pilot } from '../../orchestration/pilot'
import type { RunArchive } from '../../app/replay'

export interface ForkControl {
  /** Absent hors fork — la scène normale ne bouge alors pas d'un pixel. */
  fork: Ref<Fork | undefined>
  /**
   * L'archive forkée et le point N, figés au moment du fork : le bandeau mesure
   * le préfixe du tronc contre le flux de la branche.
   */
  forkArchive: Ref<RunArchive | undefined>
  forkAt: Ref<number>
  /**
   * Le verdict du dernier remplacement de branche : rien si la version a pris,
   * un mot si le code n'a pas compilé (la précédente sert toujours).
   */
  branchNotice: Ref<string | undefined>
  startFork: (at: number) => Promise<void>
  replaceOnBranch: (edit: { name: string; code: string }) => Promise<void>
  rejectBranch: () => Promise<void>
  exitFork: () => void
}

export function useFork(
  pilot: Pilot,
  reportError: (message: string | undefined) => void,
): ForkControl {
  const fork = ref<Fork | undefined>()
  const forkArchive = ref<RunArchive | undefined>()
  const forkAt = ref(0)
  const branchNotice = ref<string | undefined>()

  function forget() {
    fork.value = undefined
    forkArchive.value = undefined
    branchNotice.value = undefined
  }

  async function startFork(at: number) {
    const archive = pilot.archive()
    if (archive === undefined || fork.value !== undefined) return
    try {
      forkArchive.value = archive
      forkAt.value = at
      branchNotice.value = undefined
      // `markRaw` : le Fork porte des objets vivants (kernels, stores qui gèrent
      // leur propre réactivité par des refs internes). Le rendre réactif ferait
      // « déballer » ces refs imbriquées — `branch.store.state` cesserait d'être
      // un ref et `.value` deviendrait undefined. On le garde brut.
      fork.value = markRaw(await pilot.fork(archive, forkAt.value))
    } catch (cause) {
      // Le fork n'a pas pu rendre les deux applications : on le dit plutôt que
      // de montrer un panneau vide (Block If de la story).
      reportError(`Le fork a échoué : ${cause instanceof Error ? cause.message : String(cause)}`)
      fork.value = undefined
      forkArchive.value = undefined
    }
  }

  // L'autorité qui applique le remplacement (AD-31) : la branche seule bouge, le
  // tronc jamais. Le verdict revient à ForkView par `branchNotice`.
  async function replaceOnBranch(edit: { name: string; code: string }) {
    const current = fork.value
    if (current === undefined) return
    const took = await current.branch.replace(edit.name, edit.code)
    branchNotice.value = took
      ? undefined
      : 'Ce code n’a pas compilé — la version précédente de la branche sert toujours.'
  }

  // Rejeter la branche : un teardown entier (kernel + store + session), distinct
  // du rollback d'un remplacement (AD-47). Le run et le tronc restent intacts.
  async function rejectBranch() {
    const current = fork.value
    forget()
    await current?.branch.kernel.releaseAll()
  }

  // Revenir au run : on referme la vue fork, la scène normale revient.
  return { fork, forkArchive, forkAt, branchNotice, startFork, replaceOnBranch, rejectBranch, exitFork: forget }
}
