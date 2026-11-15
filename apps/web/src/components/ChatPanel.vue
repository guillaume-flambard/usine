<script setup lang="ts">
/**
 * The conversation and the composer (MEM-15), on `POST /api/chat` (MEM-14).
 *
 * Wiring as documented by Nuxt UI 4 for AI SDK v7 (https://ui.nuxt.com/docs/components/chat):
 * `useChat` from @ai-sdk/vue@4.0.165 gives messages, status, error, stop and
 * regenerate; UChatMessages, UChatPrompt and UChatPromptSubmit take them as is.
 * Text parts are rendered by Nuxt UI as plain text (no `v-html`); the run
 * events travel as `data-run-event` parts and feed the scene (MEM-17): the
 * latest assistant message's events, replayed into the read model.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useChat } from '@ai-sdk/vue'
import type { ChatTransport, UIMessage } from 'ai'
import { chatTransport } from '../chat/transport'
import type { RunEventPayload } from '../contracts/ui-stream'
import { replay } from '../run/readModel'
import RunScene from './RunScene.vue'
import RunsSheet from './RunsSheet.vue'
import ForkPanel from './ForkPanel.vue'
import GateDialog, { type GateDecisionInput } from './GateDialog.vue'
import { fetchRun, type RunDetail } from '../chat/runs'

const props = withDefaults(
  defineProps<{
    transport?: ChatTransport<UIMessage>
    /** A reopened run: its thread id and its turns as messages (MEM-18). */
    chatId?: string
    initialMessages?: UIMessage[]
  }>(),
  { transport: () => chatTransport(), chatId: undefined, initialMessages: () => [] },
)
const emit = defineEmits<{ open: [run: RunDetail]; fresh: [] }>()

const input = ref('')
const stopped = ref(false)
// The recorded demo (MEM-24): without a model, the service replays a run and
// says which brief it can answer. The page shows it rather than letting a
// visitor ask a question nobody recorded.
const demoBrief = ref('')
// Forking needs a run: the button only exists once this chat has a thread.
const forkOpen = ref(false)
const forkFailure = ref('')

async function onForked(branch: string) {
  try {
    emit('open', await fetchRun(branch))
  } catch (error) {
    forkFailure.value = (error as Error).message
  }
}

onMounted(async () => {
  try {
    const health = (await (await fetch('/health')).json()) as { demo?: boolean; demoBrief?: string }
    if (health.demo && health.demoBrief) {
      demoBrief.value = health.demoBrief
      input.value = health.demoBrief
    }
  } catch {
    // No service, or no demo: the composer stays as it is.
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

/**
 * The latest run: every assistant message since the last brief, in stream
 * order. A gate decision (MEM-21) is not a new brief: the run it resumes
 * continues in the same scene.
 */
const run = computed(() => {
  const all = messages.value
  let start = 0
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i]!
    if (m.role === 'user' && !isDecision(m)) {
      start = i + 1
      break
    }
  }
  const events = all
    .slice(start)
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts)
    .filter((part) => part.type === 'data-run-event')
    .map((part) => (part as { data: RunEventPayload }).data)
  return replay(events)
})

// The gate opens by itself when the stream announces it, and can be reopened
// from the scene.
const gateOpen = ref(false)
watch(
  () => run.value.status === 'waiting' && Boolean(run.value.gate),
  (waiting) => {
    if (waiting) gateOpen.value = true
  },
)

const DECISION_TEXT: Record<GateDecisionInput['decision'], string> = {
  approve: 'Décision : approuver.',
  reject: 'Décision : rejeter.',
  edit: 'Décision : approuver la version modifiée.',
}

function decide(decision: GateDecisionInput) {
  stopped.value = false
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

const STATUS_LABELS: Record<string, string> = {
  ready: 'Prêt',
  submitted: 'Envoi au superviseur',
  streaming: 'Le run est en cours',
  error: 'Le run a échoué',
  stopped: 'Arrêté à votre demande',
}

const SUBMIT_LABELS: Record<string, string> = {
  ready: 'Envoyer',
  stopped: 'Envoyer',
  submitted: 'Arrêter',
  streaming: 'Arrêter',
  error: 'Relancer',
}

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
  regenerate()
}
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    data-chat
    :data-chat-state="state"
    :data-thread-id="threadId"
  >
    <header class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <h1 class="text-lg font-semibold">L'usine agentique</h1>
      <div class="flex items-center gap-2">
        <p class="text-sm text-muted" role="status" aria-live="polite" data-status>
          {{ STATUS_LABELS[state] }}
        </p>
        <UButton
          v-if="threadId"
          color="neutral"
          variant="outline"
          size="sm"
          label="Forker"
          data-fork-open
          @click="forkOpen = true"
        />
        <RunsSheet @open="(run) => emit('open', run)" @fresh="emit('fresh')" />
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- The scene exists once the run has said something: no empty frame. -->
      <!-- tabindex: a region that scrolls must be reachable by keyboard. -->
      <aside
        v-if="run.events > 0"
        tabindex="0"
        aria-label="Scène"
        class="max-h-64 shrink-0 overflow-auto px-4 lg:order-last lg:max-h-none lg:w-[37rem]"
      >
        <RunScene :model="run" @decide="gateOpen = true" />
        <GateDialog v-if="run.gate" v-model:open="gateOpen" :gate="run.gate" @decide="decide" />
        <ForkPanel
          v-if="threadId"
          v-model:open="forkOpen"
          :thread-id="threadId"
          @forked="onForked"
        />
      </aside>
      <div class="flex min-h-0 flex-1 flex-col">
        <section
          aria-label="Conversation"
          class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4"
          data-conversation
        >
          <p v-if="messages.length === 0" class="m-auto max-w-md text-center text-muted" data-empty>
            Décrivez une tâche. Le superviseur la découpe et confie chaque morceau à un spécialiste.
          </p>
          <UChatMessages v-else :messages="messages" :status="status" should-auto-scroll />
        </section>

        <footer class="flex flex-col gap-2 px-4 pt-2 pb-4" data-composer>
          <p v-if="error" class="text-sm text-error" role="alert" data-chat-error>
            {{ error.message }}
          </p>
          <p v-if="forkFailure" class="text-sm text-error" role="alert" data-fork-failure>
            {{ forkFailure }}
          </p>
          <p v-if="demoBrief" class="text-sm text-toned" data-demo>
            Démonstration enregistrée : ce run rejoue des réponses de modèle, sans modèle branché.
            Elle ne connaît que ce brief.
          </p>
          <UChatPrompt
            v-model="input"
            :status="status"
            :error="error"
            placeholder="Votre brief"
            :ui="{ base: 'min-h-11 text-base' }"
            data-prompt
            @submit="onSubmit"
          >
            <UChatPromptSubmit
              :status="status"
              size="xl"
              :ui="{ base: 'size-11 min-w-11 shrink-0 justify-center' }"
              :aria-label="SUBMIT_LABELS[state]"
              data-submit
              @stop="onStop"
              @reload="onReload"
            />
          </UChatPrompt>
        </footer>
      </div>
    </div>
  </div>
</template>
