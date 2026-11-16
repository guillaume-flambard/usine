<script lang="ts">
import type { RunSummary as Summary } from '../chat/runs'

/** The last list read, shared by every mount of the list in this page. */
const lastRead: { runs: Summary[]; next: string | null } = { runs: [], next: null }
</script>

<script setup lang="ts">
/**
 * Earlier runs (MEM-18), in the atelier's sidebar (MEM-86): listed on mount,
 * filtered by title, reopened in one click. A new run starts from here too.
 * Forking is the dock's job, on the open run.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { fetchRun, fetchRuns, runDate, type RunDetail, type RunSummary } from '../chat/runs'

const props = withDefaults(defineProps<{ current?: string; refresh?: number }>(), {
  current: undefined,
  refresh: 0,
})
const emit = defineEmits<{
  open: [run: RunDetail]
  fresh: []
}>()

// Opening a run remounts the atelier (App.vue keys it by thread), and this list
// with it. Starting from the last list read, then refreshing behind it, keeps
// the sidebar still: it used to empty itself for one frame on every click
// (measured 16 November 2026: 8 runs, then 0, then 8 again).
const runs = ref<RunSummary[]>(lastRead.runs)
const next = ref<string | null>(lastRead.next)
const loading = ref(false)
const failure = ref('')
const query = ref('')

const STATUS: Record<RunSummary['status'], string> = {
  running: 'interrompu ou en cours',
  waiting: 'à la porte',
  deciding: 'décision en cours',
  done: 'terminé',
  error: 'en erreur',
}

const shown = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('fr')
  return q ? runs.value.filter((r) => r.title.toLocaleLowerCase('fr').includes(q)) : runs.value
})

async function load(more = false) {
  loading.value = true
  failure.value = ''
  try {
    const page = await fetchRuns(more ? next.value : null)
    runs.value = more ? [...runs.value, ...page.items] : page.items
    next.value = page.next_cursor
    lastRead.runs = runs.value
    lastRead.next = next.value
  } catch (error) {
    failure.value = (error as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
// A run that just finished or stopped at the gate changes the list.
watch(
  () => props.refresh,
  () => load(),
)

async function choose(threadId: string) {
  try {
    emit('open', await fetchRun(threadId))
  } catch (error) {
    failure.value = (error as Error).message
  }
}
</script>

<template>
  <div class="runs" data-runs>
    <label class="field">
      <UIcon name="i-lucide-search" class="size-4 shrink-0" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        placeholder="Chercher un run"
        aria-label="Chercher un run"
        name="q"
        autocomplete="off"
        data-runs-search
      />
    </label>
    <div class="head">
      <h3>Runs</h3>
      <button type="button" class="new" data-runs-fresh @click="emit('fresh')">
        <UIcon name="i-lucide-plus" class="size-4" aria-hidden="true" />Nouveau run
      </button>
    </div>
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <p v-else-if="!loading && runs.length === 0" class="quiet" data-runs-empty>
      Aucun run pour l’instant.
    </p>
    <p v-else-if="!loading && shown.length === 0" class="quiet">Aucun run ne porte ce titre.</p>
    <ul class="list">
      <li v-for="run in shown" :key="run.thread_id">
        <button
          type="button"
          class="run"
          :aria-current="run.thread_id === current ? 'true' : undefined"
          :data-run="run.thread_id"
          @click="choose(run.thread_id)"
        >
          <strong>{{ run.title }}</strong>
          <span class="row">
            <span>{{ runDate(run.created_at) }}</span>
            <span>{{ STATUS[run.status] }}</span>
          </span>
        </button>
      </li>
    </ul>
    <button
      v-if="next"
      type="button"
      class="more"
      :disabled="loading"
      data-runs-more
      @click="load(true)"
    >
      Plus anciens
    </button>
  </div>
</template>

<style scoped>
.runs {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.field {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 44px;
  margin-bottom: var(--space-sm);
  padding: 0 var(--space-sm);
  border-radius: var(--radius-in);
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-muted);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.field:hover {
  box-shadow: inset 0 0 0 1px var(--color-ink-2);
}
.field:focus-within {
  box-shadow:
    inset 0 0 0 1px var(--color-ink),
    0 0 0 3px var(--color-paper-3);
}
.field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: 16px;
  outline: 0;
}
.field input::placeholder {
  color: var(--color-muted);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  margin: 0 var(--space-xs);
}
h3 {
  margin: 0;
  color: var(--color-ink-2);
  font: 600 var(--text-sm) / 1.2 var(--font-sans);
}
.new,
.more {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  min-height: 44px;
  padding: 0 var(--space-xs);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-ink-2);
  font: 500 var(--text-xs) / 1 var(--font-sans);
  cursor: pointer;
}
.new:hover,
.more:hover {
  background: var(--color-paper-3);
  color: var(--color-ink);
}
.more {
  justify-content: center;
}
.more:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.list {
  display: grid;
  gap: var(--space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}
.run {
  display: block;
  width: 100%;
  padding: var(--space-sm);
  border: 0;
  border-radius: var(--radius-in);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: box-shadow var(--dur-short) var(--ease-out);
}
.run:hover {
  background: var(--color-paper-2);
}
.run[aria-current='true'] {
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-rule);
}
/* The API already caps a title at 80 characters: shown whole, never clamped,
   so no line hides under the date row. */
.run strong {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2xs) var(--space-xs);
  margin-top: var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.quiet {
  margin: 0 var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.failure {
  margin: 0 var(--space-xs);
  color: var(--color-error);
  font-size: var(--text-sm);
}
@media (prefers-reduced-motion: reduce) {
  .run {
    transition: none;
  }
}
</style>
