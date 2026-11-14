<script setup lang="ts">
import { ref } from 'vue'
import type { UIMessage } from 'ai'
import ChatPanel from './components/ChatPanel.vue'
import { toMessages, type RunDetail } from './chat/runs'

// The conversation shown: a fresh one, or a reopened run (MEM-18). The key
// remounts the panel, so `useChat` starts on the right thread.
const current = ref<{ key: string; chatId?: string; messages: UIMessage[] }>({
  key: 'fresh-0',
  messages: [],
})
let fresh = 0

function openRun(run: RunDetail) {
  current.value = { key: run.thread_id, chatId: run.thread_id, messages: toMessages(run) }
}

function startFresh() {
  fresh += 1
  current.value = { key: `fresh-${fresh}`, messages: [] }
}
</script>

<template>
  <UApp>
    <!-- The four zones (CLAUDE.md): brand and status line, conversation,
         composer and scene, all in ChatPanel. Earlier runs open in a sheet. -->
    <main class="mx-auto flex h-dvh max-w-6xl flex-col" data-shell>
      <ChatPanel
        :key="current.key"
        :chat-id="current.chatId"
        :initial-messages="current.messages"
        @open="openRun"
        @fresh="startFresh"
      />
    </main>
  </UApp>
</template>
