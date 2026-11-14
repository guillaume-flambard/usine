<script setup lang="ts">
import { STACK } from './stack'
</script>

<template>
  <UApp>
    <main class="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6" data-shell>
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">L'usine agentique</h1>
        <p class="text-muted" data-status>Version 2 en construction, branche v2.</p>
      </header>

      <section aria-labelledby="stack-title" class="flex flex-col gap-3">
        <h2 id="stack-title" class="text-lg font-medium">La stack</h2>
        <ul class="flex flex-col gap-2" data-stack>
          <li
            v-for="entry in STACK"
            :key="entry.layer"
            class="flex flex-wrap items-baseline gap-2"
            :data-layer="entry.layer"
          >
            <span class="min-w-32 font-medium">{{ entry.layer }}</span>
            <UBadge
              v-for="tool in entry.tools"
              :key="tool"
              color="neutral"
              variant="subtle"
              :label="tool"
            />
          </li>
        </ul>
      </section>
    </main>
  </UApp>
</template>
