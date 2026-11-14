<script setup lang="ts">
/**
 * Earlier runs (MEM-18), in a bottom sheet over the page: an overlay, not a
 * fifth zone (CLAUDE.md, "Quatre zones, et pas une de plus").
 */
import { ref } from 'vue'
import { fetchRun, fetchRuns, runDate, type RunDetail, type RunSummary } from '../chat/runs'

const emit = defineEmits<{ open: [run: RunDetail]; fresh: [] }>()

const open = ref(false)
const runs = ref<RunSummary[]>([])
const next = ref<string | null>(null)
const loading = ref(false)
const failure = ref('')

const STATUS: Record<RunSummary['status'], string> = {
  running: 'interrompu ou en cours',
  done: 'terminé',
  error: 'en erreur',
}

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
</script>

<template>
  <UDrawer
    v-model:open="open"
    direction="bottom"
    title="Runs précédents"
    description="Rouvrir un run rejoue sa scène ; un nouveau message le poursuit."
    @update:open="(value: boolean) => value && load()"
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
</template>
