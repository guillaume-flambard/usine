<script setup lang="ts">
/**
 * The public visit (16 November 2026): a real run, recorded in production,
 * told as a story for a visitor with no account and no technical background.
 *
 * The first version showed the machine (graph, nodes, JSON): the owner himself
 * said he understood nothing. This one tells what happens, step by step, in
 * plain words, each step with one line saying why it matters. The graph stays
 * one click away for technical readers.
 *
 * Everything shown comes from the recorded events (CLAUDE.md, rule 2): the
 * question, the work split, the tools each agent used, the tickets proposed.
 * No model, no account, no call to the service. A decision taken here stays in
 * the page, and the page says so.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RunEventPayload } from '../contracts/ui-stream'
import { EMPTY_RUN, reduceRun, type RunReadModel } from '../run/readModel'
import { runDate, type RunDetail } from '../chat/runs'
import { SIGN_IN_URL } from '../chat/session'
import RunScene from './RunScene.vue'
import AnswerMarkdown from './AnswerMarkdown'

const REPO = 'https://github.com/guillaume-flambard/usine'
/** The story plays in about this long, whatever the run took for real. */
const PLAY_SECONDS = 14

/** What a tool did, in words anyone reads. */
const TOOL_WORDS: Record<string, string> = {
  github__get_file_contents: 'a lu un fichier du projet sur GitHub',
  github__issue_read: 'a lu un ticket existant',
  github__list_issues: 'a parcouru les tickets ouverts',
  github__search_issues: 'a cherché dans les tickets',
  github__issue_write: 'a rédigé une proposition de ticket',
}

const run = ref<RunDetail | null>(null)
const failure = ref('')
const shown = ref(0)
const decision = ref<'open' | 'no' | null>(null)
const chosen = ref(0)
const technical = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

/** The recorded events, up to the request for consent: the rest is the visitor's. */
const events = computed<RunEventPayload[]>(() => {
  const turn = run.value?.history[0]
  if (!turn) return []
  const gate = turn.events.findIndex((e) => e.kind === 'gate-opened')
  return gate === -1 ? turn.events : turn.events.slice(0, gate + 1)
})
const model = computed<RunReadModel>(() =>
  events.value.slice(0, shown.value).reduce(reduceRun, EMPTY_RUN),
)

const plan = computed(() => model.value.nodes.find((n) => n.name === 'supervisor')?.subtasks ?? [])
const agents = computed(() =>
  model.value.nodes
    .filter((n) => n.name === 'specialist')
    .map((n, i) => {
      const tools = [...new Set((n.specialists ?? []).flatMap((s) => s.tools ?? []))]
      return {
        id: n.id,
        rank: i + 1,
        task: n.task ?? '',
        done: n.state === 'finished',
        failed: n.state === 'failed',
        seconds: n.finishedAt === undefined ? null : n.finishedAt - n.startedAt,
        did: tools.map((t) => TOOL_WORDS[t] ?? t),
      }
    }),
)

interface Ticket {
  title: string
  body: string
}
const tickets = computed<Ticket[]>(() =>
  (model.value.gate?.actions ?? []).flatMap((action) => {
    try {
      const args = JSON.parse(action.preview) as { title?: string; body?: string }
      return args.title ? [{ title: args.title, body: args.body ?? '' }] : []
    } catch {
      return []
    }
  }),
)
const asked = computed(() => model.value.status === 'waiting' && tickets.value.length > 0)
const step = computed(() => {
  if (asked.value || decision.value) return 4
  if (agents.value.length) return 3
  if (plan.value.length) return 2
  return 1
})

function play() {
  for (const t of timers) clearTimeout(t)
  timers = []
  shown.value = 0
  decision.value = null
  chosen.value = 0
  const list = events.value
  const total = list.at(-1)?.at ?? 0
  const scale = total > PLAY_SECONDS ? PLAY_SECONDS / total : 1
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  list.forEach((event, index) => {
    const delay = still ? 0 : Math.round(event.at * scale * 1000) + 1200
    timers.push(setTimeout(() => (shown.value = Math.max(shown.value, index + 1)), delay))
  })
}

async function decide(value: 'open' | 'no') {
  decision.value = value
  await nextTick()
  document.querySelector('[data-visit-outcome]')?.scrollIntoView({ block: 'nearest' })
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
const seconds = (value: number) =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} s`
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
      <nav class="links" aria-label="Aller plus loin">
        <a :href="REPO">Le code</a>
        <a :href="SIGN_IN_URL">Se connecter</a>
      </nav>
    </header>

    <main class="page">
      <section class="intro" aria-labelledby="visit-title">
        <p class="kicker">Visite guidée, une minute</p>
        <h1 id="visit-title">
          Un assistant qui enquête sur votre projet, et vous demande avant d’agir.
        </h1>
        <p class="lede">
          Voici un vrai cas, enregistré le {{ recorded || '16 novembre 2026' }}. Le site de ce
          projet ne se mettait plus à jour. On a posé la question à l’assistant. Regardez ce qu’il
          fait.
        </p>
      </section>

      <p v-if="failure" class="alert" role="alert">{{ failure }}</p>

      <ol v-else class="story" data-visit-story>
        <!-- 1. The question -->
        <li class="beat" :class="{ now: step === 1 }" data-beat="question">
          <p class="num" aria-hidden="true">1</p>
          <div>
            <h2>La question</h2>
            <p class="bubble you">
              Pourquoi mon site ne se met plus à jour ? Propose un ticket pour le suivre.
            </p>
            <p class="why">
              On lui parle comme à un collègue. La demande exacte est en bas de page.
            </p>
          </div>
        </li>

        <!-- 2. The work split -->
        <li v-if="plan.length" class="beat" :class="{ now: step === 2 }" data-beat="plan">
          <p class="num" aria-hidden="true">2</p>
          <div>
            <h2>
              Il répartit le travail entre {{ plan.length }} agent{{ plan.length > 1 ? 's' : '' }}
            </h2>
            <ul class="plain">
              <li v-for="(task, i) in plan" :key="i">
                <span class="tag">Agent {{ i + 1 }}</span
                >{{ task }}
              </li>
            </ul>
            <p class="why">Un agent chef découpe la tâche, les autres travaillent en même temps.</p>
          </div>
        </li>

        <!-- 3. The agents at work, with real tools -->
        <li v-if="agents.length" class="beat" :class="{ now: step === 3 }" data-beat="work">
          <p class="num" aria-hidden="true">3</p>
          <div>
            <h2>Les agents vont chercher les faits</h2>
            <ul class="plain">
              <li v-for="a in agents" :key="a.id" :data-agent-done="a.done || undefined">
                <span class="tag">Agent {{ a.rank }}</span>
                <template v-if="a.done">
                  {{ a.did.length ? a.did.join(', puis ') : 'a terminé' }}
                  <span class="time">en {{ seconds(a.seconds ?? 0) }}</span>
                </template>
                <template v-else-if="a.failed">n’a pas abouti</template>
                <template v-else><span class="working">travaille…</span></template>
              </li>
            </ul>
            <p class="why">
              Ils ne devinent pas : ils lisent le vrai projet, ici sur GitHub, en lecture seule.
            </p>
          </div>
        </li>

        <!-- 4. The finding and the request for consent -->
        <li v-if="asked || decision" class="beat" :class="{ now: step === 4 }" data-beat="consent">
          <p class="num ink" aria-hidden="true">4</p>
          <div>
            <h2>Il a trouvé, et il vous demande avant d’agir</h2>
            <p class="bubble bot">
              {{
                tickets.length > 1
                  ? `Chaque agent a rédigé un ticket. Voici les ${tickets.length} propositions : laquelle j’ouvre sur GitHub ?`
                  : 'Voici le ticket que je propose d’ouvrir sur GitHub. Je l’ouvre ?'
              }}
            </p>
            <div
              v-if="tickets.length > 1"
              class="choices"
              role="radiogroup"
              aria-label="Ticket à ouvrir"
            >
              <button
                v-for="(t, i) in tickets"
                :key="i"
                type="button"
                role="radio"
                class="choice"
                :aria-checked="chosen === i"
                :disabled="decision !== null"
                @click="chosen = i"
              >
                {{ t.title }}
              </button>
            </div>
            <article class="ticket" data-visit-ticket>
              <p class="ticket-kind">Ticket proposé</p>
              <h3>{{ tickets[chosen]?.title }}</h3>
              <div class="ticket-body">
                <!-- Comark parses asynchronously: Suspense waits for it. -->
                <Suspense
                  ><AnswerMarkdown :key="chosen" :value="tickets[chosen]?.body ?? ''"
                /></Suspense>
              </div>
            </article>
            <div v-if="!decision" class="acts">
              <button type="button" class="btn btn-ink" data-visit-open @click="decide('open')">
                Ouvrir ce ticket
              </button>
              <button type="button" class="btn btn-line" data-visit-no @click="decide('no')">
                Non merci
              </button>
            </div>
            <p v-else class="outcome" role="status" data-visit-outcome>
              <b>Visite : rien n’est parti.</b>
              {{
                decision === 'open'
                  ? 'En vrai, le ticket serait créé sur GitHub à cet instant, exactement comme ci-dessus.'
                  : 'En vrai, rien ne serait envoyé, et votre refus resterait noté avec le run.'
              }}
              <button type="button" class="link" @click="play">Revoir depuis le début</button>
            </p>
            <p class="why">
              C’est le principe de l’outil : l’assistant prépare, une personne décide. Rien
              d’irréversible ne part sans accord.
            </p>
          </div>
        </li>
      </ol>

      <section v-if="run" class="more" aria-labelledby="more-title">
        <h2 id="more-title">Pour les curieux</h2>
        <p>
          Sous le capot : Vue 3 et Nuxt UI pour l’interface, LangGraph pour orchestrer les agents,
          le serveur MCP officiel de GitHub pour les outils, et une validation humaine avant toute
          action. Le code est ouvert.
        </p>
        <p class="brief"><span>La demande exacte :</span> {{ run.history[0]?.brief }}</p>
        <button
          type="button"
          class="btn btn-line"
          :aria-expanded="technical"
          data-visit-technical
          @click="technical = !technical"
        >
          {{ technical ? 'Masquer' : 'Voir' }} comment les agents se sont organisés
        </button>
        <div v-if="technical && model.events > 0" class="canvas">
          <RunScene :model="model" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.visit {
  min-height: 100dvh;
  background: var(--color-paper-2);
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  min-height: 64px;
  padding: var(--space-xs) var(--space-20);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-surface);
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
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  width: min(100% - 2 * var(--space-20), 46rem);
  margin: 0 auto;
  padding: var(--space-xl) 0 var(--space-3xl);
}
.kicker {
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.intro h1 {
  margin-top: var(--space-xs);
  font: 600 var(--text-2xl) / 1.15 var(--font-sans);
  text-wrap: balance;
}
.lede {
  margin-top: var(--space-sm);
  color: var(--color-ink-2);
  font-size: var(--text-md);
  line-height: 1.5;
}
.story {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
.beat {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--space-md);
  padding: var(--space-20);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
  animation: arrive var(--dur-long) var(--ease-out);
}
.beat.now {
  box-shadow:
    var(--shadow-2),
    0 0 0 1.5px var(--color-ink);
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .beat {
    animation: none;
  }
}
.num {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-paper-3);
  font: 600 var(--text-sm) / 1 var(--font-sans);
}
.num.ink {
  background: var(--color-ink);
  color: var(--color-on-ink);
}
.beat h2 {
  font: 600 var(--text-lg) / 1.3 var(--font-sans);
}
.bubble {
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-in);
  font-size: var(--text-md);
  line-height: 1.45;
}
.bubble.you {
  background: var(--color-paper-3);
}
.bubble.bot {
  background: var(--color-paper-2);
  box-shadow: inset 0 0 0 1px var(--color-rule);
}
.plain {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: var(--space-sm) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-sm);
  line-height: 1.45;
}
.tag {
  display: inline-block;
  margin-right: var(--space-xs);
  padding: 0 var(--space-xs);
  border-radius: var(--radius-pill);
  background: var(--color-paper-3);
  font-weight: 600;
}
.time {
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}
.working {
  color: var(--color-muted);
}
.why {
  margin-top: var(--space-sm);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}
.choice {
  min-height: 44px;
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-in);
  background: var(--color-surface);
  color: var(--color-ink);
  font: 500 var(--text-sm) / 1.35 var(--font-sans);
  text-align: left;
  cursor: pointer;
}
.choice[aria-checked='true'] {
  border-color: var(--color-ink);
  box-shadow: inset 0 0 0 1px var(--color-ink);
}
.ticket {
  margin-top: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-in);
  background: var(--color-surface);
}
.ticket-kind {
  color: var(--color-muted);
  font-size: var(--text-xs);
}
.ticket h3 {
  margin-top: var(--space-2xs);
  font: 600 var(--text-md) / 1.35 var(--font-sans);
}
.ticket-body {
  max-height: 16rem;
  margin-top: var(--space-xs);
  overflow-y: auto;
  font-size: var(--text-sm);
}
/* The ticket's own Markdown headings stay small: it is a quoted document. */
.ticket-body :deep(h1),
.ticket-body :deep(h2),
.ticket-body :deep(h3) {
  margin: var(--space-sm) 0 var(--space-2xs);
  font: 600 var(--text-sm) / 1.4 var(--font-sans);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}
.outcome {
  margin-top: var(--space-md);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.link {
  margin-left: var(--space-2xs);
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-ink);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.more {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.more h2 {
  font: 600 var(--text-md) / 1.3 var(--font-sans);
}
.brief span {
  color: var(--color-muted);
}
.more .btn {
  align-self: flex-start;
}
.canvas {
  overflow-x: auto;
  padding: var(--space-md);
  border-radius: var(--radius-card);
  background-color: var(--color-paper);
  background-image: radial-gradient(var(--color-rule-2) 1px, transparent 1.2px);
  background-size: 20px 20px;
}
.alert {
  color: var(--color-error);
}
</style>
