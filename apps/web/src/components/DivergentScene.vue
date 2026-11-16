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
import GatePanel, { type GateDecisionInput } from './GatePanel.vue'
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
  deciding: boolean
}

const panels = ref<Record<Side, Panel>>({
  left: { run: null, failure: '', deciding: false },
  right: { run: null, failure: '', deciding: false },
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
    await load(side)
  } catch (error) {
    panel.failure = (error as Error).message
  } finally {
    panel.deciding = false
  }
}

const SIDES: { side: Side; title: string }[] = [
  { side: 'left', title: 'Run original' },
  { side: 'right', title: 'Nouvelle version' },
]
</script>

<template>
  <section class="divergent" data-divergent-scene>
    <header class="bar">
      <h1 class="title">Original et nouvelle version</h1>
      <button type="button" class="btn btn-line back" data-divergent-back @click="emit('back')">
        <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />Retour au run
      </button>
    </header>

    <ComparisonBanner :left="models.left" :right="models.right" />

    <div class="branches">
      <article
        v-for="{ side, title } in SIDES"
        :key="side"
        class="branch"
        :aria-label="title"
        :data-branch="side"
      >
        <header class="branch-head">
          <h2>{{ title }}</h2>
          <p v-if="specialistOf(side)" class="who">{{ specialistOf(side) }}</p>
        </header>

        <div class="branch-body">
          <p v-if="panels[side].failure" class="alert" role="alert">
            {{ panels[side].failure }}
          </p>
          <div class="scene-wrap">
            <RunScene v-if="panels[side].run" :model="models[side]" />
          </div>
          <p
            v-if="models[side].status === 'failed' && models[side].error"
            class="alert"
            role="alert"
            data-branch-error
          >
            {{ models[side].error }}
          </p>
          <div v-if="answerOf(side)" class="answer" data-branch-answer>
            <Suspense>
              <AnswerMarkdown :value="answerOf(side)" />
            </Suspense>
          </div>
          <GatePanel
            v-if="panels[side].run && models[side].gate"
            :gate="models[side].gate!"
            :busy="panels[side].deciding"
            @decide="(decision) => decide(side, decision)"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.divergent {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-paper);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-height: 64px;
  padding: var(--space-xs) var(--space-20);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-surface);
}
.title {
  font: 600 var(--text-lg) / 1.2 var(--font-sans);
  letter-spacing: -0.01em;
}
.back {
  min-height: 44px;
  padding: 0 var(--space-md);
  font-size: var(--text-sm);
}
.branches {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-md);
  padding: 0 var(--space-20) var(--space-lg);
}
@media (min-width: 64rem) {
  .branches {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.branch {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}
.branch-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2xs) var(--space-sm);
  padding: var(--space-md) var(--space-20) var(--space-sm);
  border-bottom: 1px solid var(--color-rule);
}
.branch-head h2 {
  font: 600 var(--text-md) / 1.2 var(--font-sans);
}
.who {
  color: var(--color-muted);
  font: 400 12px / 1.4 var(--font-mono);
  overflow-wrap: anywhere;
}
.branch-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-width: 0;
  padding: var(--space-md) var(--space-20) var(--space-20);
}
/* The scene sits on the atelier's dotted paper, as in the atelier: white cards
   on the white branch panel lost their edge (audit, 16 November 2026). */
.scene-wrap {
  min-width: 0;
  overflow-x: auto;
  padding: var(--space-md);
  border-radius: var(--radius-in);
  background-color: var(--color-paper-2);
  background-image: radial-gradient(var(--color-rule-2) 1px, transparent 1.2px);
  background-size: 20px 20px;
}
.answer {
  max-height: 24rem;
  overflow-y: auto;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-rule);
  font-size: var(--text-sm);
}
.alert {
  color: var(--color-error);
  font-size: var(--text-sm);
}
@media (max-width: 40rem) {
  .bar,
  .branches {
    padding-inline: var(--space-sm);
  }
  .branch-body,
  .branch-head {
    padding-inline: var(--space-sm);
  }
}
</style>
