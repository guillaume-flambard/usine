// The visitor's own runs: list, open, share, trash, restore, purge.
//
// Without this view a signed-in visitor would see none of their runs at all —
// tenancy makes them private. The panel closes on its own when the session
// ends, rather than the sign-out path having to reach in here and close it.
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  exportUrl,
  listRuns,
  purgeRun,
  restoreRun,
  revokeRunById,
  shareRunById,
  trashRun,
  type RunSummary,
} from '../../app/runs-client'
import type { SessionStatus } from '../../app/auth-client'

export interface MyRunsControl {
  runsOpen: Ref<boolean>
  runsTab: Ref<'live' | 'trash'>
  myRuns: Ref<RunSummary[]>
  myTrash: Ref<RunSummary[]>
  runsTabs: ComputedRef<{ label: string; value: string; slot: string }[]>
  runExportUrl: (id: string) => string
  toggleRuns: () => Promise<void>
  openRun: (id: string) => void
  trash: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  purge: (id: string) => Promise<void>
  toggleShare: (run: RunSummary) => Promise<void>
}

export function useMyRuns(session: Ref<SessionStatus>): MyRunsControl {
  const runsOpen = ref(false)
  const runsTab = ref<'live' | 'trash'>('live')
  const myRuns = ref<RunSummary[]>([])
  const myTrash = ref<RunSummary[]>([])

  // Les deux onglets. Le compte est dans le libellé : c'est la seule
  // information que l'onglet porte, et elle change avec la liste.
  const runsTabs = computed(() => [
    { label: `actifs (${myRuns.value.length})`, value: 'live', slot: 'live' },
    { label: `corbeille (${myTrash.value.length})`, value: 'trash', slot: 'trash' },
  ])

  async function refreshRuns() {
    ;[myRuns.value, myTrash.value] = await Promise.all([listRuns(false), listRuns(true)])
  }

  async function toggleRuns() {
    runsOpen.value = !runsOpen.value
    if (runsOpen.value) await refreshRuns()
  }

  function openRun(id: string) {
    // Rejouer ce run, par le chemin de rejeu existant (?run=<id>).
    window.location.search = `?run=${encodeURIComponent(id)}`
  }

  const afterChange = async (done: boolean) => {
    if (done) await refreshRuns()
  }

  // Signing out — or erasing the account — leaves nothing to list. The panel
  // notices by itself: the sign-out path has no business knowing this view
  // exists.
  watch(
    () => session.value.authenticated,
    (authenticated) => {
      if (authenticated) return
      runsOpen.value = false
      myRuns.value = []
      myTrash.value = []
    },
  )

  return {
    runsOpen,
    runsTab,
    myRuns,
    myTrash,
    runsTabs,
    runExportUrl: exportUrl,
    toggleRuns,
    openRun,
    trash: async (id) => afterChange(await trashRun(id)),
    restore: async (id) => afterChange(await restoreRun(id)),
    purge: async (id) => afterChange(await purgeRun(id)),
    toggleShare: async (run) =>
      afterChange(run.shared ? await revokeRunById(run.id) : await shareRunById(run.id)),
  }
}
