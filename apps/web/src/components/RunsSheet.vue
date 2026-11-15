<script setup lang="ts">
/**
 * Earlier runs (MEM-18), in a bottom sheet over the page: an overlay, not a
 * fifth zone (CLAUDE.md, "Quatre zones, et pas une de plus").
 *
 * Chaque entrée de la ligne du temps expose un bouton "forker ici" (MEM-25) :
 * il ouvre le panneau de fork pour ce run, et la branche créée apparaît
 * côte à côte avec l'originale (mode divergent).
 */
import { ref } from 'vue'
import { fetchRun, fetchRuns, runDate, type RunDetail, type RunSummary } from '../chat/runs'
import ForkPanel from './ForkPanel.vue'

const emit = defineEmits<{
  open: [run: RunDetail]
  fresh: []
  forked: [originalThreadId: string, branchThreadId: string]
}>()

const open = ref(false)
const runs = ref<RunSummary[]>([])
const next = ref<string | null>(null)
const loading = ref(false)
const failure = ref('')

const STATUS: Record<RunSummary['status'], string> = {
  running: 'interrompu ou en cours',
  waiting: 'en attente de décision',
  deciding: 'décision en cours',
  done: 'terminé',
  error: 'en erreur',
}

// Le run dont on ouvre le panneau de fork (une seule fois à la fois).
const forkingThreadId = ref<string | null>(null)
const forkOpen = ref(false)

async function load(more = false) {
  loading.value = true
  failure.value = ''
  try {
    const page = await fetchRuns(more ? next.value : null)
    runs.value = more ? [...runs.value, ...page.items] : page.items
    next.value = page.next_cursor
  } catch (error) {
    failure.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

async function choose(threadId: string) {
  try {
    emit('open', await fetchRun(threadId))
    open.value = false
  } catch (error) {
    failure.value = (error as Error).message
  }
}

function fresh() {
  emit('fresh')
  open.value = false
}

function onDrawerOpenChange(value: boolean) {
  if (value) load()
  else {
    forkingThreadId.value = null
    forkOpen.value = false
  }
}

/** Ouvre le panneau de fork sur ce run (ligne du temps des checkpoints). */
function openFork(threadId: string) {
  forkingThreadId.value = threadId
  forkOpen.value = true
}

async function onForked(branch: string) {
  const original = forkingThreadId.value
  if (!original) return
  emit('forked', original, branch)
  forkOpen.value = false
  forkingThreadId.value = null
}
</script>

<template>
  <UDrawer
    v-model:open="open"
    direction="bottom"
    title="Runs précédents"
    description="Rouvrir un run rejoue sa scène ; un nouveau message le poursuit."
    @update:open="onDrawerOpenChange"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="xl"
      label="Runs"
      icon="i-lucide-history"
      :ui="{ base: 'min-h-11' }"
      data-runs-trigger
    />
    <template #body>
      <div class="flex flex-col gap-2" data-runs>
        <UButton
          color="primary"
          variant="soft"
          size="xl"
          label="Nouvelle conversation"
          icon="i-lucide-plus"
          :ui="{ base: 'min-h-11 justify-center' }"
          data-runs-fresh
          @click="fresh"
        />
        <p v-if="failure" class="text-sm text-error" role="alert">{{ failure }}</p>
        <p v-else-if="!loading && runs.length === 0" class="text-muted" data-runs-empty>
          Aucun run pour l'instant.
        </p>
        <ul class="flex flex-col gap-1">
          <li v-for="run in runs" :key="run.thread_id">
            <div class="flex items-center justify-between gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                block
                :ui="{ base: 'min-h-11 justify-between text-left' }"
                :data-run="run.thread_id"
                @click="choose(run.thread_id)"
              >
                <span class="truncate">{{ run.title }}</span>
                <span class="shrink-0 text-sm text-toned">
                  {{ runDate(run.created_at) }} · {{ STATUS[run.status] }}
                </span>
              </UButton>
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                label="Forker ici"
                :ui="{ base: 'min-h-8 px-2' }"
                data-fork-here
                @click="openFork(run.thread_id)"
              />
            </div>
          </li>
        </ul>
        <UButton
          v-if="next"
          color="neutral"
          variant="outline"
          size="xl"
          label="Plus anciens"
          :loading="loading"
          :ui="{ base: 'min-h-11 justify-center' }"
          data-runs-more
          @click="load(true)"
        />
      </div>
    </template>
  </UDrawer>

  <ForkPanel
    v-if="forkingThreadId"
    v-model:open="forkOpen"
    :thread-id="forkingThreadId"
    @forked="onForked"
  />
</template>
