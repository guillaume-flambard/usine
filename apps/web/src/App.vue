<script setup lang="ts">
import ChatPanel from './components/ChatPanel.vue'
</script>

<template>
  <UApp>
    <!-- The four zones (CLAUDE.md): brand and status line, conversation and
         composer live in ChatPanel; the scene arrives with MEM-17. -->
    <main class="mx-auto flex h-dvh max-w-6xl flex-col" data-shell>
      <ChatPanel />
    </main>
  </UApp>
</template>
