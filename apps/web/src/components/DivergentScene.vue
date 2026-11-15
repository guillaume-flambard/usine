<script setup lang="ts">
/**
 * Scène divergente (MEM-25) : deux branches côte à côte, chacune avec son
 * graphe et sa porte humaine, plus un bandeau de comparaison.
 *
 * Chaque panneau est autonome : il reçoit le détail d'un run, reconstruit son
 * read model depuis les événements archivés, et affiche sa propre scène +
 * sa propre porte. Valider une branche ne touche pas l'autre.
 */
import { computed, ref, type Ref, watch } from 'vue'
import { fetchRun, type RunDetail } from '../chat/runs'
import { replay, type RunReadModel } from '../run/readModel'
import RunScene from './RunScene.vue'
import GateDialog from './GateDialog.vue'
import ComparisonBanner from './ComparisonBanner.vue'

const props = defineProps<{
  leftThreadId: string
  rightThreadId: string
}>()

const emit = defineEmits<{ decided: [threadId: string, decision: 'approve' | 'reject' | 'edit'] }>()

const left = ref<RunDetail | null>(null)
const right = ref<RunDetail | null>(null)
const leftFailure = ref('')
const rightFailure = ref('')

const leftOpen = ref(false)
const rightOpen = ref(false)

async function load(threadId: string, setter: (run: RunDetail) => void, failure: Ref<string>) {
  failure.value = ''
  try {
    setter(await fetchRun(threadId))
  } catch (error) {
    failure.value = (error as Error).message
  }
}

watch(
  [() => props.leftThreadId, () => props.rightThreadId],
  async ([leftId, rightId]) => {
    left.value = null
    right.value = null
    await load(leftId, (run) => (left.value = run), leftFailure)
    await load(rightId, (run) => (right.value = run), rightFailure)
  },
  { immediate: true },
)

const leftModel = computed<RunReadModel>(() =>
  left.value ? replay(left.value.history.flatMap((turn) => turn.events)) : EMPTY_MODEL,
)
const rightModel = computed<RunReadModel>(() =>
  right.value ? replay(right.value.history.flatMap((turn) => turn.events)) : EMPTY_MODEL,
)

const EMPTY_MODEL: RunReadModel = { status: 'idle', nodes: [], edges: [], at: 0, events: 0 }

const hasLeft = computed(() => left.value !== null)
const hasRight = computed(() => right.value !== null)
const leftId = computed(() => left.value?.thread_id ?? '')
const rightId = computed(() => right.value?.thread_id ?? '')

/** Porte une décision de porte humaine sur le run donné. */
async function decide(threadId: string, decision: 'approve' | 'reject' | 'edit') {
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(threadId)}/gate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (!response.ok) throw new Error(`Le service a répondu ${response.status}.`)
    emit('decided', threadId, decision)
  } catch (error) {
    if (left.value?.thread_id === threadId) leftFailure.value = (error as Error).message
    if (right.value?.thread_id === threadId) rightFailure.value = (error as Error).message
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col" data-divergent-scene>
    <ComparisonBanner :left="leftModel" :right="rightModel" />

    <div class="flex min-h-0 flex-1 gap-4 px-4">
      <!-- Panneau gauche : branche originale -->
      <div class="flex min-h-0 flex-1 flex-col border border-default rounded-lg bg-elevated">
        <header
          class="flex items-center justify-between gap-2 px-3 py-2 border-b border-default bg-elevated/50"
        >
          <h2 class="text-sm font-semibold">Branche originale</h2>
          <p v-if="leftFailure" class="text-xs text-error">{{ leftFailure }}</p>
        </header>
        <div class="flex min-h-0 flex-1 overflow-auto">
          <RunScene v-if="hasLeft" :model="leftModel" @decide="leftOpen = true" />
          <GateDialog
            v-if="hasLeft && leftModel.gate"
            v-model:open="leftOpen"
            :gate="leftModel.gate"
            @decide="(d) => decide(leftId, d.decision as 'approve' | 'reject' | 'edit')"
          />
        </div>
      </div>

      <!-- Panneau droit : branche forcée -->
      <div class="flex min-h-0 flex-1 flex-col border border-default rounded-lg bg-elevated">
        <header
          class="flex items-center justify-between gap-2 px-3 py-2 border-b border-default bg-elevated/50"
        >
          <h2 class="text-sm font-semibold">Branche forcée</h2>
          <p v-if="rightFailure" class="text-xs text-error">{{ rightFailure }}</p>
        </header>
        <div class="flex min-h-0 flex-1 overflow-auto">
          <RunScene v-if="hasRight" :model="rightModel" @decide="rightOpen = true" />
          <GateDialog
            v-if="hasRight && rightModel.gate"
            v-model:open="rightOpen"
            :gate="rightModel.gate"
            @decide="(d) => decide(rightId, d.decision as 'approve' | 'reject' | 'edit')"
          />
        </div>
      </div>
    </div>
  </section>
</template>
