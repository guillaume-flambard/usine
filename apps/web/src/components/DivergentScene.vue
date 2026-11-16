<script setup lang="ts">
/**
 * Scène divergente (MEM-25) : deux branches côte à côte, chacune avec son
 * graphe, sa réponse et sa porte humaine, plus un bandeau de comparaison.
 *
 * Chaque panneau est autonome : il reçoit le détail d'un run, reconstruit son
 * read model depuis les événements archivés, et affiche sa propre scène et sa
 * propre porte. Décider sur une branche ne touche pas l'autre.
 */
import { computed, ref, watch } from 'vue'
import { fetchRun, type RunDetail } from '../chat/runs'
import { replay, EMPTY_RUN, type RunReadModel } from '../run/readModel'
import RunScene from './RunScene.vue'
import GateDialog, { type GateDecisionInput } from './GateDialog.vue'
import ComparisonBanner from './ComparisonBanner.vue'
import AnswerMarkdown from './AnswerMarkdown'

const props = defineProps<{
  leftThreadId: string
  rightThreadId: string
}>()

const emit = defineEmits<{ back: [] }>()

type Side = 'left' | 'right'

interface Panel {
  run: RunDetail | null
  failure: string
  gateOpen: boolean
  deciding: boolean
}

const panels = ref<Record<Side, Panel>>({
  left: { run: null, failure: '', gateOpen: false, deciding: false },
  right: { run: null, failure: '', gateOpen: false, deciding: false },
})

const threadOf = (side: Side) => (side === 'left' ? props.leftThreadId : props.rightThreadId)

async function load(side: Side) {
  const panel = panels.value[side]
  panel.failure = ''
  try {
    panel.run = await fetchRun(threadOf(side))
  } catch (error) {
    panel.failure = (error as Error).message
  }
}

watch(
  [() => props.leftThreadId, () => props.rightThreadId],
  async () => {
    panels.value.left.run = null
    panels.value.right.run = null
    await Promise.all([load('left'), load('right')])
  },
  { immediate: true },
)

const models = computed<Record<Side, RunReadModel>>(() => ({
  left: modelOf(panels.value.left.run),
  right: modelOf(panels.value.right.run),
}))

function modelOf(run: RunDetail | null): RunReadModel {
  return run ? replay(run.history.flatMap((turn) => turn.events)) : EMPTY_RUN
}

/** The latest answer of a branch: what its specialists concluded. */
function answerOf(side: Side): string {
  const history = panels.value[side].run?.history ?? []
  return history.at(-1)?.answer ?? ''
}

/** Who answered on a branch: the specialist names its nodes reported. */
function specialistOf(side: Side): string {
  const names = new Set(
    models.value[side].nodes.flatMap((node) => node.specialists?.map((s) => s.name) ?? []),
  )
  return [...names].join(', ')
}

// A gate opens by itself when a branch waits for a decision.
for (const side of ['left', 'right'] as const) {
  watch(
    () => models.value[side].status === 'waiting',
    (waiting) => {
      if (waiting) panels.value[side].gateOpen = true
    },
    { immediate: true },
  )
}

/**
 * Sends the whole decision (a rejection carries its reason, an edit its
 * actions), waits for the resumed run to finish streaming, then reloads the
 * branch so its scene and answer show what happened.
 */
async function decide(side: Side, decision: GateDecisionInput) {
  const panel = panels.value[side]
  panel.deciding = true
  panel.failure = ''
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(threadOf(side))}/gate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(decision),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { detail?: string } | null
      throw new Error(detail?.detail ?? `Le service a répondu ${response.status}.`)
    }
    await response.text()
    panel.gateOpen = false
    await load(side)
  } catch (error) {
    panel.failure = (error as Error).message
  } finally {
    panel.deciding = false
  }
}

const SIDES: { side: Side; title: string }[] = [
  { side: 'left', title: 'Run original' },
  { side: 'right', title: 'Branche' },
]
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-y-auto" data-divergent-scene>
    <header class="flex items-center justify-between gap-2 px-4 py-3">
      <h1 class="text-lg font-semibold">L'usine agentique</h1>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-arrow-left"
        label="Retour à la conversation"
        :ui="{ base: 'min-h-11 sm:min-h-8' }"
        data-divergent-back
        @click="emit('back')"
      />
    </header>

    <ComparisonBanner :left="models.left" :right="models.right" />

    <div class="flex flex-col gap-4 px-4 pb-4 lg:flex-row">
      <article
        v-for="{ side, title } in SIDES"
        :key="side"
        class="flex min-w-0 flex-1 flex-col rounded-lg border border-default bg-elevated"
        :aria-label="title"
        :data-branch="side"
      >
        <header
          class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-default px-3 py-2"
        >
          <h2 class="text-sm font-semibold">{{ title }}</h2>
          <p v-if="specialistOf(side)" class="text-xs text-muted">{{ specialistOf(side) }}</p>
        </header>

        <div class="flex flex-col gap-3 p-3">
          <p v-if="panels[side].failure" class="text-sm text-error" role="alert">
            {{ panels[side].failure }}
          </p>
          <div class="overflow-x-auto">
            <RunScene
              v-if="panels[side].run"
              :model="models[side]"
              @decide="panels[side].gateOpen = true"
            />
          </div>
          <p
            v-if="models[side].status === 'failed' && models[side].error"
            class="text-sm text-error"
            role="alert"
            data-branch-error
          >
            {{ models[side].error }}
          </p>
          <div
            v-if="answerOf(side)"
            class="max-h-96 overflow-y-auto border-t border-default pt-3 text-sm"
            data-branch-answer
          >
            <Suspense>
              <AnswerMarkdown :value="answerOf(side)" />
            </Suspense>
          </div>
          <GateDialog
            v-if="panels[side].run && models[side].gate"
            v-model:open="panels[side].gateOpen"
            :gate="models[side].gate!"
            @decide="(decision) => decide(side, decision)"
          />
        </div>
      </article>
    </div>
  </section>
</template>
