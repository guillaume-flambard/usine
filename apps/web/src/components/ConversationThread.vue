<script setup lang="ts">
/**
 * The conversation (MEM-15): the briefs, the decisions and the answers. Before
 * any message it offers briefs to start from; they fill the composer and send
 * nothing. An assistant's text is Markdown (AnswerMarkdown, no `v-html`), a
 * person's is plain text, and run events are data for the scene, never printed.
 */
import { useId } from 'vue'
import type { ChatStatus, UIMessage } from 'ai'
import AnswerMarkdown from './AnswerMarkdown'

defineProps<{
  messages: UIMessage[]
  status: ChatStatus
  briefs: readonly { label: string; text: string }[]
}>()
const emit = defineEmits<{ choose: [text: string] }>()
const uid = useId()
</script>

<template>
  <section aria-label="Conversation" class="conversation" data-conversation>
    <div v-if="messages.length === 0" class="empty" data-empty>
      <p class="empty-lede">
        Donnez une tâche. Une équipe d’agents la fait avec de vrais outils, et rien ne part sans
        votre accord.
      </p>
      <ul class="briefs" aria-label="Briefs proposés">
        <li v-for="(brief, i) in briefs" :key="brief.label" class="brief">
          <button
            type="button"
            :aria-describedby="`${uid}-brief-${i}`"
            :data-brief="brief.text"
            data-suggestion
            @click="emit('choose', brief.text)"
          >
            {{ brief.label }}
          </button>
          <p :id="`${uid}-brief-${i}`">{{ brief.text }}</p>
        </li>
      </ul>
    </div>
    <UChatMessages v-else :messages="messages" :status="status" should-auto-scroll>
      <template #content="message">
        <template v-for="(part, index) in message.parts" :key="index">
          <!-- Comark parses asynchronously (async setup): Suspense waits for it. -->
          <Suspense v-if="part.type === 'text' && message.role === 'assistant'">
            <AnswerMarkdown
              :value="part.text"
              :streaming="part.state === 'streaming'"
              data-answer
            />
          </Suspense>
          <p v-else-if="part.type === 'text'" class="whitespace-pre-wrap">{{ part.text }}</p>
        </template>
      </template>
    </UChatMessages>
  </section>
</template>

<style scoped>
.conversation {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  max-width: 46rem;
  margin: auto;
  padding: var(--space-2xl) 0;
}
.empty-lede {
  max-width: 30ch;
  font: 400 var(--text-voice) / 1.34 var(--font-serif);
}
.briefs {
  display: grid;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}
.brief {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-in);
  background: var(--color-surface);
  box-shadow:
    inset 0 0 0 1px var(--color-rule),
    var(--shadow-1);
}
.brief button {
  display: block;
  max-width: 100%;
  min-height: 44px;
  margin: calc(-1 * var(--space-xs)) 0 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: 600 var(--text-sm) / 44px var(--font-sans);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.brief button:hover {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}
.brief p {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.45;
}
</style>
