/**
 * The fork dialog's state, away from its markup (MEM-23, MEM-33): what the
 * checkpoints are, which specialist the branch would run, and the fork itself.
 *
 * Kept out of the component so it can be tested without a modal: the browser
 * suite is for what only a browser can prove.
 */
import { computed, ref, watch, type Ref } from 'vue'
import {
  fetchCheckpoints,
  fetchSpecialists,
  forkRun,
  isForkable,
  type Checkpoint,
  type Specialist,
} from './forks'

export function useFork(threadId: Ref<string>, open: Ref<boolean>) {
  const checkpoints = ref<Checkpoint[]>([])
  const specialists = ref<Specialist[]>([])
  const chosen = ref('')
  const specialist = ref('')
  const busy = ref(false)
  const failure = ref('')

  async function load() {
    failure.value = ''
    try {
      const [points, available] = await Promise.all([
        fetchCheckpoints(threadId.value),
        fetchSpecialists(),
      ])
      checkpoints.value = points
      specialists.value = available
      // The entry point is the useful default: the fork that replans.
      chosen.value = points.find(isForkable)?.checkpoint_id ?? ''
    } catch (error) {
      failure.value = (error as Error).message
    }
  }

  // `immediate` because the dialog can mount already open: without it the panel
  // would stay empty and the button disabled, for lack of a change event.
  watch(
    open,
    (value) => {
      if (!value) return
      checkpoints.value = []
      specialist.value = ''
      void load()
    },
    { immediate: true },
  )

  const canFork = computed(() => Boolean(chosen.value) && !busy.value)

  /** The branch's thread id, or null when the service refused. */
  async function fork(): Promise<string | null> {
    if (!canFork.value) return null
    busy.value = true
    failure.value = ''
    try {
      return await forkRun(threadId.value, {
        checkpointId: chosen.value,
        specialist: specialist.value || undefined,
      })
    } catch (error) {
      failure.value = (error as Error).message
      return null
    } finally {
      busy.value = false
    }
  }

  return { checkpoints, specialists, chosen, specialist, busy, failure, canFork, load, fork }
}
