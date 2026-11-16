<script setup lang="ts">
/**
 * The atelier (MEM-15, laid out as "Le fil" in MEM-86): a top bar, then the
 * sidebar (runs, checkpoints), the canvas (the run graph, the dock and the
 * composer) and the inspector (the conversation, the action and its gate).
 *
 * Wiring as documented by Nuxt UI 4 for AI SDK v7 (https://ui.nuxt.com/docs/components/chat):
 * `useChat` from @ai-sdk/vue gives messages, status, error, stop and
 * regenerate; UChatMessages, UChatPrompt and UChatPromptSubmit take them as is.
 * An assistant's text parts are rendered as Markdown (AnswerMarkdown, no
 * `v-html`), a person's as plain text; the run events travel as
 * `data-run-event` parts and feed the scene (MEM-17): the latest run's events,
 * replayed into the read model.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChat } from '@ai-sdk/vue'
import type { ChatTransport, UIMessage } from 'ai'
import { chatTransport } from '../chat/transport'
import type { RunEventPayload } from '../contracts/ui-stream'
import { replay } from '../run/readModel'
import { fetchRun, runDate, type RunDetail } from '../chat/runs'
import { initialsOf } from '../chat/session'
import ConversationThread from './ConversationThread.vue'
import RunScene from './RunScene.vue'
import RunsList from './RunsList.vue'
import StepsList from './StepsList.vue'
import ForkPanel from './ForkPanel.vue'
import InspectorPanel from './InspectorPanel.vue'
import type { GateDecisionInput } from './GatePanel.vue'

const props = withDefaults(
  defineProps<{
    transport?: ChatTransport<UIMessage>
    /** A reopened run: its thread id and its turns as messages (MEM-18). */
    chatId?: string
    initialMessages?: UIMessage[]
    /** The reopened run's title and creation date, as the API lists it. */
    title?: string
    createdAt?: string
    /** The account's e-mail, for the avatar's initials. */
    email?: string
    /** A branch of this run exists: the dock can compare the two futures. */
    comparable?: boolean
  }>(),
  {
    transport: () => chatTransport(),
    chatId: undefined,
    initialMessages: () => [],
    title: undefined,
    createdAt: undefined,
    email: undefined,
    comparable: false,
  },
)
const emit = defineEmits<{
  open: [run: RunDetail]
  fresh: []
  forked: [originalThreadId: string, branchThreadId: string]
  compare: []
}>()

const input = ref('')
/**
 * Briefs to start from, filled into the composer, never sent on their own. The
 * first one is real work for the tool agent: the repository it reads is public
 * and its README tells why production stopped updating on 2 November.
 */
const SUGGESTED_BRIEFS = [
  {
    label: 'Pourquoi la production ne bouge plus\u202f?',
    text: 'Lis deployment/README.md du dépôt guillaume-flambard/usine, explique pourquoi la production ne se mettait plus à jour, et propose une issue pour le suivre.',
  },
  {
    label: 'L’annonce de la v2',
    text: "Prépare une annonce de sortie pour la v2 de l'usine, en trois points.",
  },
  {
    label: 'LangGraph ou CrewAI',
    text: 'Compare LangGraph et CrewAI pour orchestrer un agent de support client, en cinq lignes.',
  },
]
const stopped = ref(false)
// The recorded run (MEM-24): without a model, the service replays a run and
// says which brief it can answer. The page shows it rather than letting a
// visitor ask a question nobody recorded.
const replayBrief = ref('')
const forkOpen = ref(false)

onMounted(async () => {
  try {
    const health = (await (await fetch('/health')).json()) as {
      replay?: boolean
      replayBrief?: string
    }
    if (health.replay && health.replayBrief) {
      replayBrief.value = health.replayBrief
      input.value = health.replayBrief
    }
  } catch {
    // No service, or no recording: the composer stays as it is.
  }
})

const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  transport: props.transport,
  // The chat id is the LangGraph thread: a new message on a reopened run
  // continues the same thread.
  ...(props.chatId ? { id: props.chatId } : {}),
  messages: props.initialMessages,
})

const isDecision = (m: UIMessage) =>
  m.role === 'user' && (m.metadata as { gate?: string } | undefined)?.gate !== undefined

/** Where the latest brief starts: a gate decision (MEM-21) is not a new brief. */
const runStart = computed(() => {
  const all = messages.value
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]!
    if (m.role === 'user' && !isDecision(m)) return i
  }
  return -1
})

/** The latest run: every assistant message since the last brief, in stream order. */
const run = computed(() => {
  const events = messages.value
    .slice(runStart.value + 1)
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts)
    .filter((part) => part.type === 'data-run-event')
    .map((part) => (part as { data: RunEventPayload }).data)
  return replay(events)
})

const DECISION_TEXT: Record<GateDecisionInput['decision'], string> = {
  approve: 'Décision : approuver.',
  reject: 'Décision : rejeter.',
  edit: 'Décision : approuver la version modifiée.',
}

// The last decision sent, so a retry goes back to the gate. A plain regenerate
// lost the gate body and sent « Décision : approuver. » to /api/chat as a new
// brief, which started a bogus run (review, 16 November 2026).
const lastDecision = ref<GateDecisionInput | null>(null)
const lastIsDecision = () => {
  const last = messages.value.at(-1)
  return last !== undefined && isDecision(last)
}

function decide(decision: GateDecisionInput) {
  stopped.value = false
  // A decision the service refused stays on screen once, not twice.
  if (status.value === 'error' && lastIsDecision()) messages.value = messages.value.slice(0, -1)
  lastDecision.value = decision
  const text =
    decision.decision === 'reject'
      ? `${DECISION_TEXT.reject} Motif : ${decision.reason}`
      : DECISION_TEXT[decision.decision]
  sendMessage({ text, metadata: { gate: decision.decision } }, { body: { gate: decision } })
}

/** The LangGraph thread of this chat, as the service announced it (MEM-14). */
const threadId = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant')
  const meta = last?.metadata as { threadId?: string } | undefined
  return meta?.threadId ?? props.chatId
})

/** One word for the whole panel, read by tests and assistive tech alike. */
const state = computed(() => (stopped.value && status.value === 'ready' ? 'stopped' : status.value))
const busy = computed(() => state.value === 'submitted' || state.value === 'streaming')

const STATUS_LABELS: Record<string, string> = {
  ready: 'Prêt',
  submitted: 'Envoi au superviseur',
  streaming: 'Le run est en cours',
  error: 'Le run a échoué',
  stopped: 'Arrêté à votre demande',
}

/** The pill says where the run is, in words: the gate outranks "ready". */
const statusText = computed(() => {
  // A refused decision is not a failed run: the run still waits at the gate
  // (review, 16 November 2026: the pill said « Le run a échoué »).
  if ((state.value === 'ready' || state.value === 'error') && run.value.status === 'waiting') {
    return 'En attente de votre accord'
  }
  if (state.value === 'ready' && run.value.status === 'finished') return 'Run terminé'
  if (state.value === 'ready' && run.value.status === 'failed') return 'Run en erreur'
  return STATUS_LABELS[state.value]
})

const SUBMIT_LABELS: Record<string, string> = {
  ready: 'Envoyer',
  stopped: 'Envoyer',
  submitted: 'Arrêter',
  streaming: 'Arrêter',
  error: 'Relancer',
}

// The title and date come from the API: a reopened run brings them, a fresh
// one is read back once the service has indexed it.
const indexed = ref<{ title: string; created_at: string } | null>(null)
const refresh = ref(0)
watch(state, async (now, before) => {
  if (now !== 'ready' || (before !== 'streaming' && before !== 'submitted')) return
  refresh.value += 1
  const id = threadId.value
  if (!id || props.title) return
  try {
    const detail = await fetchRun(id)
    indexed.value = { title: detail.title, created_at: detail.created_at }
  } catch {
    // Not indexed (no database in development): the brief stands in.
  }
})

// When the run stops at the gate, the knot comes into view: at 1440 x 900 it
// sat under the dock, below the fold, at the very moment it matters (review,
// 16 November 2026). Its scroll margin keeps it clear of the dock. A reopened
// run already waiting at the gate counts too, once the scene is mounted.
async function showKnot() {
  if (run.value.status !== 'waiting') return
  await nextTick()
  // The scene lays itself out (dagre, fonts) after it mounts: a scroll asked any
  // earlier lands on a canvas that does not overflow yet. A timer, not a frame:
  // frames stop in a hidden tab.
  await new Promise((done) => setTimeout(done, 60))
  const knot = document.querySelector<HTMLElement>('[data-canvas] [data-node="human_gate"]')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  knot?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
}
watch(() => run.value.status, showKnot)
// An error line under the canvas shortens it: keep the knot in view.
watch(() => error.value, showKnot)
onMounted(showKnot)

const firstBrief = computed(() => {
  const m = messages.value.find((x) => x.role === 'user' && !isDecision(x))
  const part = m?.parts.find((p) => p.type === 'text') as { text: string } | undefined
  return part?.text ?? ''
})
const runTitle = computed(() => props.title ?? indexed.value?.title ?? firstBrief.value)
const runWhen = computed(() => {
  const iso = props.createdAt ?? indexed.value?.created_at
  return iso ? runDate(iso) : ''
})
const initials = computed(() => initialsOf(props.email))

function onSubmit() {
  const text = input.value.trim()
  if (!text) return
  stopped.value = false
  sendMessage({ text })
  input.value = ''
}

function onStop() {
  stopped.value = true
  stop()
}

function onReload() {
  stopped.value = false
  if (lastIsDecision() && lastDecision.value) {
    void regenerate({ body: { gate: lastDecision.value } })
    return
  }
  regenerate()
}

const canReplay = computed(() => messages.value.length > 0 && !busy.value)

function replayRun() {
  if (canReplay.value) onReload()
}

const inspector = ref<InstanceType<typeof InspectorPanel> | null>(null)

// The dock's keys, as its keycaps say: ⌘ or Ctrl with R, K, D. Each takes
// over the browser's own only when the action exists.
function onKey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key === 'r' && canReplay.value) {
    event.preventDefault()
    replayRun()
  } else if (key === 'k' && threadId.value) {
    event.preventDefault()
    forkOpen.value = true
  } else if (key === 'd' && props.comparable) {
    event.preventDefault()
    emit('compare')
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="atelier"
    :class="{ 'has-run': run.events > 0 }"
    data-chat
    :data-chat-state="state"
    :data-thread-id="threadId"
  >
    <header class="bar" data-bar>
      <h1 class="visually-hidden">Atelier Usine</h1>
      <svg class="logo" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path class="s-sky" d="M4.6 2.4C4.6 8.6 7.6 11.4 10.4 13.6" />
        <path class="s-mag" d="M12 2.4V13" />
        <path class="s-grn" d="M19.4 2.4C19.4 8.6 16.4 11.4 13.6 13.6" />
        <circle class="f-ink" cx="12" cy="16.4" r="4.6" />
        <path class="s-ink" d="M12 21v1.8" />
      </svg>
      <nav class="crumb" aria-label="Fil d’Ariane">
        <span>Atelier</span>
        <template v-if="runTitle">
          <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0" aria-hidden="true" />
          <b :title="runTitle">{{ runTitle }}</b>
        </template>
      </nav>
      <p class="state" role="status" aria-live="polite" data-status>{{ statusText }}</p>
      <div class="me">
        <span v-if="runWhen" class="when" data-run-when>{{ runWhen }}</span>
        <span
          v-if="initials"
          class="avatar"
          role="img"
          :aria-label="`Connecté : ${email}`"
          data-avatar
          >{{ initials }}</span
        >
      </div>
    </header>

    <main class="grid">
      <aside class="side" aria-label="Runs et étapes" data-sidebar>
        <RunsList
          :current="threadId"
          :refresh="refresh"
          @open="(r) => emit('open', r)"
          @fresh="emit('fresh')"
        />
        <StepsList v-if="threadId && run.events > 0" :thread-id="threadId" :refresh="refresh" />
      </aside>

      <div class="center">
        <div class="canvas" data-canvas>
          <!-- The scene exists once the run has said something: no empty frame. -->
          <div v-if="run.events > 0" class="scene-wrap" tabindex="0" aria-label="Scène">
            <RunScene :model="run" @decide="inspector?.focusGate()" />
          </div>

          <!-- Before the first event the conversation holds the canvas; after it,
               the graph does, and the conversation moves to the inspector. -->
          <ConversationThread
            v-if="run.events === 0"
            :messages="messages"
            :status="status"
            :briefs="SUGGESTED_BRIEFS"
            @choose="(text) => (input = text)"
          />

          <div v-if="messages.length > 0" class="dock" role="toolbar" aria-label="Actions du run">
            <button
              type="button"
              :disabled="!canReplay"
              aria-keyshortcuts="Meta+R Control+R"
              data-replay
              @click="replayRun"
            >
              <UIcon name="i-lucide-rotate-ccw" class="size-4" aria-hidden="true" />Rejouer<span
                class="kbd"
                aria-hidden="true"
                >⌘R</span
              >
            </button>
            <button
              v-if="threadId"
              type="button"
              aria-keyshortcuts="Meta+K Control+K"
              data-fork-open
              @click="forkOpen = true"
            >
              <UIcon name="i-lucide-git-fork" class="size-4" aria-hidden="true" />Refaire avec un
              autre agent<span class="kbd" aria-hidden="true">⌘K</span>
            </button>
            <button
              v-if="comparable"
              type="button"
              aria-keyshortcuts="Meta+D Control+D"
              data-compare
              @click="emit('compare')"
            >
              <UIcon name="i-lucide-columns-2" class="size-4" aria-hidden="true" />Comparer<span
                class="kbd"
                aria-hidden="true"
                >⌘D</span
              >
            </button>
          </div>
        </div>

        <footer class="composer" data-composer>
          <p v-if="error" class="alert" role="alert" data-chat-error>{{ error.message }}</p>
          <p v-if="replayBrief" class="note" data-replay>
            Run enregistré : aucun modèle n'est branché, le service rejoue des réponses
            enregistrées. Il ne connaît que ce brief.
          </p>
          <UChatPrompt
            v-model="input"
            :status="status"
            :error="error"
            placeholder="Votre brief"
            variant="subtle"
            :ui="{ root: 'rounded-[var(--radius-in)]', base: 'min-h-11 text-base' }"
            data-prompt
            @submit="onSubmit"
          >
            <UChatPromptSubmit
              :status="status"
              size="xl"
              :ui="{ base: 'size-11 min-w-11 shrink-0 justify-center rounded-full' }"
              :aria-label="SUBMIT_LABELS[state]"
              data-submit
              @stop="onStop"
              @reload="onReload"
            />
          </UChatPrompt>
        </footer>
      </div>

      <InspectorPanel
        v-if="run.events > 0"
        ref="inspector"
        :model="run"
        :busy="busy"
        @decide="decide"
      >
        <ConversationThread
          :messages="messages"
          :status="status"
          :briefs="SUGGESTED_BRIEFS"
          @choose="(text) => (input = text)"
        />
      </InspectorPanel>
    </main>

    <ForkPanel
      v-if="threadId"
      v-model:open="forkOpen"
      :thread-id="threadId"
      @forked="(branch) => threadId && emit('forked', threadId, branch)"
    />
  </div>
</template>

<style scoped>
.atelier {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-surface);
}
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-height: 64px;
  padding: 0 var(--space-md) 0 var(--space-20);
  border-bottom: 1px solid var(--color-rule);
}
.logo path {
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
.crumb {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
.crumb b {
  overflow: hidden;
  color: var(--color-ink);
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.state {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-height: 32px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-pill);
  background: var(--color-ink);
  color: var(--color-on-ink);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.me {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-left: auto;
}
.when {
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-paper-3);
  color: var(--color-ink-2);
  font: 600 12px / 1 var(--font-sans);
}

.grid {
  display: grid;
  flex: 1;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 0;
}
.has-run .grid {
  grid-template-columns: 248px minmax(0, 1fr) 436px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-width: 0;
  overflow: auto;
  padding: var(--space-md) var(--space-sm);
  border-right: 1px solid var(--color-rule);
}
.center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background-color: var(--color-paper-2);
  background-image: radial-gradient(var(--color-rule-2) 1px, transparent 1.2px);
  background-size: 20px 20px;
}
.canvas {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-lg);
  min-height: 0;
  overflow: auto;
  padding: var(--space-lg) var(--space-20) 0;
}
/* The scene never shrinks: the canvas scrolls instead. With overflow-x the
   wrap became its own vertical scroller, squeezed by the flex column, and at
   1440 x 900 the gate knot sat under the sticky dock, out of reach
   (audit, 16 November 2026). The bottom padding keeps room for the dock. */
.scene-wrap {
  flex: none;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: calc(44px + var(--space-2xs) * 2 + var(--space-md) * 2);
}
.composer :deep(textarea:focus-visible) {
  outline: 0;
}
.dock {
  position: sticky;
  bottom: var(--space-md);
  z-index: var(--z-raised);
  display: flex;
  align-self: center;
  gap: var(--space-2xs);
  margin-top: auto;
  margin-bottom: var(--space-md);
  padding: var(--space-2xs);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow:
    var(--shadow-3),
    0 0 0 1px var(--color-rule);
  white-space: nowrap;
}
.dock button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  height: 44px;
  padding: 0 var(--space-sm) 0 var(--space-md);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-ink);
  font: 500 var(--text-sm) / 1 var(--font-sans);
  cursor: pointer;
  transition: background-color var(--dur-short) var(--ease-out);
}
.dock button:hover:not(:disabled) {
  background: var(--color-paper-2);
}
.dock button:active:not(:disabled) {
  transform: translateY(1px);
}
.dock button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-20) var(--space-md);
  border-top: 1px solid var(--color-rule);
  background: var(--color-surface);
}
.alert {
  color: var(--color-error);
  font-size: var(--text-sm);
}
.note {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

/* Wide screens: one screen, each column scrolls on its own. */
@media (min-width: 77.5rem) {
  .atelier {
    height: 100dvh;
  }
}

/* Below 1240 px the inspector goes under the canvas and the page scrolls. */
@media (max-width: 77.49rem) {
  .grid,
  .has-run .grid {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .has-run .grid > :deep(.insp) {
    grid-column: 1 / -1;
    border-top: 1px solid var(--color-rule);
    border-left: 0;
  }
  .canvas {
    overflow: visible;
  }
  .composer {
    position: sticky;
    bottom: 0;
    z-index: var(--z-raised);
  }
}

/* Phones: one column, the sidebar reduced to its runs. */
@media (max-width: 47.5rem) {
  .bar {
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-sm);
    padding: var(--space-sm);
  }
  .bar .crumb {
    order: 3;
    flex-basis: 100%;
  }
  .grid,
  .has-run .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    max-height: 18rem;
    padding: var(--space-sm);
    border-right: 0;
    border-bottom: 1px solid var(--color-rule);
  }
  .side > :not(:first-child) {
    display: none;
  }
  .canvas {
    padding: var(--space-md) var(--space-sm) 0;
    background-size: 18px 18px;
  }
  .dock {
    position: static;
    align-self: stretch;
    justify-content: space-between;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--radius-card);
  }
  .dock button {
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2xs);
    height: 56px;
    padding: 0 var(--space-xs);
    font-size: 12px;
  }
  .dock .kbd {
    display: none;
  }
  .composer {
    padding: var(--space-xs) var(--space-sm) var(--space-sm);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock button {
    transition: none;
  }
}
</style>
