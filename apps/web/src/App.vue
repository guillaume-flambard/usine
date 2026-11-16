<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { UIMessage } from 'ai'
import ChatPanel from './components/ChatPanel.vue'
import DivergentScene from './components/DivergentScene.vue'
import LandingPage from './components/LandingPage.vue'
import VisitPage from './components/VisitPage.vue'
import { fetchRun, toMessages, type RunDetail } from './chat/runs'
import { visit, type Door } from './chat/session'
// Nuxt UI's own labels (a modal's « Close », for one) in French, like the page.
import { fr } from '@nuxt/ui/locale'

// The atelier is closed without a Pocket ID session (MEM-60): the page asks
// before showing anything that would answer 401. A signed-out visitor gets
// the public page (MEM-86).
const door = ref<Door>('checking')
const email = ref<string | undefined>(undefined)
async function checkDoor() {
  door.value = 'checking'
  const who = await visit()
  door.value = who.door
  email.value = who.email
}
// The public visit (/visite) needs no account and calls no API: it replays a
// recorded run. Everything else goes through the door.
const visiting = window.location.pathname.replace(/\/+$/, '') === '/visite'
onMounted(() => {
  if (!visiting) void checkDoor()
})

// The conversation shown: a fresh one, or a reopened run (MEM-18). The key
// remounts the panel, so `useChat` starts on the right thread.
interface Current {
  key: string
  chatId?: string
  messages: UIMessage[]
  title?: string
  createdAt?: string
}
const current = ref<Current>({ key: 'fresh-0', messages: [] })
let fresh = 0

// Mode divergent (MEM-25) : deux branches côte à côte. Quand deux threadIds
// sont actifs, DivergentScene remplace l'atelier.
const divergent = ref<{ leftThreadId: string; rightThreadId: string } | null>(null)
// The last fork, so the atelier can compare again from the original run.
const lastFork = ref<{ leftThreadId: string; rightThreadId: string } | null>(null)

function openRun(run: RunDetail) {
  divergent.value = null
  current.value = {
    key: run.thread_id,
    chatId: run.thread_id,
    messages: toMessages(run),
    title: run.title,
    createdAt: run.created_at,
  }
}

function startFresh() {
  divergent.value = null
  fresh += 1
  current.value = { key: `fresh-${fresh}`, messages: [] }
}

/** Back from the comparison to the original run's conversation. */
async function backToOriginal() {
  const original = divergent.value?.leftThreadId
  divergent.value = null
  if (!original) return
  try {
    openRun(await fetchRun(original))
  } catch {
    startFresh()
  }
}

function onForked(originalThreadId: string, branchThreadId: string) {
  lastFork.value = { leftThreadId: originalThreadId, rightThreadId: branchThreadId }
  divergent.value = lastFork.value
}
</script>

<template>
  <UApp :locale="fr">
    <!-- Signed out: the public page. Signed in: the atelier, its sidebar,
         canvas, inspector and dock (ChatPanel), or the comparison. -->
    <div class="shell" data-shell :data-door="door">
      <VisitPage v-if="visiting" />
      <LandingPage
        v-else-if="door === 'out' || door === 'unreachable'"
        :unreachable="door === 'unreachable'"
        @retry="checkDoor"
      />
      <template v-else-if="door === 'checking'" />
      <DivergentScene
        v-else-if="divergent"
        key="divergent"
        :left-thread-id="divergent.leftThreadId"
        :right-thread-id="divergent.rightThreadId"
        @back="backToOriginal"
      />
      <ChatPanel
        v-else
        :key="current.key"
        :chat-id="current.chatId"
        :initial-messages="current.messages"
        :title="current.title"
        :created-at="current.createdAt"
        :email="email"
        :comparable="Boolean(lastFork && lastFork.leftThreadId === current.chatId)"
        @open="openRun"
        @fresh="startFresh"
        @forked="onForked"
        @compare="divergent = lastFork"
      />
    </div>
  </UApp>
</template>
