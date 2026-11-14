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
import { computed, ref } from 'vue'
import { useChat } from '@ai-sdk/vue'
import type { ChatTransport, UIMessage } from 'ai'
import { chatTransport } from '../chat/transport'
import type { RunEventPayload } from '../contracts/ui-stream'
import { replay } from '../run/readModel'
import RunScene from './RunScene.vue'
import RunsSheet from './RunsSheet.vue'
import type { RunDetail } from '../chat/runs'

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
const { messages, status, error, sendMessage, regenerate, stop } = useChat({
  transport: props.transport,
  // The chat id is the LangGraph thread: a new message on a reopened run
  // continues the same thread.
  ...(props.chatId ? { id: props.chatId } : {}),
  messages: props.initialMessages,
})

/** The latest run: the events of the last assistant message, in stream order. */
const run = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant')
  const events = (last?.parts ?? [])
    .filter((part) => part.type === 'data-run-event')
    .map((part) => (part as { data: RunEventPayload }).data)
  return replay(events)
})

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
        <RunScene :model="run" />
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
