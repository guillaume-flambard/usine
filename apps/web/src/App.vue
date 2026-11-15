<script setup lang="ts">
import { ref } from 'vue'
import type { UIMessage } from 'ai'
import ChatPanel from './components/ChatPanel.vue'
import DivergentScene from './components/DivergentScene.vue'
import { toMessages, type RunDetail } from './chat/runs'

// The conversation shown: a fresh one, or a reopened run (MEM-18). The key
// remounts the panel, so `useChat` starts on the right thread.
const current = ref<{ key: string; chatId?: string; messages: UIMessage[] }>({
  key: 'fresh-0',
  messages: [],
})
let fresh = 0

// Mode divergent (MEM-25) : deux branches côte à côte. Quand deux threadIds
// sont actifs, DivergentScene remplace ChatPanel.
const divergent = ref<{ leftThreadId: string; rightThreadId: string } | null>(null)

function openRun(run: RunDetail) {
  divergent.value = null
  current.value = { key: run.thread_id, chatId: run.thread_id, messages: toMessages(run) }
}

function startFresh() {
  divergent.value = null
  fresh += 1
  current.value = { key: `fresh-${fresh}`, messages: [] }
}

function onForked(originalThreadId: string, branchThreadId: string) {
  divergent.value = { leftThreadId: originalThreadId, rightThreadId: branchThreadId }
}
</script>

<template>
  <UApp>
    <!-- Les quatre zones (CLAUDE.md) : bandeau et statut, conversation,
         compositeur et scène, le tout dans ChatPanel. Les runs précédents
         s'ouvrent dans une feuille. -->
    <main class="mx-auto flex h-dvh max-w-6xl flex-col" data-shell>
      <div v-if="divergent" key="divergent">
        <DivergentScene
          :left-thread-id="divergent.leftThreadId"
          :right-thread-id="divergent.rightThreadId"
        />
      </div>
      <ChatPanel
        v-else
        :key="current.key"
        :chat-id="current.chatId"
        :initial-messages="current.messages"
        @open="openRun"
        @fresh="startFresh"
        @forked="onForked"
      />
    </main>
  </UApp>
</template>
