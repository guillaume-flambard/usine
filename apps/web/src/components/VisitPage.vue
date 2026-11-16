<script setup lang="ts">
/**
 * The public visit (16 November 2026): a real run, recorded in production,
 * replayed in the browser for a visitor with no account.
 *
 * Visitors stopped at the sign-in page, and saw nothing of what the atelier
 * does. Here they watch the agents read the repository, then the request for
 * consent before the issue would leave. The stream is the archive format
 * (CLAUDE.md, rule 2): the recorded events rebuild the same scene, with no
 * model, no account and no call to the service. A decision taken here stays in
 * the page, and the page says so: nothing leaves.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RunEventPayload } from '../contracts/ui-stream'
import { EMPTY_RUN, reduceRun, type RunReadModel } from '../run/readModel'
import { runDate, type RunDetail } from '../chat/runs'
import { SIGN_IN_URL } from '../chat/session'
import RunScene from './RunScene.vue'
import InspectorPanel from './InspectorPanel.vue'
import AnswerMarkdown from './AnswerMarkdown'
import type { GateDecisionInput } from './GatePanel.vue'

const REPO = 'https://github.com/guillaume-flambard/usine'
/** The whole run plays in about this long, whatever it took for real. */
const PLAY_SECONDS = 18

const run = ref<RunDetail | null>(null)
const failure = ref('')
const shown = ref(0)
const decision = ref<GateDecisionInput | null>(null)
let timers: ReturnType<typeof setTimeout>[] = []

/** The recorded events, up to the gate: what happens next is the visitor's. */
const events = computed<RunEventPayload[]>(() => {
  const turn = run.value?.history[0]
  if (!turn) return []
  const gate = turn.events.findIndex((e) => e.kind === 'gate-opened')
  return gate === -1 ? turn.events : turn.events.slice(0, gate + 1)
})

const model = computed<RunReadModel>(() => {
  let state = events.value.slice(0, shown.value).reduce(reduceRun, EMPTY_RUN)
  const knot = state.nodes.find((n) => n.name === 'human_gate')
  if (decision.value && knot) {
    // The visitor's choice, played in the page only: the knot tightens or not,
    // and the run ends. Nothing is sent anywhere.
    const at = state.at + 0.1
    state = reduceRun(state, {
      kind: 'gate-decided',
      at,
      node: 'human_gate',
      data: { taskId: knot.id, decision: decision.value.decision, reason: decision.value.reason },
    } as RunEventPayload)
    state = reduceRun(state, {
      kind: 'run-finished',
      at,
      node: null,
      data: { outcome: 'ok' },
    } as RunEventPayload)
  }
  return state
})

const done = computed(() => shown.value >= events.value.length && events.value.length > 0)
const step = computed(() => {
  if (decision.value) return 3
  if (model.value.status === 'waiting') return 3
  if (shown.value > 0) return 2
  return 1
})

function play() {
  for (const t of timers) clearTimeout(t)
  timers = []
  shown.value = 0
  decision.value = null
  const list = events.value
  const total = list.at(-1)?.at ?? 0
  const scale = total > PLAY_SECONDS ? PLAY_SECONDS / total : 1
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  list.forEach((event, index) => {
    const delay = still ? 0 : Math.round(event.at * scale * 1000) + 600
    timers.push(setTimeout(() => (shown.value = Math.max(shown.value, index + 1)), delay))
  })
}

function decide(input: GateDecisionInput) {
  decision.value = input
}

onMounted(async () => {
  try {
    const response = await fetch('/visite/run.json')
    if (!response.ok) throw new Error(String(response.status))
    run.value = (await response.json()) as RunDetail
    play()
  } catch {
    failure.value = 'Le run enregistré n’a pas pu être chargé. Rechargez la page.'
  }
})
onBeforeUnmount(() => timers.forEach(clearTimeout))

const recorded = computed(() => (run.value ? runDate(run.value.created_at) : ''))
const answer = computed(() => (done.value ? (run.value?.history[0]?.answer ?? '') : ''))
const sandboxText = computed(() => {
  if (!decision.value) return ''
  return decision.value.decision === 'reject'
    ? 'Dans l’atelier, le run s’arrêterait ici, et le motif resterait dans sa trace.'
    : 'Dans l’atelier, l’issue serait créée sur GitHub à cet instant, avec exactement ces arguments.'
})

const STEPS = ['Une tâche', 'Les agents travaillent', 'Votre accord']
</script>

<template>
  <div class="visit" data-visit>
    <header class="bar">
      <a class="brand" href="/" aria-label="Usine, accueil">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path class="s-sky" d="M4.6 2.4C4.6 8.6 7.6 11.4 10.4 13.6" />
          <path class="s-mag" d="M12 2.4V13" />
          <path class="s-grn" d="M19.4 2.4C19.4 8.6 16.4 11.4 13.6 13.6" />
          <circle class="f-ink" cx="12" cy="16.4" r="4.6" />
          <path class="s-ink" d="M12 21v1.8" />
        </svg>
        Usine
      </a>
      <p class="recorded" data-visit-recorded>
        Visite : un vrai run, enregistré {{ recorded ? `le ${recorded}` : '' }}. Rien ne part d’ici.
      </p>
      <nav class="links" aria-label="Aller plus loin">
        <a :href="REPO">Le code</a>
        <a :href="SIGN_IN_URL">Se connecter</a>
      </nav>
    </header>

    <section class="intro" aria-labelledby="visit-title">
      <h1 id="visit-title">
        Une équipe d’agents fait la tâche avec de vrais outils, et rien ne part sans votre accord.
      </h1>
      <ol class="steps" data-visit-steps>
        <li
          v-for="(label, i) in STEPS"
          :key="label"
          :aria-current="step === i + 1 ? 'step' : undefined"
        >
          <span class="num">{{ i + 1 }}</span>{{ label }}
        </li>
      </ol>
      <p v-if="run" class="brief" data-visit-brief>
        <span class="label">La tâche</span>{{ run.history[0]?.brief }}
      </p>
    </section>

    <p v-if="failure" class="alert" role="alert">{{ failure }}</p>

    <main v-else class="grid">
      <div class="canvas" data-canvas>
        <RunScene v-if="model.events > 0" :model="model" />
        <div class="replay">
          <button type="button" class="btn btn-line" data-visit-replay @click="play">
            <UIcon name="i-lucide-rotate-ccw" class="size-4" aria-hidden="true" />Revoir depuis le
            début
          </button>
        </div>
      </div>
      <InspectorPanel v-if="model.events > 0" :model="model" @decide="decide">
        <div class="talk">
          <p v-if="!answer" class="quiet">
            Les agents lisent le dépôt GitHub du projet. Leur réponse s’affiche ici quand ils ont
            fini.
          </p>
          <AnswerMarkdown v-else :value="answer" />
        </div>
      </InspectorPanel>
    </main>

    <p v-if="sandboxText" class="sandbox" role="status" data-visit-sandbox>
      <b>Visite : rien n’est parti.</b> {{ sandboxText }}
      <a :href="SIGN_IN_URL">Se connecter</a> pour le faire en vrai, ou
      <button type="button" class="link" @click="play">revoir le run</button>.
    </p>
  </div>
</template>

<style scoped>
.visit {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-surface);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm) var(--space-md);
  min-height: 64px;
  padding: var(--space-sm) var(--space-20);
  border-bottom: 1px solid var(--color-rule);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 44px;
  color: var(--color-ink);
  font: 600 var(--text-md) / 1 var(--font-sans);
  text-decoration: none;
}
.brand path {
  fill: none;
  stroke-width: 2.3;
  stroke-linecap: round;
}
.s-sky {
  stroke: var(--color-sky);
}
.s-mag {
  stroke: var(--color-mag);
}
.s-grn {
  stroke: var(--color-grn);
}
.s-ink {
  stroke: var(--color-ink);
}
.f-ink {
  fill: var(--color-ink);
}
.recorded {
  flex: 1;
  min-width: 14rem;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.links {
  display: flex;
  gap: var(--space-md);
}
.links a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-ink);
  font-size: var(--text-sm);
}
.intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg) var(--space-20) var(--space-md);
  border-bottom: 1px solid var(--color-rule);
}
.intro h1 {
  max-width: 46rem;
  font: 600 var(--text-xl) / 1.25 var(--font-sans);
  text-wrap: balance;
}
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-lg);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.steps li {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}
.steps li[aria-current='step'] {
  color: var(--color-ink);
  font-weight: 600;
}
.num {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-paper-3);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.steps li[aria-current='step'] .num {
  background: var(--color-ink);
  color: var(--color-on-ink);
}
.brief {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  max-width: 60rem;
  font-size: var(--text-sm);
}
.label {
  color: var(--color-muted);
}
.grid {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 436px;
  min-height: 0;
}
.canvas {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-width: 0;
  overflow: auto;
  padding: var(--space-lg) var(--space-20);
  background-color: var(--color-paper-2);
  background-image: radial-gradient(var(--color-rule-2) 1px, transparent 1.2px);
  background-size: 20px 20px;
}
.replay {
  display: flex;
  justify-content: center;
}
.talk {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-size: var(--text-sm);
}
.quiet {
  color: var(--color-muted);
}
.sandbox {
  position: sticky;
  bottom: 0;
  padding: var(--space-md) var(--space-20);
  border-top: 1px solid var(--color-rule);
  background: var(--color-surface);
  font-size: var(--text-sm);
}
.sandbox a,
.link {
  color: var(--color-ink);
  text-decoration: underline;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
.alert {
  padding: var(--space-lg) var(--space-20);
  color: var(--color-error);
}
@media (max-width: 64rem) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
